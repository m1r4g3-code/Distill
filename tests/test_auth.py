import pytest
import httpx
from unittest.mock import patch
from app.dependencies import sha256_hex

@pytest.fixture
def auth_test_url():
    return "/api/v1/scrape"

@pytest.fixture
def auth_test_payload():
    return {"url": "https://example.com"}

@pytest.mark.asyncio
async def test_auth_missing_key(client: httpx.AsyncClient, auth_test_url: str, auth_test_payload: dict):
    response = await client.post(auth_test_url, json=auth_test_payload)
    assert response.status_code == 401
    assert response.json()["detail"]["error"]["code"] == "UNAUTHORIZED"
    assert response.json()["detail"]["error"]["message"] == "Missing API key"

@pytest.mark.asyncio
async def test_auth_invalid_key(client: httpx.AsyncClient, auth_test_url: str, auth_test_payload: dict):
    response = await client.post(
        auth_test_url, 
        headers={"X-API-Key": "invalid-key-value"},
        json=auth_test_payload
    )
    assert response.status_code == 401
    assert response.json()["detail"]["error"]["code"] == "UNAUTHORIZED"
    assert response.json()["detail"]["error"]["message"] == "Invalid API key"

@pytest.mark.asyncio
async def test_auth_missing_scope(client: httpx.AsyncClient, db_session, auth_test_url: str, auth_test_payload: dict):
    from app.db.models import ApiKey
    key_val = "test-scope-key"
    hashed = sha256_hex(key_val)
    
    api_key = ApiKey(
        key_hash=hashed,
        name="Test Scope Key",
        scopes=["other_scope"],  # Missing 'scrape' scope
    )
    db_session.add(api_key)
    await db_session.commit()
    
    response = await client.post(
        auth_test_url, 
        headers={"X-API-Key": key_val},
        json=auth_test_payload
    )
    assert response.status_code == 403
    assert response.json()["detail"]["error"]["code"] == "FORBIDDEN"
    assert response.json()["detail"]["error"]["message"] == "API key missing required scope"

@pytest.mark.asyncio
async def test_auth_rate_limit_exceeded(client: httpx.AsyncClient, db_session, auth_test_url: str, auth_test_payload: dict):
    from app.db.models import ApiKey
    key_val = "test-rate-key"
    hashed = sha256_hex(key_val)
    
    # Create key with rate limit of 1
    api_key = ApiKey(
        key_hash=hashed,
        name="Test Rate Key",
        scopes=["scrape"],
        rate_limit=1
    )
    db_session.add(api_key)
    await db_session.commit()
    
    # Since we can actually reach the actual fetch with the first request and it's not mocked,
    # let's mock fetch_url to prevent actual network calls for the first request
    with patch("app.routers.scrape.fetch_url") as mock_fetch:
        from app.services.fetcher import FetchResult
        mock_fetch.return_value = FetchResult(
            url="https://example.com/",
            status_code=200,
            headers={"content-type": "text/html"},
            text="<html></html>",
            duration_ms=10,
            renderer="httpx"
        )
        # First request should succeed (using 1 out of 1 limit)
        resp1 = await client.post(
            auth_test_url, 
            headers={"X-API-Key": key_val},
            json=auth_test_payload
        )
        assert resp1.status_code == 200

        # Second request should fail with 429
        resp2 = await client.post(
            auth_test_url, 
            headers={"X-API-Key": key_val},
            json=auth_test_payload
        )
        assert resp2.status_code == 429
        assert resp2.json()["detail"]["error"]["code"] == "RATE_LIMITED"
        assert resp2.json()["detail"]["error"]["message"] == "API key over rate limit"

@pytest.mark.asyncio
async def test_auth_inactive_key(client: httpx.AsyncClient, db_session, auth_test_url: str, auth_test_payload: dict):
    from app.db.models import ApiKey
    key_val = "test-inactive-key"
    hashed = sha256_hex(key_val)
    
    api_key = ApiKey(
        key_hash=hashed,
        name="Test Inactive Key",
        scopes=["scrape"],
        is_active=False
    )
    db_session.add(api_key)
    await db_session.commit()
    
    response = await client.post(
        auth_test_url, 
        headers={"X-API-Key": key_val},
        json=auth_test_payload
    )
    assert response.status_code == 401
    assert response.json()["detail"]["error"]["code"] == "UNAUTHORIZED"
