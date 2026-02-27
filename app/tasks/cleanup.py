import asyncio
from datetime import datetime, timezone
import structlog
from sqlalchemy import delete
from app.db.session import AsyncSessionLocal
from app.db.models import Job
from app.config import settings

log = structlog.get_logger("cleanup_task")

async def purge_expired_jobs():
    """Deletes jobs where created_at or completed_at indicates they are expired."""
    # Since the spec calls for checking `expires_at < NOW()`, but the current MVP Job model
    # only has created_at, started_at, completed_at, we will infer expiry as older than
    # the configured cleanup interval.
    # We will enforce this on completed/failed jobs specifically to avoid deleting queued ones.
    
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=settings.job_cleanup_interval_hours)
    
    async with AsyncSessionLocal() as session:
        try:
            stmt = delete(Job).where(
                Job.status.in_(["completed", "failed"]),
                Job.completed_at != None,
                Job.completed_at < cutoff
            )
            result = await session.execute(stmt)
            await session.commit()
            
            deleted_count = result.rowcount
            if deleted_count > 0:
                log.info("jobs.purged", count=deleted_count, cutoff=cutoff.isoformat())
        except Exception as e:
            log.error("jobs.purge_failed", error=str(e))
            await session.rollback()

async def run_cleanup_loop():
    """Background loop that periodically fires the cleanup."""
    log.info("cleanup_loop.started", interval_hours=settings.job_cleanup_interval_hours)
    while True:
        try:
            await purge_expired_jobs()
        except Exception as e:
            log.error("cleanup_loop.error", error=str(e))
            
        await asyncio.sleep(settings.job_cleanup_interval_hours * 3600)
