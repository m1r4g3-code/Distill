from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Job

async def save_job(
    session: AsyncSession,
    api_key_id,
    type: str,
    status: str,
    input_params: dict,
    progress: dict = None,
    error_message: str = None,
    job_id=None
) -> Job:
    """Helper to consistently save jobs to the database across all routers."""
    now = datetime.now(timezone.utc)
    
    job = Job(
        id=job_id or uuid4(),
        api_key_id=api_key_id,
        type=type,
        status=status,
        input_params=input_params,
        progress=progress,
        error_message=error_message,
        created_at=now,
        completed_at=now if status in ('completed', 'failed') else None
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job
