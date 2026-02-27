import pytest
import asyncio
from typing import AsyncGenerator
import httpx

from app.main import app
from app.db.session import engine, AsyncSessionLocal
from app.db.models import Base, ApiKey
from app.dependencies import sha256_hex
from app.db_redis import get_redis
import fakeredis.aioredis

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def mock_redis():
    """Provides a global FakeRedis instance and overrides the FastAPI dependency."""
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    
    async def override_get_redis():
        yield redis
        
    app.dependency_overrides[get_redis] = override_get_redis
    yield redis
    app.dependency_overrides.clear()


@pytest.fixture
async def db_session() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


@pytest.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def valid_api_key(db_session):
    from sqlalchemy import select
    key_val = "test-scrape-key"
    hashed = sha256_hex(key_val)
    
    result = await db_session.execute(select(ApiKey).where(ApiKey.key_hash == hashed))
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        api_key = ApiKey(
            key_hash=hashed,
            name="Test Scrape Key",
            scopes=["scrape", "map", "agent", "search"],
        )
        db_session.add(api_key)
        await db_session.commit()
        
    return key_val


@pytest.fixture
def auth_headers(valid_api_key):
    return {"Authorization": f"Bearer {valid_api_key}"}
