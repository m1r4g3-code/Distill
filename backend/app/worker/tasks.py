"""
tasks.py — Background job handlers for map, agent_extract, and scrape jobs.

Each handler delegates to the appropriate service function.
"""
import structlog
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any
from fastapi.encoders import jsonable_encoder

from app.db.session import AsyncSessionLocal
from app.db.models import Job, Extraction

logger = structlog.get_logger("app.tasks")


async def update_job_status(
    job_id: str,
    status: str,
    result: Any = None,
    error: str | None = None,
) -> None:
    """Updates the core status, result, and error of a job."""
    async with AsyncSessionLocal() as session:
        try:
            job_uuid = _uuid.UUID(str(job_id))
        except (ValueError, AttributeError):
            logger.error("update_job_status.bad_uuid", job_id=job_id)
            return
        job = await session.get(Job, job_uuid)
        if job:
            job.status = status
            if status in ("completed", "failed"):
                job.completed_at = datetime.now(timezone.utc)
            if result is not None:
                job.progress = {"result": jsonable_encoder(result)}
            if error is not None:
                job.error_code = "TASK_ERROR"
                job.error_message = error
            await session.commit()


async def update_job_progress(job_id: str, progress: dict[str, Any]) -> None:
    """Updates real-time JSON tracker for progress fields."""
    async with AsyncSessionLocal() as session:
        try:
            job_uuid = _uuid.UUID(str(job_id))
        except (ValueError, AttributeError):
            return
        job = await session.get(Job, job_uuid)
        if job:
            if not isinstance(job.progress, dict):
                job.progress = {}
            job.progress.update(progress)
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(job, "progress")
            await session.commit()


async def run_scrape_job(ctx: dict, job_id: str) -> None:
    """Fallback scrape execution using the stealth browser."""
    logger.info("job.scrape.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        from app.services.browser import fetch_page
        from app.utils.text import sanitize_text

        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return
            url = job.input_params.get("url")

        await update_job_progress(job_id, {"stage": "fetching", "url": url})
        page_data = await fetch_page(url, wait_for_idle=True, extra_wait_ms=1500)
        markdown = sanitize_text(page_data["markdown"])

        result = {
            "url": url,
            "status_code": page_data["status_code"],
            "title": page_data["metadata"].get("title", ""),
            "markdown": markdown,
            "metadata": {
                "description": page_data["metadata"].get("description"),
                "og_image": page_data["metadata"].get("og_image"),
                "og_title": page_data["metadata"].get("og_title"),
                "author": page_data["metadata"].get("author"),
                "site_name": page_data["metadata"].get("og_site_name"),
                "language": page_data["metadata"].get("language"),
                "word_count": page_data["word_count"],
                "read_time_minutes": max(1, page_data["word_count"] // 200),
            },
            "links": page_data["links"],
        }

        await update_job_progress(job_id, {"stage": "completed", "word_count": page_data["word_count"]})
        await update_job_status(job_id, "completed", result=result)
    except Exception as e:
        logger.exception("job.scrape.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))


async def run_map_job(ctx: dict, job_id: str) -> None:
    """
    BFS crawl using map_service.map_site to discover all URLs on a site.
    """
    logger.info("job.map.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        from app.services.map_service import map_site

        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return
            params = job.input_params

        url = params.get("url")
        max_pages = params.get("max_pages", 50)
        max_depth = params.get("max_depth", 3)

        await update_job_progress(job_id, {"stage": "crawling", "url": url})

        result = await map_site(
            url=url,
            max_pages=max_pages,
            max_depth=max_depth,
        )

        # Persist discovered page count to the job row
        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if job:
                job.pages_discovered = result.get("total_urls", 0)
                await session.commit()

        await update_job_status(job_id, "completed", result=result)
    except Exception as e:
        logger.exception("job.map.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))


async def run_agent_job(ctx: dict, job_id: str) -> None:
    """
    Scrapes the target URL then extracts structured data using Gemini.
    Delegates to agent_service.extract_structured_data.
    """
    logger.info("job.agent.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        from app.services.agent_service import extract_structured_data

        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return
            params = job.input_params

        url = params.get("url")
        prompt = params.get("prompt")
        schema = params.get("schema_definition")

        await update_job_progress(job_id, {"stage": "fetching", "url": url})

        result = await extract_structured_data(
            url=url,
            prompt=prompt,
            schema=schema,
        )

        await update_job_progress(job_id, {"stage": "saving"})

        # Persist to Extractions table so GET /jobs/{id}/results works
        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            extraction = Extraction(
                job_id=job_uuid,
                data=result.get("extracted", result),
                prompt=prompt or "agent_extract",
            )
            session.add(extraction)
            job_row = await session.get(Job, job_uuid)
            if job_row:
                job_row.pages_discovered = 1
            await session.commit()

        await update_job_status(job_id, "completed", result=result)
    except Exception as e:
        logger.exception("job.agent.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))
