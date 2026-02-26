import hashlib
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import ApiKey
from app.db.session import get_session
from app.middleware.logging import get_request_id


rate_windows: dict[str, list[float]] = defaultdict(list)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def check_rate_limit(key_hash: str, limit: int) -> bool:
    now = time.time()
    window = [t for t in rate_windows[key_hash] if t > now - 60]
    rate_windows[key_hash] = window
    if len(window) >= limit:
        return False
    rate_windows[key_hash].append(now)
    return True


async def require_api_key(
    required_scope: str,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_session),
) -> ApiKey:
    api_key = await authenticate_api_key(x_api_key=x_api_key, session=session)
    if required_scope not in (api_key.scopes or []):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "API key missing required scope",
                    "request_id": get_request_id(),
                    "details": {"required_scope": required_scope},
                }
            },
        )

    return api_key


async def authenticate_api_key(
    x_api_key: str | None,
    session: AsyncSession,
) -> ApiKey:
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Missing API key",
                    "request_id": get_request_id(),
                    "details": {},
                }
            },
        )

    key_hash = sha256_hex(x_api_key)
    result = await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    api_key = result.scalar_one_or_none()

    if not api_key or not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Invalid API key",
                    "request_id": get_request_id(),
                    "details": {},
                }
            },
        )

    limit = api_key.rate_limit or settings.default_rate_limit
    if not check_rate_limit(api_key.key_hash, limit):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": "API key over rate limit",
                    "request_id": get_request_id(),
                    "details": {"limit_per_minute": limit},
                }
            },
        )

    api_key.last_used_at = datetime.now(timezone.utc)
    try:
        await session.commit()
    except Exception:
        await session.rollback()

    return api_key


def require_scope(required_scope: str):
    async def _dep(
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
        session: AsyncSession = Depends(get_session),
    ) -> ApiKey:
        return await require_api_key(
            required_scope=required_scope,
            x_api_key=x_api_key,
            session=session,
        )

    return _dep


def require_any_scope(required_scopes: list[str]):
    async def _dep(
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
        session: AsyncSession = Depends(get_session),
    ) -> ApiKey:
        api_key = await authenticate_api_key(x_api_key=x_api_key, session=session)
        scopes = set(api_key.scopes or [])
        if not any(scope in scopes for scope in required_scopes):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": {
                        "code": "UNAUTHORIZED",
                        "message": "API key missing required scope",
                        "request_id": get_request_id(),
                        "details": {"required_scopes": required_scopes},
                    }
                },
            )
        return api_key

    return _dep
