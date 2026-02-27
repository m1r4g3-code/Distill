import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from app.db.models import ApiKey, Job, Extraction, Page
from app.db.session import AsyncSessionLocal, get_session
from app.dependencies import require_scope
from app.middleware.logging import get_request_id
from app.services.fetcher import fetch_url
from app.services.robots import is_allowed_by_robots_async
from app.services.extractor import clean_html, extract_content, html_to_markdown
from app.services.llm import extract_structured_data
from app.services.job_runner import (
    create_job,
    start_job,
    complete_job,
    fail_job,
    compute_idempotency_key,
    get_existing_job_by_idempotency,
)
from app.services.url_utils import validate_ssrf, normalize_url
from app.config import settings
from arq import create_pool
from arq.connections import RedisSettings

router = APIRouter(tags=["agent"])

class AgentExtractRequest(BaseModel):
    url: str = Field(..., description="The highly qualified URL for the agent to fetch and extract data from.", examples=["https://en.wikipedia.org/wiki/Web_scraping"])
    prompt: str = Field(..., description="The instruction provided to the multi-modal agent.", examples=["Extract the main definition of the topic in two sentences."])
    schema_definition: dict | None = Field(default=None, description="An optional JSON Schema dictionary used to forcefully structure the LLM output.")
    use_playwright: str = Field(default="auto", pattern="^(auto|always|never)$", description="Whether to employ Playwright for dynamically rendering JS applications.")
    timeout_ms: int = Field(default=30000, ge=1000, le=60000, description="Network timeout threshold in milliseconds.")
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

class AgentExtractResponse(BaseModel):
    job_id: str
    status: str
    request_id: str

@router.post(
    "/agent/extract",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Agent Data Extraction",
    description=(
        "Dispatch a serverless multi-modal agent to perform intelligent entity/data extraction "
        "on the target URL using the provided natural language prompt."
    )
)
async def agent_extract(
    body: AgentExtractRequest,
    response: Response,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
) -> AgentExtractResponse:
    request_id = get_request_id()

    # Pre-validate URL for SSRF
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
    idem = compute_idempotency_key(api_key.id, "agent_extract", params)

    if not body.force:
        existing = await get_existing_job_by_idempotency(session, idem)
        if existing:
            response.status_code = 200
            response.headers["X-Idempotency-Hit"] = "true"
            return AgentExtractResponse(job_id=str(existing.id), status=existing.status, request_id=request_id)

    job = await create_job(
        session,
        api_key_id=api_key.id,
        job_type="agent_extract",
        input_params=params,
        idempotency_key=idem,
    )

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("run_agent_job", job.id)
    
    return AgentExtractResponse(job_id=str(job.id), status=job.status, request_id=request_id)
