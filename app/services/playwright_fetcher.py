import asyncio
import time
from playwright.async_api import async_playwright
from app.config import settings
from app.services.fetcher import FetchResult

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

async def fetch_playwright(url: str, timeout_ms: int) -> FetchResult:
    start = time.perf_counter()
    browser = None
    context = None
    page = None
    response = None
    content = ""

    try:
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

            context = await browser.new_context(user_agent=BROWSER_UA)
            page = await context.new_page()

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
    except Exception as e:
        # Ensure proper cleanup before surfacing the error
        try:
            if context:
                await context.close()
        except Exception:
            pass
        try:
            if browser:
                await browser.close()
        except Exception:
            pass
        raise Exception(f"Playwright failed: {str(e)}")
    else:
        # Normal cleanup on success
        try:
            if context:
                await context.close()
        finally:
            if browser:
                await browser.close()

    duration_ms = int((time.perf_counter() - start) * 1000)
    status_code = response.status if response else 200
    headers = response.headers if response else {}
    final_url = response.url if response else url

    return FetchResult(
        url=url,
        status_code=status_code,
        headers={k: v for k, v in headers.items()},
        text=content,
        duration_ms=duration_ms,
        final_url=final_url,
        renderer="playwright",
    )
