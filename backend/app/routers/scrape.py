import hashlib
import re
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlparse

from app.config import settings
from app.db.models import ApiKey, Job, Page
from app.db.session import get_session
from app.dependencies import require_scope
from app.middleware.logging import get_request_id
from app.services.browser import fetch_page
from app.utils.text import sanitize_text
from app.services.robots import is_allowed_by_robots_async
from app.services.url_utils import compute_url_hash, normalize_url, validate_ssrf
from app.db.job_helpers import save_job
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from app.db_redis import get_redis
import json
from app.routers.metrics import increment_counter
import structlog

logger = structlog.get_logger("scrape")

router = APIRouter(tags=["scrape"])


class ScrapeRequest(BaseModel):
    url: str = Field(..., description="The highly qualified URL to scrape.", examples=["https://example.com/article"])
    respect_robots: bool = Field(default=False, description="Check robots.txt before scraping.")
    use_playwright: str = Field(default="auto", pattern="^(auto|always|never)$", description="Whether to use playwright for dynamic content.")
    include_links: bool = Field(default=True, description="Whether to extract internal and external links from the page.")
    include_raw_html: bool = Field(default=False, description="Whether to include the raw HTML block in the response.")
    timeout_ms: int = Field(default=30000, ge=1000, le=60000, description="Page load timeout in milliseconds.")
    cache_ttl_seconds: int | None = Field(default=None, ge=0, le=86400, description="Override the default cache TTL setting.")
    force_refresh: bool = Field(default=False, description="Bypass the cache entirely and force a fresh scrape.")

    @field_validator("url")
    @classmethod
    def validate_url_format(cls, v):
        parsed = urlparse(v)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("URL must start with http:// or https://")
        if not parsed.hostname:
            raise ValueError("URL must contain a valid hostname")
        return v


class LinksModel(BaseModel):
    internal: list[str]
    external: list[str]


class MetadataModel(BaseModel):
    description: str | None = None
    og_image: str | None = None
    og_title: str | None = None
    author: str | None = None
    published_at: str | None = None
    site_name: str | None = None
    language: str | None = None
    favicon_url: str | None = None
    word_count: int | None = None
    read_time_minutes: int | None = None
    fetch_duration_ms: int
    renderer: str


class ScrapeResponse(BaseModel):
    url: str
    canonical_url: str
    status_code: int
    title: str | None
    markdown: str
    metadata: MetadataModel
    links: LinksModel | None
    cached: bool
    cache_layer: str | None = None
    request_id: str


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.post(
    "/scrape",
    response_model=ScrapeResponse,
    summary="Scrape URL Content",
    description=(
        "Synchronously scrape textual content and metadata from a given URL. "
        "Uses stealth Playwright browser for reliable extraction. "
        "Pass 'X-No-Cache: true' header or 'force_refresh: true' to bypass cache."
    )
)
async def scrape(
    request: Request,
    body: ScrapeRequest,
    no_cache: bool = False,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
) -> ScrapeResponse:
    request_id = get_request_id()

    # no_cache query param (?no_cache=true), X-No-Cache header, or force_refresh body all bypass cache
    no_cache_header = request.headers.get("X-No-Cache", "").lower() in ("true", "1", "yes")
    force_refresh = body.force_refresh or no_cache_header or no_cache

    try:
        await validate_ssrf(body.url)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "SSRF_BLOCKED",
                    "message": str(e),
                    "request_id": request_id,
                    "details": {},
                }
            },
        )

    normalized_url = normalize_url(body.url)

    # robots.txt check
    if body.respect_robots:
        allowed = await is_allowed_by_robots_async(normalized_url)
        if not allowed:
            await increment_counter("crawlclean_robots_blocked_total")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": {
                        "code": "ROBOTS_BLOCKED",
                        "message": "robots.txt disallows this URL",
                        "request_id": request_id,
                        "details": {"url": normalized_url},
                    }
                },
            )

    url_hash = compute_url_hash(normalized_url)
    ttl_seconds = settings.cache_ttl_seconds if body.cache_ttl_seconds is None else body.cache_ttl_seconds
    redis_cache_key = f"page_cache:{url_hash}"

    if not force_refresh and ttl_seconds > 0:
        # ── Redis cache check ──
        cached_str = await redis.get(redis_cache_key)
        if cached_str:
            await increment_counter("crawlclean_cache_hits_total")
            try:
                data = json.loads(cached_str)
                data["cache_layer"] = "redis"
                data["cached"] = True
                data["request_id"] = request_id
                logger.info("scrape.cache_hit", url=normalized_url, layer="redis")
                return ScrapeResponse(**data)
            except Exception:
                pass  # Fall through to DB / live fetch

        # ── DB cache check ──
        existing = await session.execute(select(Page).where(Page.url_hash == url_hash))
        cached_page = existing.scalar_one_or_none()
        if cached_page and cached_page.markdown:
            fetched_at = _as_utc(cached_page.fetched_at)
            now = datetime.now(timezone.utc)
            if (now - fetched_at).total_seconds() <= ttl_seconds:
                await increment_counter("crawlclean_cache_hits_total")
                if cached_page.error_code:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "error": {
                                "code": cached_page.error_code,
                                "message": cached_page.error_message or "Cached fetch error",
                                "request_id": request_id,
                                "details": {"cached": True},
                            }
                        },
                    )
                logger.info("scrape.cache_hit", url=normalized_url, layer="db")
                resp = ScrapeResponse(
                    url=cached_page.url,
                    canonical_url=cached_page.canonical_url or cached_page.url,
                    status_code=cached_page.status_code or 200,
                    title=cached_page.title,
                    markdown=cached_page.markdown or "",
                    links=(
                        LinksModel(
                            internal=cached_page.links_internal or [],
                            external=cached_page.links_external or [],
                        )
                        if body.include_links
                        else None
                    ),
                    metadata=MetadataModel(
                        description=cached_page.description,
                        og_image=getattr(cached_page, "og_image", None),
                        og_title=None,
                        author=cached_page.author if hasattr(cached_page, "author") else None,
                        published_at=None,
                        site_name=getattr(cached_page, "site_name", None),
                        language=getattr(cached_page, "language", None),
                        favicon_url=getattr(cached_page, "favicon_url", None),
                        word_count=cached_page.word_count,
                        read_time_minutes=getattr(cached_page, "read_time_minutes", None),
                        fetch_duration_ms=cached_page.fetch_duration_ms or 0,
                        renderer=cached_page.renderer or "browser",
                    ),
                    cached=True,
                    cache_layer="db",
                    request_id=request_id,
                )
                # Backfill Redis with 1-hour TTL
                await redis.setex(redis_cache_key, 3600, resp.model_dump_json())
                return resp
    else:
        # force_refresh: still load cached_page so we can update it
        existing = await session.execute(select(Page).where(Page.url_hash == url_hash))
        cached_page = existing.scalar_one_or_none()

    # ── Check if it's a PDF URL (handle via old httpx fetcher) ──
    is_pdf_url = normalized_url.lower().split("?")[0].endswith(".pdf")

    if is_pdf_url:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                pdf_resp = await client.get(normalized_url)
            pdf_resp.raise_for_status()
            content_type = pdf_resp.headers.get("content-type", "")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": {"code": "FETCH_ERROR", "message": str(e), "request_id": request_id, "details": {}}},
            )

        if "application/pdf" in content_type or is_pdf_url:
            from app.services.extractor import extract_pdf
            markdown, pdf_metadata = extract_pdf(pdf_resp.content)
            metadata_dict = {
                "title": pdf_metadata.get("title"),
                "description": pdf_metadata.get("description"),
                "og_image": None,
                "og_title": None,
                "author": pdf_metadata.get("author"),
                "published_at": None,
                "site_name": None,
                "language": None,
                "favicon_url": None,
                "canonical_url": normalized_url,
            }
            links_internal: list[str] = []
            links_external: list[str] = []
            content_hash = hashlib.sha256(pdf_resp.content).hexdigest()
            word_count = len(markdown.split())
            read_time_minutes = max(1, round(word_count / 200))
            status_code = pdf_resp.status_code
            fetch_duration_ms = 0
            renderer = "httpx"
        else:
            is_pdf_url = False  # Was not PDF after all, fall through to browser

    if not is_pdf_url:
        # ── Live fetch via stealth browser ──
        start_ts = time.perf_counter()
        logger.info("scrape.browser_fetch.start", url=normalized_url, force_refresh=force_refresh)
        try:
            page_data = await fetch_page(
                normalized_url,
                wait_for_idle=True,
                extra_wait_ms=1500,
                timeout_ms=body.timeout_ms,
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "error": {
                        "code": "FETCH_ERROR",
                        "message": str(e),
                        "request_id": request_id,
                        "details": {"exception_type": type(e).__name__},
                    }
                },
            )

        fetch_duration_ms = int((time.perf_counter() - start_ts) * 1000)
        status_code = page_data["status_code"]
        renderer = "browser"

        meta = page_data["metadata"]
        markdown = sanitize_text(page_data["markdown"])
        word_count = page_data["word_count"]
        read_time_minutes = max(1, word_count // 200)
        content_hash = _content_hash(page_data["html"])

        metadata_dict = {
            "title": meta.get("title") or meta.get("og_title"),
            "description": meta.get("description"),
            "og_image": meta.get("og_image"),
            "og_title": meta.get("og_title"),
            "author": meta.get("author"),
            "published_at": None,
            "site_name": meta.get("og_site_name"),
            "language": meta.get("language"),
            "favicon_url": None,
            "canonical_url": meta.get("canonical") or normalized_url,
        }

        links_internal = page_data["links"]["internal"] if body.include_links else []
        links_external = page_data["links"]["external"] if body.include_links else []

        logger.info(
            "scrape.browser_fetch.done",
            url=normalized_url,
            word_count=word_count,
            status_code=status_code,
            duration_ms=fetch_duration_ms,
        )

    # ── Persist to DB ──
    page = cached_page
    if page is None:
        page = Page(url=normalized_url, canonical_url=normalized_url, url_hash=url_hash)
        session.add(page)

    page.url = normalized_url
    page.canonical_url = metadata_dict.get("canonical_url") or normalized_url
    page.content_hash = content_hash
    page.status_code = status_code
    page.title = metadata_dict.get("title")
    page.description = metadata_dict.get("description")
    page.markdown = markdown
    page.raw_html = page_data["html"] if body.include_raw_html and not is_pdf_url else None
    page.renderer = renderer
    page.links_internal = links_internal or None
    page.links_external = links_external or None
    page.word_count = word_count
    page.read_time_minutes = read_time_minutes
    page.fetch_duration_ms = fetch_duration_ms
    page.og_image = metadata_dict.get("og_image")
    page.favicon_url = metadata_dict.get("favicon_url")
    page.site_name = metadata_dict.get("site_name")
    page.language = metadata_dict.get("language")
    page.fetched_at = datetime.now(timezone.utc)

    await session.commit()

    final_resp = ScrapeResponse(
        url=page.url,
        canonical_url=page.canonical_url or page.url,
        status_code=page.status_code or 200,
        title=page.title,
        markdown=page.markdown or "",
        links=LinksModel(internal=links_internal, external=links_external) if body.include_links else None,
        metadata=MetadataModel(
            description=page.description,
            og_image=page.og_image,
            og_title=metadata_dict.get("og_title"),
            author=metadata_dict.get("author"),
            published_at=None,
            site_name=page.site_name,
            language=page.language,
            favicon_url=page.favicon_url,
            word_count=page.word_count,
            read_time_minutes=page.read_time_minutes,
            fetch_duration_ms=page.fetch_duration_ms or 0,
            renderer=page.renderer or "browser",
        ),
        cached=False,
        cache_layer="none",
        request_id=request_id,
    )

    # ── Save completed Job row so scrape appears on Jobs page ──
    try:
        await save_job(
            session=session,
            api_key_id=api_key.id,
            type="scrape",
            status="completed",
            input_params={"url": normalized_url},
            progress={"result": final_resp.model_dump()}
        )
    except Exception:
        pass  # Never fail the scrape response over a job log error

    # ── Write to Redis cache (1 hour TTL) ──
    if ttl_seconds > 0:
        redis_ttl = min(ttl_seconds, 3600)  # cap at 1 hour
        await redis.setex(redis_cache_key, redis_ttl, final_resp.model_dump_json())

    return final_resp
