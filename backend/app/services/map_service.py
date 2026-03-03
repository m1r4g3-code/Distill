"""
map_service.py — Site mapper with sitemap discovery + BFS crawl fallback.

Priority order:
  1. Try sitemap.xml / sitemap_index.xml → fast, complete, no headless browser needed
  2. Fall back to BFS crawl via stealth browser if no sitemap found

Called by the background worker for 'map' jobs.
"""
import asyncio
import re
from collections import deque
from urllib.parse import urlparse, urljoin
from typing import Optional
import httpx
import structlog

from app.services.browser import fetch_page

logger = structlog.get_logger("map_service")

SITEMAP_TIMEOUT = 10  # seconds for lightweight sitemap fetch


async def get_sitemap_urls(base_url: str) -> list[str]:
    """
    Try to discover URLs from the site's sitemap.xml.
    Returns up to 500 URLs. Returns empty list if no sitemap found.
    """
    candidates = [
        f"{base_url}/sitemap.xml",
        f"{base_url}/sitemap_index.xml",
        f"{base_url}/sitemap-index.xml",
    ]

    # Also check robots.txt for Sitemap: directive
    robots_url = f"{base_url}/robots.txt"
    try:
        async with httpx.AsyncClient(timeout=SITEMAP_TIMEOUT, follow_redirects=True) as client:
            r = await client.get(
                robots_url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
            )
            if r.status_code == 200:
                for line in r.text.splitlines():
                    if line.lower().startswith("sitemap:"):
                        sitemap_ref = line.split(":", 1)[1].strip()
                        if sitemap_ref not in candidates:
                            candidates.insert(0, sitemap_ref)
    except Exception:
        pass

    all_urls: list[str] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=SITEMAP_TIMEOUT, follow_redirects=True) as client:
        for sitemap_url in candidates:
            try:
                r = await client.get(
                    sitemap_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
                )
                if r.status_code != 200:
                    continue

                content = r.text
                # Find <loc> tags in sitemap XML
                locs = re.findall(r"<loc>\s*(.*?)\s*</loc>", content, re.DOTALL)

                # If this is a sitemap index, it contains <sitemap> entries pointing
                # to child sitemaps — fetch each one
                child_sitemaps = re.findall(r"<sitemap>.*?<loc>\s*(.*?)\s*</loc>", content, re.DOTALL)

                if child_sitemaps:
                    # Sitemap index: fetch child sitemaps
                    for child_url in child_sitemaps[:10]:
                        try:
                            child_r = await client.get(
                                child_url,
                                headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
                            )
                            if child_r.status_code == 200:
                                child_locs = re.findall(r"<loc>\s*(.*?)\s*</loc>", child_r.text, re.DOTALL)
                                for url in child_locs:
                                    if url not in seen:
                                        seen.add(url)
                                        all_urls.append(url)
                        except Exception:
                            continue
                else:
                    # Regular sitemap
                    for url in locs:
                        if url not in seen:
                            seen.add(url)
                            all_urls.append(url)

                if all_urls:
                    logger.info(
                        "map_service.sitemap_found",
                        sitemap_url=sitemap_url,
                        url_count=len(all_urls),
                    )
                    break  # Found a working sitemap
            except Exception as e:
                logger.debug("map_service.sitemap_error", url=sitemap_url, error=str(e))
                continue

    return all_urls[:500]


async def map_site(
    url: str,
    max_pages: int = 50,
    max_depth: int = 3,
) -> dict:
    """
    Discover all URLs on a site.

    Strategy:
      1. Try sitemap.xml first (fast, comprehensive, no browser needed)
      2. Fall back to BFS crawl via stealth browser if sitemap is missing or thin

    Returns:
        {
            "url": starting URL,
            "total_urls": int,
            "urls": [list of discovered URLs],
            "pages_crawled": int,
            "source": "sitemap" | "crawl",
        }
    """
    base = urlparse(url)
    base_url = f"{base.scheme}://{base.netloc}"

    # ── Step 1: Try sitemap ──
    logger.info("map_service.sitemap_attempt", url=url)
    sitemap_urls = await get_sitemap_urls(base_url)

    if len(sitemap_urls) >= 5:
        logger.info("map_service.sitemap_success", url=url, count=len(sitemap_urls))
        clipped = sitemap_urls[:max_pages]
        return {
            "url": url,
            "total_urls": len(clipped),
            "urls": clipped,
            "pages_crawled": len(clipped),
            "source": "sitemap",
        }

    # ── Step 2: BFS crawl via stealth browser ──
    logger.info(
        "map_service.bfs_crawl_start",
        url=url,
        max_pages=max_pages,
        max_depth=max_depth,
        sitemap_hits=len(sitemap_urls),
    )

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
            "map_service.bfs_page",
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
            logger.warning("map_service.bfs_page_error", url=current_url, error=str(e))
            continue

        await asyncio.sleep(0.3)

    return {
        "url": url,
        "total_urls": len(found_urls),
        "urls": found_urls,
        "pages_crawled": len(visited),
        "source": "crawl",
    }
