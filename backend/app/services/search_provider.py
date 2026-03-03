"""
search_provider.py — Provider-agnostic search with rich result metadata.

Upgraded to return title, url, snippet, position, and optionally scrape
full page content using the stealth browser.
"""
from dataclasses import dataclass, field
from typing import Optional
import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from fastapi import HTTPException
from app.config import settings
from app.middleware.logging import get_request_id
import structlog

logger = structlog.get_logger("search_provider")


@dataclass
class SearchResult:
    rank: int
    title: str
    url: str
    snippet: Optional[str]
    markdown: Optional[str] = None
    knowledge_graph: Optional[dict] = None
    answer_box: Optional[dict] = None


@dataclass
class SearchResponse:
    query: str
    total_results: int
    results: list
    knowledge_graph: Optional[dict] = None
    answer_box: Optional[dict] = None
    related_searches: list = field(default_factory=list)


async def search(
    query: str,
    num_results: int,
    scrape_results: bool = False,
) -> list[SearchResult]:
    """
    Provider-agnostic search. Returns rich results with optional full content.
    """
    if settings.serper_api_key:
        return await _search_serper(query, num_results, scrape_results=scrape_results)
    elif settings.serpapi_api_key:
        return await _search_serpapi(query, num_results)
    else:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "SEARCH_NOT_CONFIGURED",
                    "message": "No search provider API key found. Set SERPER_API_KEY or SERPAPI_API_KEY in your .env file.",
                    "request_id": get_request_id(),
                    "details": {},
                }
            },
        )


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
async def _search_serper(
    query: str,
    num_results: int,
    scrape_results: bool = False,
) -> list[SearchResult]:
    timeout = httpx.Timeout(settings.search_timeout)

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": settings.serper_api_key,
                "Content-Type": "application/json",
            },
            json={"q": query, "num": num_results, "gl": "us", "hl": "en"},
        )

    resp.raise_for_status()
    data = resp.json()
    organic = data.get("organic") or []

    results: list[SearchResult] = []
    for idx, item in enumerate(organic[:num_results], start=1):
        result = SearchResult(
            rank=idx,
            title=item.get("title") or "",
            url=item.get("link") or "",
            snippet=item.get("snippet"),
            knowledge_graph=data.get("knowledgeGraph") if idx == 1 else None,
            answer_box=data.get("answerBox") if idx == 1 else None,
        )

        # Optionally scrape full content from each URL
        if scrape_results and result.url:
            try:
                from app.services.browser import fetch_page
                from app.utils.text import sanitize_text
                page_data = await fetch_page(
                    result.url,
                    wait_for_idle=False,
                    extra_wait_ms=1000,
                )
                result.markdown = sanitize_text(page_data["markdown"])[:5000]
            except Exception as e:
                logger.warning(
                    "search.scrape_result_failed",
                    url=result.url,
                    error=str(e),
                )

        results.append(result)

    return results


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
async def _search_serpapi(query: str, num_results: int) -> list[SearchResult]:
    timeout = httpx.Timeout(settings.search_timeout)

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(
            "https://serpapi.com/search",
            params={
                "api_key": settings.serpapi_api_key,
                "q": query,
                "num": num_results,
                "engine": "google",
            },
        )

    resp.raise_for_status()
    data = resp.json()
    organic = data.get("organic_results") or []

    results: list[SearchResult] = []
    for idx, item in enumerate(organic[:num_results], start=1):
        results.append(
            SearchResult(
                rank=idx,
                title=item.get("title") or "",
                url=item.get("link") or "",
                snippet=item.get("snippet"),
            )
        )

    return results
