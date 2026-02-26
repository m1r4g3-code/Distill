import uuid
from datetime import timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ApiKey, Job, JobPage, Page, Extraction
from app.db.session import get_session
from app.dependencies import require_any_scope
from app.middleware.logging import get_request_id


router = APIRouter(tags=["jobs"])


class JobStatusResponse(BaseModel):
    job_id: str
    type: str
    status: str
    created_at: str
    started_at: str | None
    completed_at: str | None
    pages_discovered: int | None = None
    pages_total: int | None = None
    error: dict | None


class MapResultsResponse(BaseModel):
    job_id: str
    type: str
    urls: list[str]
    total: int
    truncated: bool


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    api_key: ApiKey = Depends(require_any_scope(["scrape", "map", "agent"])),
    session: AsyncSession = Depends(get_session),
) -> JobStatusResponse:
    request_id = get_request_id()

    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "JOB_NOT_FOUND",
                    "message": "No job with given ID",
                    "request_id": request_id,
                    "details": {},
                }
            },
        )

    res = await session.execute(select(Job).where(Job.id == jid))
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "JOB_NOT_FOUND",
                    "message": "No job with given ID",
                    "request_id": request_id,
                    "details": {},
                }
            },
        )

    if job.api_key_id != api_key.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "JOB_NOT_FOUND",
                    "message": "No job with given ID",
                    "request_id": request_id,
                    "details": {},
                }
            },
        )

    def _iso(dt):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()

    return JobStatusResponse(
        job_id=str(job.id),
        type=job.type,
        status=job.status,
        created_at=_iso(job.created_at),
        started_at=_iso(job.started_at),
        completed_at=_iso(job.completed_at),
        pages_discovered=job.pages_discovered,
        pages_total=job.pages_total,
        error={"code": job.error_code, "message": job.error_message} if job.error_code else None,
    )


class ExtractionResultsResponse(BaseModel):
    job_id: str
    type: str
    data: Dict[str, Any]


@router.get("/jobs/{job_id}/results")
async def get_job_results(
    job_id: str,
    api_key: ApiKey = Depends(require_any_scope(["scrape", "map", "agent"])),
    session: AsyncSession = Depends(get_session),
):
    request_id = get_request_id()

    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": "No job with given ID", "request_id": request_id}}
        )

    res = await session.execute(select(Job).where(Job.id == jid))
    job = res.scalar_one_or_none()
    if not job or job.api_key_id != api_key.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": "No job with given ID", "request_id": request_id}}
        )

    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "JOB_NOT_READY", "message": f"Job is in state '{job.status}'", "request_id": request_id}}
        )

    if job.type == "map":
        # Handle Map Results
        res = await session.execute(
            select(Page.url)
            .join(JobPage, Page.id == JobPage.page_id)
            .where(JobPage.job_id == jid)
        )
        urls = [row[0] for row in res.all()]
        return {
            "job_id": str(jid),
            "type": "map",
            "urls": urls,
            "total": len(urls)
        }
    elif job.type == "agent_extract":
        # Handle Agent Extraction Results
        res = await session.execute(select(Extraction).where(Extraction.job_id == jid))
        extraction = res.scalar_one_or_none()
        if not extraction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "RESULTS_NOT_FOUND", "message": "No extraction results found", "request_id": request_id}}
            )
        return {
            "job_id": str(jid),
            "type": "agent_extract",
            "data": extraction.data
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "UNSUPPORTED_JOB_TYPE", "message": f"Results for job type '{job.type}' are not supported", "request_id": request_id}}
        )
