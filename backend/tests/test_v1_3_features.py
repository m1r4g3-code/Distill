import pytest
import httpx
import secrets
from unittest.mock import patch, AsyncMock
from app.services.fetcher import FetchResult
from app.dependencies import sha256_hex
from app.db.models import ApiKey

@pytest.mark.asyncio
@patch("app.routers.scrape.validate_ssrf")
@patch("app.routers.scrape.fetch_url")
async def test_redis_response_cache(mock_fetch_url, mock_ssrf, client: httpx.AsyncClient, valid_api_key: str, mock_redis):
    mock_ssrf.return_value = None
    # Mock first fetch
    mock_fetch_url.return_value = FetchResult(
        url="https://tester.com/cache",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body>Initial</body></html>",
        duration_ms=10,
        renderer="httpx",
        final_url="https://tester.com/cache"
    )

    # 1. Fresh scrape (layer: none)
    resp1 = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://tester.com/cache", "cache_ttl_seconds": 600}
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["cache_layer"] == "none"
    assert data1["cached"] is False

    # 2. Sequential scrape (layer: redis)
    # Mocking different return value to ensure it's NOT called
    mock_fetch_url.return_value = FetchResult(
        url="https://tester.com/cache",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body>CHANGED</body></html>",
        duration_ms=10,
        renderer="httpx",
        final_url="https://tester.com/cache"
    )

    resp2 = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://tester.com/cache", "cache_ttl_seconds": 600}
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["cache_layer"] == "redis"
    assert data2["cached"] is True
    assert "Initial" in data2["markdown"] # Result from first fetch

@pytest.mark.asyncio
@patch("app.routers.scrape.validate_ssrf")
@patch("app.routers.scrape.fetch_url")
@patch("app.routers.scrape.increment_counter")
async def test_content_hash_etag_logic(mock_inc, mock_fetch_url, mock_ssrf, client: httpx.AsyncClient, valid_api_key: str):
    mock_ssrf.return_value = None
    mock_inc.return_value = None
    # 1. Seed the DB with a page
    mock_fetch_url.return_value = FetchResult(
        url="https://tester.com/etag",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body>ETAG CONTENT</body></html>",
        duration_ms=10,
        renderer="httpx",
        final_url="https://tester.com/etag"
    )
    
    await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://tester.com/etag", "cache_ttl_seconds": 0} # No TTL cache
    )

    # 2. Refetch with same content but force_refresh=True (to bypass response cache)
    # The ETag logic should still catch that content is identical and skip extraction
    resp2 = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://tester.com/etag", "force_refresh": True}
    )
    
    # Check if hash hit counter was incremented
    # Look for 'crawlclean_hash_hits_total'
    calls = [c[0][0] for c in mock_inc.call_args_list]
    assert "crawlclean_hash_hits_total" in calls
    assert resp2.status_code == 200

@pytest.mark.asyncio
@patch("app.routers.scrape.validate_ssrf")
@patch("app.routers.scrape.fetch_url")
async def test_redis_sliding_window_rate_limit(mock_fetch_url, mock_ssrf, client: httpx.AsyncClient, db_session, mock_redis):
    mock_ssrf.return_value = None
    mock_fetch_url.return_value = FetchResult(
        url="https://e.com/",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html></html>",
        duration_ms=1,
        renderer="httpx",
        final_url="https://e.com/"
    )
    # 1. Create a key with low rate limit
    raw_key = "low_rate_" + secrets.token_urlsafe(16)
    key_hash = sha256_hex(raw_key)
    api_key = ApiKey(
        key_hash=key_hash,
        name="Low Rate Key",
        rate_limit=2,
        scopes=["scrape"]
    )
    db_session.add(api_key)
    await db_session.commit()

    # 2. Hit it 3 times
    headers = {"X-API-Key": raw_key}
    
    # First hit
    r1 = await client.post("/api/v1/scrape", headers=headers, json={"url": "https://e.com/1"})
    # Second hit
    r2 = await client.post("/api/v1/scrape", headers=headers, json={"url": "https://e.com/2"})
    # Third hit (should be blocked)
    r3 = await client.post("/api/v1/scrape", headers=headers, json={"url": "https://e.com/3"})
    
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
    assert "RATE_LIMITED" in r3.json()["detail"]["error"]["code"]
