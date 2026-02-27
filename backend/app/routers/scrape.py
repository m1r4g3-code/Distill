import hashlib
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlparse

from app.config import settings
from app.db.models import ApiKey, Page
from app.db.session import get_session
from app.dependencies import require_scope
from app.middleware.logging import get_request_id
from app.services.extractor import (
    clean_html,
    extract_content,
    extract_links,
    extract_metadata,
    html_to_markdown,
)
from app.services.fetcher import fetch_url
from app.services.robots import is_allowed_by_robots_async
from app.services.url_utils import SSRFBlockedError, compute_url_hash, normalize_url, validate_ssrf
from app.services.job_runner import create_job, compute_idempotency_key
from arq import create_pool
from arq.connections import RedisSettings
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from app.db_redis import get_redis
import json
from app.routers.metrics import increment_counter


router = APIRouter(tags=["scrape"])


class ScrapeRequest(BaseModel):
    url: str = Field(..., description="The highly qualified URL to scrape.", examples=["https://example.com/article"])
    respect_robots: bool = Field(default=False, description="Check robots.txt before scraping.")
    use_playwright: str = Field(default="auto", pattern="^(auto|always|never)$", description="Whether to use playwright for dynamic content.")
    include_links: bool = Field(default=True, description="Whether to extract internal and external links from the page.")
    include_raw_html: bool = Field(default=False, description="Whether to include the raw HTML block in the response.")
    timeout_ms: int = Field(default=20000, ge=1000, le=60000, description="Page load timeout in milliseconds.")
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


def _parse_title(html_text: str) -> str | None:
    m = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.I | re.S)
    if not m:
        return None
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    return title or None


def _parse_description(html_text: str) -> str | None:
    m = re.search(r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"'](.*?)[\"'][^>]*>", html_text, re.I | re.S)
    if not m:
        return None
    desc = re.sub(r"\s+", " ", m.group(1)).strip()
    return desc or None


def _content_hash(raw_html: str) -> str:
    return hashlib.sha256(raw_html.encode("utf-8")).hexdigest()


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
        "Will auto-detect JavaScript rendering requirements."
    )
)
async def scrape(
    body: ScrapeRequest,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
) -> ScrapeResponse:
    request_id = get_request_id()

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
    if not body.force_refresh and ttl_seconds > 0:
        # Check Redis Cache First
        cached_str = await redis.get(redis_cache_key)
        if cached_str:
            await increment_counter("crawlclean_cache_hits_total")
            try:
                data = json.loads(cached_str)
                data["cache_layer"] = "redis"
                data["cached"] = True
                data["request_id"] = request_id
                return ScrapeResponse(**data)
            except Exception:
                pass  # Fall back to DB if parsing fails
                
        existing = await session.execute(select(Page).where(Page.url_hash == url_hash))
        cached_page = existing.scalar_one_or_none()
        if cached_page and cached_page.markdown:
            fetched_at = _as_utc(cached_page.fetched_at)
            now = datetime.now(timezone.utc)
            if (now - fetched_at).total_seconds() <= ttl_seconds:
                await increment_counter("crawlclean_cache_hits_total")
                # Check for error in cached page
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
                        author=cached_page.author if hasattr(cached_page, "author") else None,
                        published_at=None,
                        site_name=getattr(cached_page, "site_name", None),
                        language=getattr(cached_page, "language", None),
                        favicon_url=getattr(cached_page, "favicon_url", None),
                        word_count=cached_page.word_count,
                        read_time_minutes=getattr(cached_page, "read_time_minutes", None),
                        fetch_duration_ms=cached_page.fetch_duration_ms or 0,
                        renderer=cached_page.renderer or "httpx",
                    ),
                    cached=True,
                    cache_layer="db",
                    request_id=request_id,
                )
                
                # Backfill Redis
                await redis.setex(redis_cache_key, 600, resp.model_dump_json())
                return resp
    else:
        # If force_refresh is True, we still need to check if the page exists in DB to update it later
        existing = await session.execute(select(Page).where(Page.url_hash == url_hash))
        cached_page = existing.scalar_one_or_none()

    try:
        fetched = await fetch_url(
            normalized_url,
            timeout_ms=body.timeout_ms,
            use_playwright=body.use_playwright,
        )
    except httpx.TimeoutException:
        if body.timeout_ms >= 5000:
            # Fallback to ARQ background job for long tasks
            job = await create_job(
                session,
                api_key_id=api_key.id,
                job_type="search_scrape",
                input_params=body.model_dump(),
                idempotency_key=compute_idempotency_key(api_key.id, "search_scrape", body.model_dump())
            )
            redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
            await redis.enqueue_job("run_scrape_job", job.id)
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={
                    "job_id": str(job.id),
                    "status": "queued",
                    "request_id": request_id,
                    "message": f"Scrape took longer than {body.timeout_ms}ms, falling back to background worker."
                }
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail={
                    "error": {
                        "code": "FETCH_TIMEOUT",
                        "message": f"Target URL did not respond within {body.timeout_ms}ms",
                        "request_id": request_id,
                        "details": {"timeout_ms": body.timeout_ms},
                    }
                },
            )
    except HTTPException:
        raise
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

    content_type = (fetched.headers.get("content-type") or "").lower()
    is_pdf = "application/pdf" in content_type or normalized_url.lower().split("?")[0].endswith(".pdf")

    if is_pdf and fetched.raw_bytes:
        from app.services.extractor import extract_pdf
        markdown, pdf_metadata = extract_pdf(fetched.raw_bytes)
        
        metadata_dict = {
            "title": pdf_metadata.get("title"),
            "description": pdf_metadata.get("description"),
            "og_image": None,
            "author": pdf_metadata.get("author"),
            "published_at": pdf_metadata.get("published_at"),
            "site_name": None,
            "language": None,
            "favicon_url": None,
            "canonical_url": normalized_url,
        }
        links = None
        raw_html = None
        content_hash = hashlib.sha256(fetched.raw_bytes).hexdigest()
        word_count = len(markdown.split())
        read_time_minutes = round(word_count / 200)
    else:
        raw_html = fetched.text
        content_hash = _content_hash(raw_html)
        
        if cached_page and cached_page.content_hash == content_hash:
            # Content matches existing hash; skip expensive DOM parsing
            await increment_counter("crawlclean_hash_hits_total")
            
            markdown = cached_page.markdown or ""
            metadata_dict = {
                "title": cached_page.title,
                "description": cached_page.description,
                "og_image": getattr(cached_page, "og_image", None),
                "author": cached_page.author if hasattr(cached_page, "author") else None,
                "published_at": None,
                "site_name": getattr(cached_page, "site_name", None),
                "language": getattr(cached_page, "language", None),
                "favicon_url": getattr(cached_page, "favicon_url", None),
                "canonical_url": cached_page.canonical_url or normalized_url,
            }
            links = None
            if body.include_links:
                from collections import namedtuple
                Links = namedtuple("Links", ["internal", "external"])
                links = Links(
                    internal=cached_page.links_internal or [],
                    external=cached_page.links_external or []
                )
            word_count = cached_page.word_count or 0
            read_time_minutes = cached_page.read_time_minutes or 0
        else:
            links = extract_links(raw_html, base_url=fetched.final_url or normalized_url) if body.include_links else None
    
            # Extract Metadata
            metadata_dict = extract_metadata(raw_html, normalized_url)
    
            cleaned = clean_html(raw_html)
            content_result = extract_content(cleaned)
            markdown = html_to_markdown(content_result)
    
            word_count = len(markdown.split())
            read_time_minutes = round(word_count / 200)

    page = cached_page
    if page is None:
        page = Page(url=normalized_url, canonical_url=normalized_url, url_hash=url_hash)
        session.add(page)

    page.url = normalized_url
    page.canonical_url = metadata_dict["canonical_url"] or normalize_url(fetched.final_url) if fetched.final_url else normalized_url
    page.content_hash = content_hash
    page.status_code = fetched.status_code
    page.title = metadata_dict["title"]
    page.description = metadata_dict["description"]
    page.markdown = markdown
    page.raw_html = raw_html if body.include_raw_html else None
    page.renderer = fetched.renderer
    page.links_internal = links.internal if links else None
    page.links_external = links.external if links else None
    page.word_count = word_count
    page.read_time_minutes = read_time_minutes
    page.fetch_duration_ms = fetched.duration_ms
    page.og_image = metadata_dict["og_image"]
    page.favicon_url = metadata_dict["favicon_url"]
    page.site_name = metadata_dict["site_name"]
    page.language = metadata_dict["language"]
    page.fetched_at = datetime.now(timezone.utc)

    await session.commit()

    final_resp = ScrapeResponse(
        url=page.url,
        canonical_url=page.canonical_url or page.url,
        status_code=page.status_code or 200,
        title=page.title,
        markdown=page.markdown or "",
        links=LinksModel(internal=links.internal, external=links.external) if links else None,
        metadata=MetadataModel(
            description=page.description,
            og_image=page.og_image,
            author=metadata_dict["author"],
            published_at=metadata_dict["published_at"],
            site_name=page.site_name,
            language=page.language,
            favicon_url=page.favicon_url,
            word_count=page.word_count,
            read_time_minutes=page.read_time_minutes,
            fetch_duration_ms=page.fetch_duration_ms or 0,
            renderer=page.renderer or "httpx",
        ),
        cached=False,
        cache_layer="none",
        request_id=request_id,
    )
    
    # Store fetched entry in redis if acceptable
    if ttl_seconds > 0:
        await redis.setex(redis_cache_key, 600, final_resp.model_dump_json())

    return final_resp
