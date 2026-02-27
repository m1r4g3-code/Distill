import pytest
import uuid
import hashlib
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from app.main import app
from app.db.models import ApiKey
from app.services.fetcher import FetchResult
from app.db.session import get_session

# --- Mocks ---

def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

@pytest.fixture
def mock_fetch_url():
    with patch("app.routers.scrape.fetch_url", new_callable=AsyncMock) as m:
        m.return_value = FetchResult(
            url="https://example.com",
            status_code=200,
            headers={"content-type": "text/html"},
            text="<html><head><title>Test Page</title></head><body><h1>Hello World</h1><p>This is a test.</p><a href='/internal'>Link</a></body></html>",
            duration_ms=100,
            renderer="httpx"
        )
        yield m

# --- Tests ---

@pytest.mark.asyncio
async def test_health_check(monkeypatch):
    """Test that the health check endpoint is accessible."""
    # Mock structlog and playwright for the health check to avoid subprocess on Windows test loop
    import sys
    import structlog
    monkeypatch.setattr(structlog, "get_logger", MagicMock())
    
    with patch("playwright.async_api.async_playwright") as mock_pw_context, \
         patch("app.db_redis.ping_redis") as mock_redis_ping:
        # Mock Redis
        mock_redis_ping.return_value = True
        
        # Mock the context manager returned by async_playwright()
        mock_pw = AsyncMock()
        mock_pw_context.return_value.__aenter__.return_value = mock_pw
        
        # Mock the browser returned by p.chromium.launch()
        mock_browser = AsyncMock()
        mock_pw.chromium.launch.return_value = mock_browser
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] in ("ok", "degraded")

@pytest.mark.asyncio
async def test_read_docs():
    """Test that the API documentation is accessible."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/docs")
        assert response.status_code == 200

@pytest.mark.asyncio
async def test_scrape_unauthorized():
    """Test that scraping fails without an API key."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/v1/scrape", json={"url": "https://example.com"})
        assert response.status_code == 401

@pytest.mark.asyncio
async def test_scrape_success(mock_fetch_url):
    """Test a successful scrape with mocked dependencies."""
    
    # 1. Setup Mock Database Session
    mock_session = AsyncMock()
    
    # Mock the result of the API key lookup
    mock_result = MagicMock()
    mock_api_key = ApiKey(
        id=uuid.uuid4(),
        key_hash=sha256_hex("test-key"),
        name="Test",
        scopes=["scrape"],
        is_active=True,
        rate_limit=60
    )
    # The first execute is checking for existing page, the second for api key.
    # We will just make it return the api_key when scalar_one_or_none is called.
    
    def side_effect(query, *args, **kwargs):
        m = MagicMock()
        q_str = str(query).lower()
        if "from api_keys" in q_str:
            m.scalar_one_or_none.return_value = mock_api_key
        else:
            m.scalar_one_or_none.return_value = None
        return m
        
    mock_session.execute.side_effect = side_effect
    
    # Override get_session dependency
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            payload = {
                "url": "https://example.com",
                "include_links": True
            }
            # Provide the API key header
            headers = {"X-API-Key": "test-key"}
            
            response = await ac.post("/api/v1/scrape", json=payload, headers=headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["url"] == "https://example.com/"
            assert "Test Page" in data["title"]
            assert "Hello World" in data["markdown"]
            assert data["links"]["internal"] == ["https://example.com/internal"]
            
    finally:
        # Cleanup overrides
        app.dependency_overrides = {}
