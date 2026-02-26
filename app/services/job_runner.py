import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Job


_tasks: dict[uuid.UUID, asyncio.Task] = {}


def compute_idempotency_key(api_key_id: uuid.UUID, job_type: str, params: dict) -> str:
    canonical = json.dumps(params, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    raw = f"{api_key_id}:{job_type}:{canonical}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def get_existing_job_by_idempotency(
    session: AsyncSession, idempotency_key: str
) -> Job | None:
    res = await session.execute(select(Job).where(Job.idempotency_key == idempotency_key))
    job = res.scalar_one_or_none()
    if job and job.status != "failed":
        return job
    return None


async def create_job(
    session: AsyncSession,
    *,
    api_key_id: uuid.UUID,
    job_type: str,
    input_params: dict,
    idempotency_key: str | None,
) -> Job:
    job = Job(
        api_key_id=api_key_id,
        type=job_type,
        status="queued",
        input_params=input_params,
        idempotency_key=idempotency_key,
        created_at=datetime.now(timezone.utc),
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def start_job(session: AsyncSession, job: Job) -> None:
    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    await session.commit()


async def complete_job(session: AsyncSession, job: Job) -> None:
    job.status = "completed"
    job.completed_at = datetime.now(timezone.utc)
    await session.commit()


async def fail_job(session: AsyncSession, job: Job, error_code: str, error_message: str) -> None:
    job.status = "failed"
    job.error_code = error_code
    job.error_message = error_message
    job.completed_at = datetime.now(timezone.utc)
    await session.commit()


def run_in_background(job_id: uuid.UUID, coro) -> None:
    task = asyncio.create_task(coro)
    _tasks[job_id] = task
