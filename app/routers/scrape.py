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


router = APIRouter(tags=["scrape"])


class ScrapeRequest(BaseModel):
    url: str
    respect_robots: bool = False
    use_playwright: str = Field(default="auto", pattern="^(auto|always|never)$")
    include_links: bool = True
    include_raw_html: bool = False
    timeout_ms: int = Field(default=20000, ge=1000, le=60000)
    cache_ttl_seconds: int | None = Field(default=None, ge=0, le=86400)

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


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape(
    body: ScrapeRequest,
    api_key: ApiKey = Depends(require_scope("scrape")),
    session: AsyncSession = Depends(get_session),
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

    existing = await session.execute(select(Page).where(Page.url_hash == url_hash))
    cached_page = existing.scalar_one_or_none()
    if cached_page and cached_page.markdown and ttl_seconds > 0:
        fetched_at = _as_utc(cached_page.fetched_at)
        now = datetime.now(timezone.utc)
        if (now - fetched_at).total_seconds() <= ttl_seconds:
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
            return ScrapeResponse(
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
                    published_at=None,  # We'll fix this in a bit or just use existing
                    site_name=getattr(cached_page, "site_name", None),
                    language=getattr(cached_page, "language", None),
                    favicon_url=getattr(cached_page, "favicon_url", None),
                    word_count=cached_page.word_count,
                    read_time_minutes=getattr(cached_page, "read_time_minutes", None),
                    fetch_duration_ms=cached_page.fetch_duration_ms or 0,
                    renderer=cached_page.renderer or "httpx",
                ),
                cached=True,
                request_id=request_id,
            )

    try:
        fetched = await fetch_url(
            normalized_url,
            timeout_ms=body.timeout_ms,
            use_playwright=body.use_playwright,
        )
    except httpx.TimeoutException:
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

    raw_html = fetched.text
    links = extract_links(raw_html, base_url=fetched.final_url or normalized_url) if body.include_links else None

    # Extract Metadata
    metadata_dict = extract_metadata(raw_html, normalized_url)

    cleaned = clean_html(raw_html)
    extracted_html = extract_content(cleaned)
    markdown = html_to_markdown(extracted_html)

    word_count = len(markdown.split())
    read_time_minutes = round(word_count / 200)

    page = cached_page
    if page is None:
        page = Page(url=normalized_url, canonical_url=normalized_url, url_hash=url_hash)
        session.add(page)

    page.url = normalized_url
    page.canonical_url = metadata_dict["canonical_url"] or normalize_url(fetched.final_url) if fetched.final_url else normalized_url
    page.content_hash = _content_hash(raw_html)
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

    return ScrapeResponse(
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
        request_id=request_id,
    )
