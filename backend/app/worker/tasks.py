"""
tasks.py — Background job handlers for map, agent, and scrape jobs.

Upgraded to use browser.py stealth fetch for rich content extraction
across all endpoints (map BFS crawl, agent LLM extraction, scrape fallback).
"""
import structlog
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any
from collections import deque
from urllib.parse import urlparse
from fastapi.encoders import jsonable_encoder

from app.db.session import AsyncSessionLocal
from app.db.models import Job, Extraction

from app.services.browser import fetch_page
from app.services.llm import extract_structured_data, LLMExtractionError
from app.utils.text import sanitize_text

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
    """Fallback scrape execution using the stealth browser."""
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
    BFS crawl using stealth browser to discover all URLs on a site.
    Updates job progress as pages are discovered.
    """
    logger.info("job.map.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        await update_job_progress(job_id, {"pages_crawled": 0, "pages_total": None})

        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if not job:
                return
            params = job.input_params

        root_url = params.get("url")
        max_pages = params.get("max_pages", 50)
        max_depth = params.get("max_depth", 3)

        base = urlparse(root_url)
        base_domain = base.netloc

        visited: set[str] = set()
        found_urls: list[str] = []
        queue: deque[tuple[str, int]] = deque([(root_url, 0)])

        while queue and len(visited) < max_pages:
            current_url, depth = queue.popleft()

            if current_url in visited:
                continue
            if depth > max_depth:
                continue
            if urlparse(current_url).netloc != base_domain:
                continue

            visited.add(current_url)
            found_urls.append(current_url)

            logger.info(
                "map.crawling",
                url=current_url,
                depth=depth,
                found=len(found_urls),
                job_id=job_id,
            )

            await update_job_progress(
                job_id,
                {
                    "pages_crawled": len(found_urls),
                    "pages_total": max_pages,
                    "current_url": current_url,
                }
            )

            try:
                page_data = await fetch_page(
                    current_url,
                    wait_for_idle=False,
                    extra_wait_ms=500,
                )
                internal_links = page_data["links"]["internal"]
                for link in internal_links:
                    clean = link.split("#")[0].rstrip("/")
                    if clean and clean not in visited:
                        queue.append((clean, depth + 1))
            except Exception as e:
                logger.error("map.page_error", url=current_url, error=str(e), job_id=job_id)
                continue

            import asyncio
            await asyncio.sleep(0.3)  # be polite to the target server

        result = {
            "url": root_url,
            "total_urls": len(found_urls),
            "urls": found_urls,
            "pages_crawled": len(visited),
        }

        # Persist discovered page count to the job row
        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            job = await session.get(Job, job_uuid)
            if job:
                job.pages_discovered = len(found_urls)
                await session.commit()

        await update_job_status(job_id, "completed", result=result)
    except Exception as e:
        logger.exception("job.map.failed", job_id=job_id)
        await update_job_status(job_id, "failed", error=str(e))


async def run_agent_job(ctx: dict, job_id: str) -> None:
    """
    Scrapes the target URL with stealth browser, then uses Gemini
    to extract structured data based on the provided prompt.
    """
    logger.info("job.agent.start", job_id=job_id)
    await update_job_status(job_id, "running")
    try:
        await update_job_progress(job_id, {"stage": "initializing"})

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
        page_data = await fetch_page(url, wait_for_idle=True, extra_wait_ms=1500)
        content = sanitize_text(page_data["markdown"])

        if not content or len(content.split()) < 20:
            raise LLMExtractionError(
                "Page content too thin to extract from. "
                "The site may be blocking access."
            )

        await update_job_progress(job_id, {"stage": "extracting", "word_count": page_data["word_count"]})

        extracted = await extract_structured_data(
            content=content[:12000],
            prompt=prompt,
            schema=schema,
        )

        result = {
            "url": url,
            "prompt": prompt,
            "schema": schema,
            "extracted": extracted,
            "word_count": page_data["word_count"],
            "pages_scraped": 1,
        }

        await update_job_progress(job_id, {"stage": "saving"})

        # Persist to Extractions table so GET /jobs/{id}/results works
        async with AsyncSessionLocal() as session:
            job_uuid = _uuid.UUID(str(job_id))
            extraction = Extraction(
                job_id=job_uuid,
                data=extracted,
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
