import asyncio
import structlog
from datetime import datetime, timezone
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import Job
from app.worker.tasks import run_scrape_job, run_map_job, run_agent_job
from app.worker.playwright_pool import PlaywrightBrowserPool

logger = structlog.get_logger("app.sql_worker")

# Global pool for the worker process
pw_pool = None

async def start_worker():
    """SQL-based polling worker for jobs."""
    global pw_pool
    logger.info("Job worker started")
    
    pw_pool = PlaywrightBrowserPool(max_contexts=3)
    try:
        await pw_pool.start()
    except Exception as e:
        logger.error(f"Failed to start Playwright pool: {e}")
        
    ctx = {"pw_pool": pw_pool}
    
    while True:
        try:
            await process_next_job(ctx)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Worker error: {e}")
        await asyncio.sleep(2)  # Check every 2 seconds

    if pw_pool:
        await pw_pool.stop()

async def process_next_job(ctx: dict):
    async with AsyncSessionLocal() as session:
        # Get oldest queued job
        result = await session.execute(
            select(Job)
            .where(Job.status == 'queued')
            .order_by(Job.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        job = result.scalar_one_or_none()
        
        if not job:
            return  # No jobs to process
            
        # Mark as running immediately
        job.status = 'running'
        job.started_at = datetime.now(timezone.utc)
        job_id_str = str(job.id)
        job_type = job.type
        await session.commit()
        
    logger.info(f"Processing job {job_id_str} type={job_type}")
    
    try:
        if job_type == 'map':
            await run_map_job(ctx, job_id_str)
        elif job_type == 'agent_extract':
            await run_agent_job(ctx, job_id_str)
        elif job_type == 'scrape':
            await run_scrape_job(ctx, job_id_str)
        else:
            logger.error(f"Unknown job type: {job_type}")
            async with AsyncSessionLocal() as session:
                job = await session.get(Job, job.id)
                if job:
                    job.status = 'failed'
                    job.error_message = f"Unknown job type: {job_type}"
                    job.completed_at = datetime.now(timezone.utc)
                    await session.commit()
    except Exception as e:
        logger.error(f"Job {job_id_str} hard failed: {e}")
        async with AsyncSessionLocal() as session:
            job = await session.get(Job, job.id)
            if job and job.status != 'failed':
                job.status = 'failed'
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await session.commit()
