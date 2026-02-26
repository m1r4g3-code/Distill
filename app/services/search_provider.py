from dataclasses import dataclass
import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from fastapi import HTTPException
from app.config import settings

@dataclass
class SearchResult:
    rank: int
    title: str
    url: str
    snippet: str | None

async def search(query: str, num_results: int) -> list[SearchResult]:
    """
    Provider-agnostic search function.
    Detects which API key is available and uses the corresponding provider.
    """
    if settings.serper_api_key:
        return await _search_serper(query, num_results)
    elif settings.serpapi_api_key:
        return await _search_serpapi(query, num_results)
    else:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "SEARCH_NOT_CONFIGURED",
                "message": "No search provider API key found. Set SERPER_API_KEY or SERPAPI_API_KEY in your .env file."
            }
        )

@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
async def _search_serper(query: str, num_results: int) -> list[SearchResult]:
    timeout = httpx.Timeout(settings.search_timeout)

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": settings.serper_api_key,
                "Content-Type": "application/json",
            },
            json={"q": query, "num": num_results},
        )

    resp.raise_for_status()
    data = resp.json()
    organic = data.get("organic") or []

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
