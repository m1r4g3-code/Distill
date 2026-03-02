import secrets
import httpx
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import ApiKey
from app.db.session import get_session
from app.dependencies import sha256_hex
from app.routers.admin import ApiKeyResponse, ApiKeyCreateResponse, ApiKeyCreate

router = APIRouter(tags=["auth"])

class SyncAuthResponse(BaseModel):
    key: ApiKeyCreateResponse | None = None
    existing: bool

async def verify_supabase_jwt(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")

    token = authorization.split(" ")[1]

    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Supabase configuration missing")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_service_role_key
            }
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
            
        user_data = response.json()
        user_id = user_data.get("id")
        
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user data from token")
            
        return user_id

@router.options("/sync")
async def sync_auth_options():
    return {"message": "OK"}

@router.post("/sync", response_model=SyncAuthResponse)
async def sync_auth(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session)
):
    user_id = await verify_supabase_jwt(authorization)

    # Check if user already has an API key
    result = await session.execute(select(ApiKey).where(ApiKey.user_id == user_id))
    existing_key = result.scalars().first()

    if existing_key:
        return SyncAuthResponse(key=None, existing=True)

    # Create new API key
    raw_key = "sk_" + secrets.token_urlsafe(32)
    key_hash = sha256_hex(raw_key)

    api_key = ApiKey(
        key_hash=key_hash,
        name="Default API Key",
        rate_limit=settings.default_rate_limit,
        scopes=["scrape", "map", "agent", "search"],
        user_id=user_id
    )
    
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    key_response = ApiKeyCreateResponse(
        id=str(api_key.id),
        name=api_key.name,
        rate_limit=api_key.rate_limit,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        raw_key=raw_key
    )

    return SyncAuthResponse(key=key_response, existing=False)


@router.get("/keys", response_model=List[ApiKeyResponse])
async def list_user_keys(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session)
):
    user_id = await verify_supabase_jwt(authorization)
    
    result = await session.execute(select(ApiKey).where(ApiKey.user_id == user_id))
    keys = result.scalars().all()
    
    return [
        ApiKeyResponse(
            id=str(k.id),
            name=k.name,
            rate_limit=k.rate_limit,
            scopes=k.scopes,
            is_active=k.is_active,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
        )
        for k in keys
    ]


@router.options("/keys")
async def keys_options():
    return {"message": "OK"}

@router.post("/keys", response_model=ApiKeyCreateResponse)
async def create_user_key(
    body: ApiKeyCreate,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session)
):
    user_id = await verify_supabase_jwt(authorization)
    
    raw_key = "sk_" + secrets.token_urlsafe(32)
    key_hash = sha256_hex(raw_key)

    api_key = ApiKey(
        key_hash=key_hash,
        name=body.name or "Unnamed Key",
        rate_limit=body.rate_limit or settings.default_rate_limit,
        scopes=body.scopes or ["scrape", "map", "agent", "search"],
        user_id=user_id
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)
    
    return ApiKeyCreateResponse(
        id=str(api_key.id),
        name=api_key.name,
        rate_limit=api_key.rate_limit,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        raw_key=raw_key
    )


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_user_key(
    key_id: str,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session)
):
    user_id = await verify_supabase_jwt(authorization)
    
    result = await session.execute(select(ApiKey).where((ApiKey.id == key_id) & (ApiKey.user_id == user_id)))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found or unauthorized")
        
    api_key.is_active = False
    await session.commit()
    return None


# ── GET /auth/jobs ────────────────────────────────────────────────────────────

class JobSummary(BaseModel):
    job_id: str
    type: str
    status: str
    url: Optional[str] = None
    query: Optional[str] = None
    pages_discovered: int
    created_at: datetime
    completed_at: Optional[datetime] = None


@router.options("/jobs")
async def jobs_options():
    return {"message": "OK"}


@router.get("/jobs", response_model=List[JobSummary])
async def list_user_jobs(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session)
):
    from app.db.models import Job
    user_id = await verify_supabase_jwt(authorization)

    # Get all api_key ids for this user
    keys_result = await session.execute(
        select(ApiKey.id).where(ApiKey.user_id == user_id)
    )
    key_ids = [row[0] for row in keys_result.all()]

    if not key_ids:
        return []

    jobs_result = await session.execute(
        select(Job)
        .where(Job.api_key_id.in_(key_ids))
        .order_by(Job.created_at.desc())
        .limit(200)
    )
    jobs = jobs_result.scalars().all()

    return [
        JobSummary(
            job_id=str(j.id),
            type=j.type,
            status=j.status,
            url=j.input_params.get("url") if j.input_params else None,
            query=j.input_params.get("query") if j.input_params else None,
            pages_discovered=j.pages_discovered,
            created_at=j.created_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


# ── GET /auth/usage ───────────────────────────────────────────────────────────

class DailyPoint(BaseModel):
    date: str
    requests: int
    success: int


class EndpointStat(BaseModel):
    endpoint: str
    count: int


class UsageStats(BaseModel):
    total_requests: int
    success_rate: float
    total_jobs: int
    pages_extracted: int
    cache_hits: int
    requests_over_time: List[DailyPoint]
    requests_by_endpoint: List[EndpointStat]
    top_urls: List[dict]


@router.options("/usage")
async def usage_options():
    return {"message": "OK"}


@router.get("/usage", response_model=UsageStats)
async def get_user_usage(
    authorization: str | None = Header(default=None),
    period: str = "7d",
    session: AsyncSession = Depends(get_session)
):
    from app.db.models import Job
    from sqlalchemy import func, case
    user_id = await verify_supabase_jwt(authorization)

    # Get all api_key ids for this user
    keys_result = await session.execute(
        select(ApiKey.id).where(ApiKey.user_id == user_id)
    )
    key_ids = [row[0] for row in keys_result.all()]

    if not key_ids:
        return UsageStats(
            total_requests=0, success_rate=0.0, total_jobs=0,
            pages_extracted=0, cache_hits=0,
            requests_over_time=[], requests_by_endpoint=[],
            top_urls=[]
        )

    # Determine date range
    days = 30 if period == "30d" else (90 if period == "90d" else 7)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Job aggregates
    agg = await session.execute(
        select(
            func.count(Job.id).label("total"),
            func.sum(case((Job.status == "completed", 1), else_=0)).label("completed"),
            func.sum(Job.pages_discovered).label("pages"),
        )
        .where(Job.api_key_id.in_(key_ids))
        .where(Job.created_at >= since)
    )
    row = agg.one()
    total_jobs = row.total or 0
    completed_jobs = row.completed or 0
    pages_extracted = row.pages or 0
    success_rate = round((completed_jobs / total_jobs * 100), 1) if total_jobs > 0 else 0.0

    # Requests by endpoint (job type)
    by_type = await session.execute(
        select(Job.type, func.count(Job.id).label("cnt"))
        .where(Job.api_key_id.in_(key_ids))
        .where(Job.created_at >= since)
        .group_by(Job.type)
    )
    requests_by_endpoint = [
        EndpointStat(endpoint=r.type.replace("_", " ").title(), count=r.cnt)
        for r in by_type.all()
    ]

    # Daily time series — use text label in group_by to avoid ambiguity
    from sqlalchemy import text as sa_text
    trunc_expr = func.date_trunc("day", Job.created_at)
    daily_subq = (
        select(
            trunc_expr.label("day"),
            func.count(Job.id).label("total"),
            func.sum(case((Job.status == "completed", 1), else_=0)).label("success"),
        )
        .where(Job.api_key_id.in_(key_ids))
        .where(Job.created_at >= since)
        .group_by(trunc_expr)
        .order_by(trunc_expr)
    ).subquery()

    daily = await session.execute(select(daily_subq))
    daily_rows = daily.all()

    # Fill in any missing days
    date_map: dict[str, tuple[int, int]] = {}
    for r in daily_rows:
        key = r.day.strftime("%b %d") if r.day else "?"
        date_map[key] = (r.total or 0, r.success or 0)

    requests_over_time: List[DailyPoint] = []
    for i in range(days):
        d = (datetime.now(timezone.utc) - timedelta(days=days - 1 - i)).strftime("%b %d")
        t, s = date_map.get(d, (0, 0))
        requests_over_time.append(DailyPoint(date=d, requests=t, success=s))

    # Top URLs — fetch input_params rows and aggregate URL counts in Python
    # (avoids JSONB GROUP BY which fails in PostgreSQL)
    url_rows_result = await session.execute(
        select(Job.input_params)
        .where(Job.api_key_id.in_(key_ids))
        .where(Job.created_at >= since)
        .where(Job.input_params.isnot(None))
    )
    url_counts: dict[str, int] = {}
    for (params,) in url_rows_result.all():
        url = (params or {}).get("url")
        if url:
            url_counts[url] = url_counts.get(url, 0) + 1

    top_urls = [
        {"url": url, "count": count}
        for url, count in sorted(url_counts.items(), key=lambda x: -x[1])[:5]
    ]

    return UsageStats(
        total_requests=total_jobs,
        success_rate=success_rate,
        total_jobs=total_jobs,
        pages_extracted=int(pages_extracted),
        cache_hits=0,  # Cache tracking not yet implemented in DB
        requests_over_time=requests_over_time,
        requests_by_endpoint=requests_by_endpoint,
        top_urls=top_urls,
    )
