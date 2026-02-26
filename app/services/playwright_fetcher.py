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

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Apply realistic User-Agent
        context = await browser.new_context(user_agent=BROWSER_UA)
        page = await context.new_page()

        # Add additional realistic headers
        await page.set_extra_http_headers({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "DNT": "1",
            "Upgrade-Insecure-Requests": "1",
        })

        async def _route(route):
            rtype = route.request.resource_type
            if rtype in {"image", "font", "media"}:
                await route.abort()
                return
            await route.continue_()

        await page.route("**/*", _route)

        response = await page.goto(
            url,
            wait_until="networkidle",
            timeout=min(settings.playwright_timeout * 1000, timeout_ms),
        )

        content = await page.content()
        await context.close()
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
