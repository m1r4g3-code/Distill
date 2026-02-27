import uuid

from fastapi import APIRouter, Depends, Response, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlparse

from app.config import settings
from app.db.models import ApiKey
from app.db.models import Job
from app.db.session import AsyncSessionLocal, get_session
from app.dependencies import require_scope
from app.middleware.logging import get_request_id
from app.services.crawler import MapConfig, crawl_site
from app.services.url_utils import validate_ssrf
from app.services.job_runner import (
    complete_job,
    compute_idempotency_key,
    create_job,
    get_existing_job_by_idempotency,
    start_job,
)
from arq import create_pool
from arq.connections import RedisSettings


router = APIRouter(tags=["map"])


class MapRequest(BaseModel):
    url: str = Field(..., description="The seed URL to begin mapping from.", examples=["https://example.com/blog"])
    max_depth: int = Field(default=2, ge=0, le=5, description="Maximum link-hop depth to crawl.")
    max_pages: int = Field(default=100, ge=1, le=1000, description="Maximum number of pages to index in this job.")
    include_raw_html: bool = Field(default=False, description="Whether to save the raw HTML in the database for mapped pages.")
    respect_robots: bool = Field(default=True, description="Strictly adhere to the domain's robots.txt rules.")
    use_playwright: str = Field(default="auto", pattern="^(auto|always|never)$", description="Whether to render pages dynamically.")
    timeout_ms: int = Field(default=20000, ge=1000, le=60000, description="Network timeout per page fetch in milliseconds.")
    include_patterns: list[str] = Field(default_factory=list, description="List of URL regex patterns to exclusively include.")
    exclude_patterns: list[str] = Field(default_factory=list, description="List of URL regex patterns to exclude from mapping.")
    concurrency: int = Field(default=5, ge=1, le=10, description="Maximum concurrent connections to the domain.")
    force: bool = False

    @field_validator("url")
    @classmethod
    def validate_url_format(cls, v):
        parsed = urlparse(v)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("URL must start with http:// or https://")
        if not parsed.hostname:
            raise ValueError("URL must contain a valid hostname")
        return v


class MapResponse(BaseModel):
    job_id: str
    status: str
    request_id: str


@router.post(
    "/map",
    response_model=MapResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Map Website Architecture",
    description=(
        "Enqueue an asynchronous job to crawl a website starting from the seed URL. "
        "Respects robots.txt and discovers internal links up to max_depth."
    )
)
async def map_website(
    body: MapRequest,
    response: Response,
    api_key: ApiKey = Depends(require_scope("map")),
    session: AsyncSession = Depends(get_session),
) -> MapResponse:
    request_id = get_request_id()

    # Pre-validate root URL for SSRF
    try:
        await validate_ssrf(body.url)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "SSRF_BLOCKED",
                    "message": str(e),
                    "request_id": request_id,
                    "details": {"url": body.url},
                }
            },
        )

    params = body.model_dump(exclude={"force"})
    idem = compute_idempotency_key(api_key.id, "map", params)

    if not body.force:
        existing = await get_existing_job_by_idempotency(session, idem)
        if existing:
            # Spec: idempotent re-POST returns 200 with the existing job
            response.status_code = 200
            response.headers["X-Idempotency-Hit"] = "true"
            return MapResponse(job_id=str(existing.id), status=existing.status, request_id=request_id)

    job = await create_job(
        session,
        api_key_id=api_key.id,
        job_type="map",
        input_params=params,
        idempotency_key=idem,
    )

    cfg = MapConfig(
        root_url=body.url,
        max_depth=body.max_depth,
        max_pages=body.max_pages,
        include_patterns=body.include_patterns,
        exclude_patterns=body.exclude_patterns,
        concurrency=body.concurrency,
        domain_delay_ms=settings.domain_delay_ms,
        respect_robots=body.respect_robots,
    )

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("run_map_job", job.id)

    return MapResponse(job_id=str(job.id), status=job.status, request_id=request_id)


@router.get("/map/{job_id}", response_model=MapResponse)
async def get_map_status(
    job_id: str,
    api_key: ApiKey = Depends(require_scope("map")),
    session: AsyncSession = Depends(get_session),
) -> MapResponse:
    request_id = get_request_id()

    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "JOB_NOT_FOUND",
                    "message": "No job with given ID",
                    "request_id": request_id,
                    "details": {"job_id": job_id},
                }
            },
        )

    res = await session.execute(select(Job).where(Job.id == job_uuid))
    job = res.scalar_one_or_none()

    if not job or job.api_key_id != api_key.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "JOB_NOT_FOUND",
                    "message": "No job with given ID",
                    "request_id": request_id,
                    "details": {"job_id": str(job_uuid)},
                }
            },
        )

    return MapResponse(job_id=str(job.id), status=job.status, request_id=request_id)
