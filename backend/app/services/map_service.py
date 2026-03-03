"""
map_service.py — BFS site crawler using the stealth browser.

Returns a sitemap-style list of all URLs found on the target domain.
Called by the background worker for 'map' jobs.
"""
import asyncio
from collections import deque
from urllib.parse import urlparse
import structlog

from app.services.browser import fetch_page

logger = structlog.get_logger("map_service")


async def map_site(
    url: str,
    max_pages: int = 50,
    max_depth: int = 3,
) -> dict:
    """
    BFS crawl to discover all URLs on a site.

    Returns:
        {
            "url": starting URL,
            "total_urls": int,
            "urls": [list of discovered URLs],
            "pages_crawled": int,
        }
    """
    base = urlparse(url)
    base_domain = base.netloc

    visited: set[str] = set()
    found_urls: list[str] = []
    queue: deque[tuple[str, int]] = deque([(url, 0)])

    while queue and len(visited) < max_pages:
        current_url, depth = queue.popleft()

        if current_url in visited:
            continue
        if depth > max_depth:
            continue
        if urlparse(current_url).netloc != base_domain:
            continue

        visited.add(current_url)
        found_urls.append(current_url)

        logger.info(
            "map_site.crawling",
            url=current_url,
            depth=depth,
            found=len(found_urls),
        )

        try:
            page_data = await fetch_page(
                current_url,
                wait_for_idle=False,
                extra_wait_ms=500,
            )
            for link in page_data["links"]["internal"]:
                clean = link.split("#")[0].rstrip("/")
                if clean and clean not in visited:
                    queue.append((clean, depth + 1))
        except Exception as e:
            logger.error("map_site.page_error", url=current_url, error=str(e))
            continue

        await asyncio.sleep(0.3)  # be polite to the target server

    return {
        "url": url,
        "total_urls": len(found_urls),
        "urls": found_urls,
        "pages_crawled": len(visited),
    }
