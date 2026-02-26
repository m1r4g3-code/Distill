import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ApiKey
from app.db.session import get_session
from app.dependencies import require_scope
from app.middleware.logging import get_request_id
from app.services.extractor import clean_html, extract_content, html_to_markdown
from app.services.fetcher import fetch_url
from app.services.robots import is_allowed_by_robots_async
from app.services.search_provider import SearchResult, search_serper
from app.services.url_utils import SSRFBlockedError, normalize_url, validate_ssrf


router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    query: str
    num_results: int = Field(default=10, ge=1, le=20)
    scrape_top_n: int = Field(default=0, ge=0, le=10)
    search_provider: str = Field(default="serper")
    respect_robots: bool = False


class ScrapedModel(BaseModel):
    markdown: str
    title: str | None = None


class SearchResultModel(BaseModel):
    rank: int
    title: str
    url: str
    snippet: str | None
    scraped: ScrapedModel | None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultModel]
    request_id: str


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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "SSRF_BLOCKED",
                    "message": str(e),
                    "request_id": get_request_id(),
                    "details": {},
                }
            },
        )

    normalized = normalize_url(url)

    if respect_robots:
        allowed = await is_allowed_by_robots_async(normalized)
        if not allowed:
            # We don't raise an error here as it's part of a search batch.
            # We return empty scraped model or similar.
            return None

    fetched = await fetch_url(normalized, timeout_ms=20000, use_playwright="auto")
    raw_html = fetched.text

    cleaned = clean_html(raw_html)
    extracted_html = extract_content(cleaned)
    markdown = html_to_markdown(extracted_html)

    return ScrapedModel(markdown=markdown, title=_parse_title(raw_html))


@router.post("/search", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
) -> SearchResponse:
    del session
    request_id = get_request_id()

    if body.search_provider != "serper":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Only 'serper' is supported in MVP",
                    "request_id": request_id,
                    "details": {"search_provider": body.search_provider},
                }
            },
        )

    results = await search_serper(body.query, body.num_results)

    scraped_map: dict[str, ScrapedModel] = {}
    if body.scrape_top_n > 0:
        top = results[: body.scrape_top_n]
        scraped = await asyncio.gather(*[_scrape_for_search(r.url, body.respect_robots) for r in top], return_exceptions=True)
        for r, s in zip(top, scraped, strict=False):
            if isinstance(s, Exception):
                scraped_map[r.url] = None  # type: ignore[assignment]
            else:
                scraped_map[r.url] = s

    out: list[SearchResultModel] = []
    for r in results:
        scraped_obj = scraped_map.get(r.url) if body.scrape_top_n > 0 else None
        out.append(
            SearchResultModel(
                rank=r.rank,
                title=r.title,
                url=r.url,
                snippet=r.snippet,
                scraped=scraped_obj,
            )
        )

    return SearchResponse(query=body.query, results=out, request_id=request_id)
