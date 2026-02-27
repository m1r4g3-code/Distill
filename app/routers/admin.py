import secrets
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import ApiKey
from app.db.session import get_session
from app.dependencies import sha256_hex

router = APIRouter(tags=["admin"])


def require_admin_key(x_admin_key: str | None = Header(default=None)):
    if not x_admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing admin key")
    return x_admin_key


class ApiKeyCreate(BaseModel):
    name: str | None = None
    rate_limit: int | None = None
    scopes: list[str] | None = None


class ApiKeyResponse(BaseModel):
    id: str
    name: str | None
    rate_limit: int | None
    scopes: list[str] | None
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None


class ApiKeyCreateResponse(ApiKeyResponse):
    raw_key: str  # Only returned once upon creation


class ApiKeyUpdate(BaseModel):
    name: str | None = None
    rate_limit: int | None = None
    scopes: list[str] | None = None
    is_active: bool | None = None


@router.get("/keys", response_model=List[ApiKeyResponse])
async def list_api_keys(
    admin_key: str = Depends(require_admin_key),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(ApiKey))
    keys = result.scalars().all()
    # Pydantic will serialize the model directly
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


@router.post("/keys", response_model=ApiKeyCreateResponse)
async def create_api_key(
    body: ApiKeyCreate,
    admin_key: str = Depends(require_admin_key),
    session: AsyncSession = Depends(get_session)
):
    raw_key = "sk_" + secrets.token_urlsafe(32)
    key_hash = sha256_hex(raw_key)

    api_key = ApiKey(
        key_hash=key_hash,
        name=body.name or "Unnamed Key",
        rate_limit=body.rate_limit or settings.default_rate_limit,
        scopes=body.scopes or ["scrape", "map", "agent"]
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


@router.patch("/keys/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: str,
    body: ApiKeyUpdate,
    admin_key: str = Depends(require_admin_key),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
        
    if body.name is not None:
        api_key.name = body.name
    if body.rate_limit is not None:
        api_key.rate_limit = body.rate_limit
    if body.scopes is not None:
        api_key.scopes = body.scopes
    if body.is_active is not None:
        api_key.is_active = body.is_active
        
    await session.commit()
    await session.refresh(api_key)
    
    return ApiKeyResponse(
        id=str(api_key.id),
        name=api_key.name,
        rate_limit=api_key.rate_limit,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
    )


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    admin_key: str = Depends(require_admin_key),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
        
    api_key.is_active = False
    await session.commit()
    return None
