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
    run_in_background,
)
from app.services.url_utils import validate_ssrf, normalize_url

router = APIRouter(tags=["agent"])

class AgentExtractRequest(BaseModel):
    url: str
    prompt: str
    schema_: Optional[Dict[str, Any]] = Field(None, alias="schema")
    use_playwright: str = Field(default="auto", pattern="^(auto|always|never)$")
    respect_robots: bool = False
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

@router.post("/agent/extract", status_code=202, response_model=AgentExtractResponse)
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

    async def _job_coro(job_id: uuid.UUID, url: str, prompt: str, schema: Optional[Dict[str, Any]], use_playwright: str, respect_robots: bool):
        async with AsyncSessionLocal() as job_session:
            # Re-fetch job object in this session
            from sqlalchemy import select
            res = await job_session.execute(select(Job).where(Job.id == job_id))
            job_obj = res.scalar_one()
            
            try:
                await start_job(job_session, job_obj)
                
                # 1. Fetch
                normalized = normalize_url(url)

                if respect_robots:
                    allowed = await is_allowed_by_robots_async(normalized)
                    if not allowed:
                        await fail_job(job_session, job_obj, "ROBOTS_BLOCKED", "robots.txt disallows this URL")
                        return

                fetched = await fetch_url(normalized, timeout_ms=30000, use_playwright=use_playwright)
                
                # 2. Extract Markdown
                cleaned = clean_html(fetched.text)
                content_result = extract_content(cleaned)
                markdown = html_to_markdown(content_result)
                
                # 3. LLM Extraction
                structured_data = await extract_structured_data(markdown, prompt, schema)
                
                # 4. Save result in extractions table
                # We can also save the page if it doesn't exist, but for MVP let's just save extraction
                extraction = Extraction(
                    job_id=job_id,
                    data=structured_data,
                    prompt=prompt
                )
                job_session.add(extraction)
                
                await complete_job(job_session, job_obj)
            except Exception as e:
                await fail_job(job_session, job_obj, "EXTRACTION_FAILED", str(e))

    run_in_background(job.id, _job_coro(job.id, body.url, body.prompt, body.schema_, body.use_playwright, body.respect_robots))

    return AgentExtractResponse(job_id=str(job.id), status=job.status, request_id=request_id)
