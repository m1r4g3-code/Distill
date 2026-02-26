import time
from dataclasses import dataclass

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings
from app.services.url_utils import validate_ssrf


@dataclass
class FetchResult:
    url: str
    status_code: int
    headers: dict[str, str]
    text: str
    duration_ms: int
    final_url: str | None = None
    renderer: str = "httpx"


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
    reraise=True,
)
async def fetch_httpx(url: str, timeout_ms: int) -> FetchResult:
    timeout = httpx.Timeout(
        connect=settings.fetch_connect_timeout,
        read=min(settings.fetch_read_timeout, timeout_ms / 1000.0),
        write=10.0,
        pool=10.0,
    )

    start = time.perf_counter()
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout, headers={"User-Agent": "WebExtractBot/1.0"}) as client:
        resp = await client.get(url)

    duration_ms = int((time.perf_counter() - start) * 1000)
    return FetchResult(
        url=url,
        status_code=resp.status_code,
        headers={k: v for k, v in resp.headers.items()},
        text=resp.text,
        duration_ms=duration_ms,
        final_url=str(resp.url) if resp.url else None,
        renderer="httpx",
    )


def _is_probably_spa_shell(html_text: str) -> bool:
    lowered = html_text.lower()
    markers = [
        "<div id=\"root\"></div>",
        "<div id=\"app\"></div>",
        "window.__next_data__",
        "window.__nuxt__",
    ]
    return any(m in lowered for m in markers)


async def fetch_url(url: str, timeout_ms: int, use_playwright: str = "auto") -> FetchResult:
    # SSRF Protection: Validate URL before fetching
    validate_ssrf(url)

    if use_playwright == "always":
        from app.services.playwright_fetcher import fetch_playwright

        return await fetch_playwright(url, timeout_ms=timeout_ms)

    fetched = await fetch_httpx(url, timeout_ms=timeout_ms)
    if use_playwright == "never":
        return fetched

    content_type = (fetched.headers.get("content-type") or "").lower()
    if "text/html" not in content_type:
        return fetched

    if len(fetched.text) < 500 or _is_probably_spa_shell(fetched.text):
        from app.services.playwright_fetcher import fetch_playwright

        return await fetch_playwright(url, timeout_ms=timeout_ms)

    return fetched
