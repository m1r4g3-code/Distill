import asyncio
import re
import time
import uuid
from collections import deque
from dataclasses import dataclass
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import Job, JobPage, Page
from app.services.extractor import extract_links
from app.services.fetcher import fetch_url
from app.services.robots import is_allowed_by_robots_async
from app.services.url_utils import compute_url_hash, normalize_url, validate_ssrf


domain_semaphores: dict[str, asyncio.Semaphore] = {}
_domain_last_request: dict[str, float] = {}


@dataclass
class MapConfig:
    root_url: str
    max_depth: int
    max_pages: int
    include_patterns: list[str]
    exclude_patterns: list[str]
    concurrency: int
    domain_delay_ms: int
    respect_robots: bool = True


def _compile_patterns(patterns: list[str]) -> list[re.Pattern]:
    return [re.compile(p) for p in patterns]


def _allowed(url: str, include: list[re.Pattern], exclude: list[re.Pattern]) -> bool:
    if include and not any(p.search(url) for p in include):
        return False
    if exclude and any(p.search(url) for p in exclude):
        return False
    return True


async def _polite_wait(host: str, delay_ms: int) -> None:
    last = _domain_last_request.get(host)
    if last is None:
        return
    elapsed = (time.time() - last) * 1000
    remaining = delay_ms - elapsed
    if remaining > 0:
        await asyncio.sleep(remaining / 1000.0)


async def crawl_site(session: AsyncSession, job: Job, cfg: MapConfig) -> None:
    root = normalize_url(cfg.root_url)
    root_host = urlparse(root).hostname
    if not root_host:
        raise ValueError("Root URL must include hostname")

    include = _compile_patterns(cfg.include_patterns)
    exclude = _compile_patterns(cfg.exclude_patterns)

    seen: set[str] = set()
    q: deque[tuple[str, int]] = deque()
    q.append((root, 0))

    job.pages_total = cfg.max_pages
    await session.commit()

    while q and len(seen) < cfg.max_pages:
        current, depth = q.popleft()
        if current in seen:
            continue
        if depth > cfg.max_depth:
            continue

        await validate_ssrf(current)

        if cfg.respect_robots:
            allowed = await is_allowed_by_robots_async(current)
            if not allowed:
                continue

        host = urlparse(current).hostname or ""
        sem = domain_semaphores.setdefault(host, asyncio.Semaphore(cfg.concurrency))

        async with sem:
            await _polite_wait(host, cfg.domain_delay_ms)
            _domain_last_request[host] = time.time()
            fetched = await fetch_url(current, timeout_ms=20000, use_playwright="never")

        raw_html = fetched.text
        links = extract_links(raw_html, base_url=fetched.final_url or current)

        url_hash = compute_url_hash(current)
        res = await session.execute(select(Page).where(Page.url_hash == url_hash))
        page = res.scalar_one_or_none()
        if page is None:
            page = Page(url=current, canonical_url=current, url_hash=url_hash)
            session.add(page)
            await session.flush()

        page.url = current
        page.canonical_url = normalize_url(fetched.final_url) if fetched.final_url else current
        page.status_code = fetched.status_code
        page.renderer = fetched.renderer
        page.links_internal = links.internal
        page.links_external = links.external
        page.fetch_duration_ms = fetched.duration_ms

        # create relationship if not already present
        existing_rel = await session.execute(
            select(JobPage).where(JobPage.job_id == job.id, JobPage.page_id == page.id)
        )
        if existing_rel.scalar_one_or_none() is None:
            session.add(JobPage(job_id=job.id, page_id=page.id, depth=depth))

        seen.add(current)
        job.pages_discovered = len(seen)
        await session.commit()

        for nxt in links.internal:
            if urlparse(nxt).hostname != root_host:
                continue
            if not _allowed(nxt, include, exclude):
                continue
            if nxt not in seen:
                q.append((nxt, depth + 1))
