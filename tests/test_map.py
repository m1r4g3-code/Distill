import pytest
import httpx
from unittest.mock import patch

@pytest.mark.asyncio
async def test_map_requires_auth(client: httpx.AsyncClient):
    response = await client.post(
        "/api/v1/map",
        json={"url": "https://example.com"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["error"]["message"] == "Missing API key"


@pytest.mark.asyncio
async def test_map_invalid_url(client: httpx.AsyncClient, valid_api_key: str):
    response = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "not-a-url"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.map.crawl_site")
async def test_map_success_queued(mock_crawl, client: httpx.AsyncClient, valid_api_key: str):
    # Setup mock to just return immediately (background task)
    mock_crawl.return_value = None

    response = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com", "max_depth": 1, "max_pages": 5}
    )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "job_id" in data


@pytest.mark.asyncio
async def test_map_validation_max_depth(client: httpx.AsyncClient, valid_api_key: str):
    response = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com", "max_depth": 15, "max_pages": 5}
    )
    # 15 should fail validation if max depth allowed is e.g. 10 
    # (assuming spec says 10, let's check response code)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_map_validation_max_pages(client: httpx.AsyncClient, valid_api_key: str):
    response = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com", "max_depth": 2, "max_pages": 20000}
    )
    # 20000 should fail validation if max allowed is 10000
    assert response.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.map.validate_ssrf")
async def test_map_ssrf_blocked(mock_validate, client: httpx.AsyncClient, valid_api_key: str):
    from fastapi import HTTPException
    mock_validate.side_effect = HTTPException(status_code=403, detail="SSRF blocked")
    
    response = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "http://127.0.0.1/admin"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_map_idempotency(client: httpx.AsyncClient, valid_api_key: str):
    # First request
    response1 = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/idem"}
    )
    assert response1.status_code == 202
    job_id1 = response1.json()["job_id"]

    # Second identical request should return 200 and same job_id
    response2 = await client.post(
        "/api/v1/map",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/idem"}
    )
    assert response2.status_code == 200
    assert response2.json()["job_id"] == job_id1
    assert response2.headers.get("X-Idempotency-Hit") == "true"
