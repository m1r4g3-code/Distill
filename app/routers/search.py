import asyncio
import re
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ApiKey, Job, Extraction
from app.db.session import AsyncSessionLocal, get_session
from app.dependencies import require_scope
from app.middleware.logging import get_request_id
from app.services.extractor import clean_html, extract_content, html_to_markdown
from app.services.fetcher import fetch_url
from app.services.robots import is_allowed_by_robots_async
from app.services.search_provider import SearchResult, search
from app.services.url_utils import SSRFBlockedError, normalize_url, validate_ssrf
from app.services.job_runner import (
    create_job,
    start_job,
    complete_job,
    fail_job,
    compute_idempotency_key,
    get_existing_job_by_idempotency,
    run_in_background,
)


router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    query: str
    num_results: int = Field(default=10, ge=1, le=20)
    scrape_top_n: int = Field(default=0, ge=0, le=10)
    search_provider: str = Field(default="auto")
    respect_robots: bool = False


class ScrapedModel(BaseModel):
    markdown: str
    title: str | None = None


class SearchResultModel(BaseModel):
    rank: int
    title: str
    url: str
    snippet: str | None
    scraped: ScrapedModel | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultModel]
    request_id: str
    task_id: str | None = None
    scrape_status: str | None = None
    message: str | None = None


class SearchTaskResultResponse(BaseModel):
    task_id: str
    scrape_status: str
    results: list[dict] | None = None


def _parse_title(html_text: str) -> str | None:
    m = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.I | re.S)
    if not m:
        return None
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    return title or None


async def _scrape_for_search(url: str, respect_robots: bool = False) -> ScrapedModel:
    try:
        validate_ssrf(url)
    except SSRFBlockedError as e:
        return None  # Silently skip for search batch

    normalized = normalize_url(url)

    if respect_robots:
        allowed = await is_allowed_by_robots_async(normalized)
        if not allowed:
            return None

    try:
        fetched = await fetch_url(normalized, timeout_ms=20000, use_playwright="auto")
        raw_html = fetched.text
        cleaned = clean_html(raw_html)
        extracted_html = extract_content(cleaned)
        markdown = html_to_markdown(extracted_html)
        return ScrapedModel(markdown=markdown, title=_parse_title(raw_html))
    except Exception:
        return None


async def _background_scrape_search(job_id: uuid.UUID, search_results: list[SearchResult], respect_robots: bool):
    async with AsyncSessionLocal() as session:
        # Get job
        res = await session.execute(select(Job).where(Job.id == job_id))
        job = res.scalar_one()
        
        await start_job(session, job)
        
        try:
            scraped_results = []
            # Scrape each result
            tasks = [_scrape_for_search(r.url, respect_robots) for r in search_results]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for r, s in zip(search_results, results, strict=False):
                if not isinstance(s, Exception) and s is not None:
                    scraped_results.append({
                        "rank": r.rank,
                        "url": r.url,
                        "scraped": {"markdown": s.markdown, "title": s.title}
                    })
                else:
                    scraped_results.append({
                        "rank": r.rank,
                        "url": r.url,
                        "scraped": None
                    })
            
            # Store in extractions table
            extraction = Extraction(
                job_id=job_id,
                data={"results": scraped_results},
                prompt="Search background scrape"
            )
            session.add(extraction)
            await complete_job(session, job)
        except Exception as e:
            await fail_job(session, job, "SEARCH_SCRAPE_FAILED", str(e))


@router.post("/search", response_model=SearchResponse)
async def search_endpoint(
    body: SearchRequest,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
) -> SearchResponse:
    request_id = get_request_id()

    # Perform search
    try:
        results = await search(body.query, body.num_results)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "SEARCH_ERROR", "message": f"Search failed: {str(e)}", "request_id": request_id}
        )

    out_results = [
        SearchResultModel(
            rank=r.rank,
            title=r.title,
            url=r.url,
            snippet=r.snippet
        ) for r in results
    ]

    if body.scrape_top_n > 0:
        # Async background scrape
        params = body.model_dump()
        idem = compute_idempotency_key(api_key.id, "search_scrape", params)
        
        # Check for existing job
        existing = await get_existing_job_by_idempotency(session, idem)
        if existing:
            return SearchResponse(
                query=body.query,
                results=out_results,
                request_id=request_id,
                task_id=str(existing.id),
                scrape_status=existing.status,
                message="Background scraping already in progress or completed."
            )

        # Create job
        job = await create_job(
            session,
            api_key_id=api_key.id,
            job_type="search_scrape",
            input_params=params,
            idempotency_key=idem
        )
        
        # Run background scrape
        top_results = results[:body.scrape_top_n]
        run_in_background(job.id, _background_scrape_search(job.id, top_results, body.respect_robots))
        
        return SearchResponse(
            query=body.query,
            results=out_results,
            request_id=request_id,
            task_id=str(job.id),
            scrape_status="processing",
            message="Search results returned immediately. Poll /api/v1/search/results/task_id for scraped content."
        )

    # Sync behavior (scrape_top_n = 0)
    return SearchResponse(query=body.query, results=out_results, request_id=request_id)


@router.get("/search/results/{task_id}", response_model=SearchTaskResultResponse)
async def get_search_results(
    task_id: str,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
):
    request_id = get_request_id()
    try:
        jid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task_id")

    res = await session.execute(select(Job).where(Job.id == jid))
    job = res.scalar_one_or_none()
    
    if not job or job.api_key_id != api_key.id or job.type != "search_scrape":
        raise HTTPException(status_code=404, detail="Task not found")

    response_data = {
        "task_id": str(jid),
        "scrape_status": job.status
    }

    if job.status == "completed":
        res = await session.execute(select(Extraction).where(Extraction.job_id == jid))
        extraction = res.scalar_one_or_none()
        if extraction:
            response_data["results"] = extraction.data.get("results")

    return response_data
