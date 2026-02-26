from dataclasses import dataclass

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings


@dataclass
class SearchResult:
    rank: int
    title: str
    url: str
    snippet: str | None


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
async def search_serper(query: str, num_results: int) -> list[SearchResult]:
    if not settings.serper_api_key:
        raise RuntimeError("SERPER_API_KEY is not configured")

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
