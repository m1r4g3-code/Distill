"""
browser.py — Shared stealth browser utility used by all endpoints.

Centralising Playwright here means one fix improves scrape, map,
search (result scraping), and agent endpoints simultaneously.
"""
import asyncio
import re
from typing import Optional
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from bs4 import BeautifulSoup
from markdownify import markdownify as md
import structlog

logger = structlog.get_logger("browser")

STEALTH_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

COOKIE_SELECTORS = [
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Accept cookies")',
    'button:has-text("I Accept")',
    'button:has-text("Allow all")',
    'button:has-text("Agree")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    '[aria-label*="Accept"]',
    'button[id*="accept"]',
    'button[class*="accept"]',
]


async def dismiss_cookie_banners(page) -> None:
    """Click any visible cookie consent banner to dismiss it."""
    for selector in COOKIE_SELECTORS:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=500):
                await btn.click()
                await page.wait_for_timeout(800)
                return
        except Exception:
            continue


async def extract_metadata(page) -> dict:
    """Extract rich metadata from the live page via JS evaluation."""
    try:
        return await page.evaluate("""
            () => {
                const get = (sel) => {
                    const el = document.querySelector(sel)
                    return el ? (el.content || el.href) : null
                }
                return {
                    title: document.title,
                    description:
                        get('meta[name="description"]') ||
                        get('meta[property="og:description"]'),
                    og_image:
                        get('meta[property="og:image"]'),
                    og_title:
                        get('meta[property="og:title"]'),
                    og_site_name:
                        get('meta[property="og:site_name"]'),
                    author:
                        get('meta[name="author"]'),
                    keywords:
                        get('meta[name="keywords"]'),
                    robots:
                        get('meta[name="robots"]'),
                    canonical:
                        get('link[rel="canonical"]'),
                    language:
                        document.documentElement.lang || null,
                }
            }
        """)
    except Exception:
        return {}


async def extract_links_from_page(page, base_url: str) -> dict:
    """Collect internal and external links from the live page."""
    try:
        all_links = await page.evaluate("""
            () => Array.from(document.querySelectorAll('a[href]'))
                  .map(a => a.href)
                  .filter(h => h.startsWith('http'))
        """)
        from urllib.parse import urlparse
        base_domain = urlparse(base_url).netloc
        internal, external = [], []
        seen: set = set()
        for link in all_links:
            if link in seen:
                continue
            seen.add(link)
            # Strip fragments
            clean = link.split('#')[0].rstrip('/')
            if not clean:
                continue
            if urlparse(clean).netloc == base_domain:
                internal.append(clean)
            else:
                external.append(clean)
        return {
            "internal": internal[:100],
            "external": external[:50],
        }
    except Exception:
        return {"internal": [], "external": []}


def html_to_clean_markdown(html: str) -> str:
    """Convert raw HTML to clean, compact Markdown."""
    soup = BeautifulSoup(html, "html.parser")
    # Strip non-content tags
    for tag in soup.find_all(["script", "style", "noscript", "iframe"]):
        tag.decompose()

    markdown = md(
        str(soup),
        heading_style="ATX",
        bullets="-",
        newline_style="backslash",
    )
    # Collapse excessive blank lines
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip()


async def fetch_page(
    url: str,
    wait_for_idle: bool = True,
    extra_wait_ms: int = 1500,
    timeout_ms: int = 30000,
) -> dict:
    """
    Fetch a URL with full stealth Playwright browser.

    Returns a dict with: html, markdown, metadata, links, status_code, word_count.
    Used by ALL endpoints (scrape, map, search, agent).
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1920,1080",
            ],
        )
        try:
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=STEALTH_USER_AGENT,
                locale="en-US",
                timezone_id="America/New_York",
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept": (
                        "text/html,application/xhtml+xml,"
                        "application/xml;q=0.9,*/*;q=0.8"
                    ),
                },
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)

            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )
            status_code = response.status if response else 200

            if wait_for_idle:
                try:
                    await page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass  # Timeout is acceptable

            await page.wait_for_timeout(extra_wait_ms)
            await dismiss_cookie_banners(page)
            await page.wait_for_timeout(500)

            html = await page.content()
            metadata = await extract_metadata(page)
            links = await extract_links_from_page(page, url)
            markdown = html_to_clean_markdown(html)
            word_count = len(markdown.split())

            logger.info(
                "browser.fetch_page.done",
                url=url,
                status_code=status_code,
                word_count=word_count,
            )

            return {
                "html": html,
                "markdown": markdown,
                "metadata": metadata,
                "links": links,
                "status_code": status_code,
                "word_count": word_count,
            }
        finally:
            await browser.close()
