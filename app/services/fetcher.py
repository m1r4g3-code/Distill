import re
import time
from dataclasses import dataclass

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings
from app.services.url_utils import validate_ssrf
from app.routers.metrics import increment_counter, record_fetch_duration
from app.db_redis import get_redis
import structlog
import asyncio

log = structlog.get_logger("fetcher")

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

@dataclass
class FetchResult:
    url: str
    status_code: int
    headers: dict[str, str]
    text: str
    duration_ms: int
    final_url: str | None = None
    renderer: str = "httpx"
    raw_bytes: bytes | None = None


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

    proxies = None
    if settings.proxy_enabled and settings.proxy_url:
        proxies = {
            "http://": settings.proxy_url,
            "https://": settings.proxy_url,
        }
        log.info("fetch.proxy_used", url=url, renderer="httpx")

    start = time.perf_counter()
    async with httpx.AsyncClient(
        follow_redirects=True, 
        timeout=timeout, 
        headers=BROWSER_HEADERS,
        proxies=proxies
    ) as client:
        resp = await client.get(url)

    duration_ms = int((time.perf_counter() - start) * 1000)
    
    await increment_counter("crawlclean_fetch_total", {"renderer": "httpx", "status_code": str(resp.status_code)})
    record_fetch_duration(duration_ms)

    return FetchResult(
        url=url,
        status_code=resp.status_code,
        headers={k: v for k, v in resp.headers.items()},
        text=resp.text,
        duration_ms=duration_ms,
        final_url=str(resp.url) if resp.url else None,
        renderer="httpx",
        raw_bytes=resp.content,
    )


ALWAYS_PLAYWRIGHT_DOMAINS = {
    "react.dev", "nextjs.org", "vercel.com",
    "github.com", "gitlab.com"
}

def should_fallback_to_playwright(url: str, html_text: str) -> bool:
    # 1. Check for specific domains
    from urllib.parse import urlparse
    host = urlparse(url).hostname or ""
    host = host.replace("www.", "")
    if host in ALWAYS_PLAYWRIGHT_DOMAINS:
        return True

    # 2. Check word count (lower threshold to 150 words)
    # Strip HTML tags for a rough word count
    text_content = re.sub(r"<[^>]+>", " ", html_text)
    word_count = len(text_content.split())
    
    if word_count < 150:
        return True
        
    # 3. Check for SPA shell markers
    lowered = html_text.lower()
    spa_markers = [
        'id="root"',
        'id="app"',
        'id="__next"',
        "window.__next_data__",
        "window.__nuxt__",
        "__remix_manifest",
    ]
    if any(m in lowered for m in spa_markers):
        return True
            
    return False


async def acquire_domain_slot(domain: str) -> None:
    try:
        redis = await anext(get_redis())
    except Exception:
        return
    key = f"domain_concurrency:{domain}"
    while True:
        count = await redis.incr(key)
        if count <= settings.max_domain_concurrency:
            await redis.expire(key, 60)
            return
        await redis.decr(key)
        await asyncio.sleep(0.5)

async def release_domain_slot(domain: str) -> None:
    try:
        redis = await anext(get_redis())
    except Exception:
        return
    key = f"domain_concurrency:{domain}"
    await redis.decr(key)


async def fetch_url(url: str, timeout_ms: int, use_playwright: str = "auto", pw_pool=None) -> FetchResult:
    # SSRF Protection: Validate URL before fetching
    await validate_ssrf(url)

    from urllib.parse import urlparse
    domain = urlparse(url).hostname or "unknown"
    
    await acquire_domain_slot(domain)
    try:
        if use_playwright == "always":
            from app.services.playwright_fetcher import fetch_playwright
    
            return await fetch_playwright(url, timeout_ms=timeout_ms, pw_pool=pw_pool)
    
        fetched = await fetch_httpx(url, timeout_ms=timeout_ms)
        if use_playwright == "never":
            return fetched
    
        content_type = (fetched.headers.get("content-type") or "").lower()
        if "text/html" not in content_type:
            return fetched
    
        if should_fallback_to_playwright(url, fetched.text):
            await increment_counter("crawlclean_playwright_fallback_total")
            from app.services.playwright_fetcher import fetch_playwright
    
            return await fetch_playwright(url, timeout_ms=timeout_ms, pw_pool=pw_pool)
    
        return fetched
    finally:
        await release_domain_slot(domain)
