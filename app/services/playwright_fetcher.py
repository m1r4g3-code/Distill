import asyncio
import time
from playwright.async_api import async_playwright
import structlog
from playwright_stealth import Stealth

from app.config import settings
from app.services.fetcher import FetchResult
from app.routers.metrics import increment_counter, record_fetch_duration

log = structlog.get_logger("fetcher")

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

async def fetch_playwright(url: str, timeout_ms: int, pw_pool=None) -> FetchResult:
    start = time.perf_counter()
    browser = None
    context = None
    page = None
    response = None
    content = ""
    raw_bytes = None

    try:
        if pw_pool:
            async with pw_pool.get_context() as ctx:
                page = await ctx.new_page()
                
                # Apply evasions
                await Stealth().apply_stealth_async(page)
                log.info("fetch.stealth_applied", url=url)

                await page.set_extra_http_headers({
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "DNT": "1",
                    "Upgrade-Insecure-Requests": "1",
                })

                # Block heavy asset types by extension to speed up load
                await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,css}", lambda route: asyncio.create_task(route.abort()))

                response = await page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=min(int(settings.playwright_timeout * 1000), timeout_ms),
                )

                # Allow some JS rendering time after DOM is ready
                await asyncio.sleep(2)
                content = await page.content()
                if response:
                    raw_bytes = await response.body()
        else:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--no-first-run",
                        "--no-zygote",
                        "--single-process",
                    ],
                )

                proxy_settings = None
                if settings.proxy_enabled and settings.proxy_url:
                    proxy_settings = {"server": settings.proxy_url}
                    log.info("fetch.proxy_used", url=url, renderer="playwright")

                context = await browser.new_context(
                    user_agent=BROWSER_UA,
                    proxy=proxy_settings,
                )
                page = await context.new_page()
                
                # Apply evasions
                await Stealth().apply_stealth_async(page)
                log.info("fetch.stealth_applied", url=url)

                await page.set_extra_http_headers({
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "DNT": "1",
                    "Upgrade-Insecure-Requests": "1",
                })

                # Block heavy asset types by extension to speed up load
                await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,css}", lambda route: asyncio.create_task(route.abort()))

                response = await page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=min(int(settings.playwright_timeout * 1000), timeout_ms),
                )

                # Allow some JS rendering time after DOM is ready
                await asyncio.sleep(2)
                content = await page.content()
                if response:
                    raw_bytes = await response.body()
    except Exception as e:
        raise Exception(f"Playwright failed: {str(e)}")

    duration_ms = int((time.perf_counter() - start) * 1000)
    status_code = response.status if response else 200
    headers = response.headers if response else {}
    final_url = response.url if response else url

    await increment_counter("crawlclean_fetch_total", {"renderer": "playwright", "status_code": str(status_code)})
    record_fetch_duration(duration_ms)

    return FetchResult(
        url=url,
        status_code=status_code,
        headers={k: v for k, v in headers.items()},
        text=content,
        duration_ms=duration_ms,
        final_url=final_url,
        renderer="playwright",
        raw_bytes=raw_bytes,
    )
