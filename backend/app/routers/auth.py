import secrets
import httpx
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
