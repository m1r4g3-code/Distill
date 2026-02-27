import pytest
import httpx
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_agent_extract_requires_auth(client: httpx.AsyncClient):
    response = await client.post(
        "/api/v1/agent/extract",
        json={"url": "https://example.com", "prompt": "Extract content."}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
@patch("app.routers.agent.validate_ssrf")
async def test_agent_extract_ssrf_blocked(mock_validate, client: httpx.AsyncClient, valid_api_key: str):
    from fastapi import HTTPException
    mock_validate.side_effect = HTTPException(status_code=403, detail="SSRF blocked")
    
    response = await client.post(
        "/api/v1/agent/extract",
        headers={"X-API-Key": valid_api_key},
        json={"url": "http://127.0.0.1", "prompt": "extract"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
@patch("app.routers.agent.create_pool")
async def test_agent_extract_success_queued(mock_create_pool, client: httpx.AsyncClient, valid_api_key: str):
    mock_redis = AsyncMock()
    mock_create_pool.return_value = mock_redis
    # Success returns 202 Accepted
    response = await client.post(
        "/api/v1/agent/extract",
        headers={"X-API-Key": valid_api_key},
        json={
            "url": "https://example.com/item/1",
            "prompt": "Get price and title.",
            "schema": {"type": "object", "properties": {"price": {"type": "string"}}}
        }
    )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "job_id" in data
    assert mock_redis.enqueue_job.called


@pytest.mark.asyncio
@patch("app.routers.agent.create_pool")
async def test_agent_extract_idempotency(mock_create_pool, client: httpx.AsyncClient, valid_api_key: str):
    mock_redis = AsyncMock()
    mock_create_pool.return_value = mock_redis
    payload = {
        "url": "https://example.com/idem",
        "prompt": "Get price and title.",
    }

    # First request
    response1 = await client.post(
        "/api/v1/agent/extract",
        headers={"X-API-Key": valid_api_key},
        json=payload
    )
    assert response1.status_code == 202
    job_id1 = response1.json()["job_id"]

    # Second identical request
    response2 = await client.post(
        "/api/v1/agent/extract",
        headers={"X-API-Key": valid_api_key},
        json=payload
    )
    # Should be 200 OK and return the same job ID
    assert response2.status_code == 200
    assert response2.json()["job_id"] == job_id1
    assert response2.headers.get("X-Idempotency-Hit") == "true"
