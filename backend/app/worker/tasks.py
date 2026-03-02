import structlog
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any
from fastapi.encoders import jsonable_encoder

from app.db.session import AsyncSessionLocal
from app.db.models import Job, Extraction

from app.services.fetcher import fetch_url
from app.services.crawler import crawl_site, MapConfig
from app.services.llm import extract_structured_data

logger = structlog.get_logger("app.tasks")


async def update_job_status(job_id: str, status: str, result: Any = None, error: str | None = None) -> None:
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
    """Fallback scrape execution inside ARQ if timeout extends."""
    logger.info("job.scrape.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        await update_job_progress(job_id, {"stage": "executing"})
        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return

            url = job.input_params.get("url")
            use_playwright = job.input_params.get("use_playwright", "auto")
            pw_pool = ctx.get("pw_pool")

            await update_job_progress(job_id, {"stage": "fetching", "url": url})
            fetched = await fetch_url(url, timeout_ms=30000, use_playwright=use_playwright, pw_pool=pw_pool)
            await update_job_progress(job_id, {"stage": "completed", "duration_ms": fetched.duration_ms})

            result = {
                "metadata": {
                    "source_url": url,
                    "final_url": fetched.final_url,
                    "renderer": fetched.renderer,
                    "duration_ms": fetched.duration_ms,
                    "status_code": fetched.status_code,
                },
                "markdown": fetched.text[:500] + "..." if fetched.text else "",
            }

        await update_job_status(job_id, "completed", result=result)
    except Exception as e:
        logger.exception("job.scrape.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))


async def run_map_job(ctx: dict, job_id: str) -> None:
    """Runs a recursive BFS crawler for mapping a domain."""
    logger.info("job.map.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        await update_job_progress(job_id, {"pages_crawled": 0, "pages_total": None})

        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return

            cfg = MapConfig(
                root_url=job.input_params.get("url"),
                max_depth=job.input_params.get("max_depth", 2),
                max_pages=job.input_params.get("max_pages", 100),
                include_patterns=job.input_params.get("include_patterns", []),
                exclude_patterns=job.input_params.get("exclude_patterns", []),
                concurrency=job.input_params.get("concurrency", 5),
                domain_delay_ms=job.input_params.get("domain_delay_ms", 1000),
                respect_robots=job.input_params.get("respect_robots", True),
            )

            pw_pool = ctx.get("pw_pool")
            await crawl_site(session, job, cfg, pw_pool=pw_pool)

        await update_job_status(job_id, "completed")
    except Exception as e:
        logger.exception("job.map.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))


async def run_agent_job(ctx: dict, job_id: str) -> None:
    """Runs LLM pipelining for extracting structured JSON from scraped data."""
    logger.info("job.agent.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        await update_job_progress(job_id, {"stage": "initializing"})

        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return

            url = job.input_params.get("url")
            prompt = job.input_params.get("prompt")
            schema = job.input_params.get("schema_definition")
            use_playwright = job.input_params.get("use_playwright", "auto")
            pw_pool = ctx.get("pw_pool")

            await update_job_progress(job_id, {"stage": "fetching", "url": url})
            fetched = await fetch_url(url, timeout_ms=30000, use_playwright=use_playwright, pw_pool=pw_pool)

            await update_job_progress(job_id, {"stage": "extracting", "renderer": fetched.renderer})

            # Convert HTML → markdown for the LLM
            from app.services.extractor import extract_content, clean_html, html_to_markdown
            cleaned = clean_html(fetched.text)
            content = extract_content(cleaned)
            markdown = html_to_markdown(content)

            result = await extract_structured_data(
                text=markdown,
                prompt=prompt,
                schema_=schema,
                image_url=None,
            )

            await update_job_progress(job_id, {"stage": "saving"})

            # Persist to Extractions table so GET /jobs/{id}/results works
            extraction = Extraction(
                job_id=job_uuid,
                data=result.data if hasattr(result, "data") else result,
                prompt=prompt or "agent_extract",
            )
            session.add(extraction)
            job.pages_discovered = 1
            await session.commit()

        await update_job_status(job_id, "completed")
    except Exception as e:
        logger.exception("job.agent.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))
