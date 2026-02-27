import pytest
import httpx
from unittest.mock import patch
from app.services.search_provider import SearchResult

@pytest.mark.asyncio
async def test_search_requires_auth(client: httpx.AsyncClient):
    response = await client.post(
        "/api/v1/search",
        json={"query": "test query"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["error"]["message"] == "Missing API key"

@pytest.mark.asyncio
@patch("app.routers.search.search")
async def test_search_sync_success(mock_search, client: httpx.AsyncClient, valid_api_key: str):
    mock_search.return_value = [
        SearchResult(rank=1, title="Test 1", url="https://example.com/1", snippet="Snippet 1"),
        SearchResult(rank=2, title="Test 2", url="https://example.com/2", snippet="Snippet 2")
    ]
    
    response = await client.post(
        "/api/v1/search",
        headers={"X-API-Key": valid_api_key},
        json={"query": "test query", "scrape_top_n": 0}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "test query"
    assert len(data["results"]) == 2
    assert "task_id" not in data or data["task_id"] is None

@pytest.mark.asyncio
@patch("app.routers.search.search")
@patch("app.routers.search._background_scrape_search")
async def test_search_async_success(mock_bg, mock_search, client: httpx.AsyncClient, valid_api_key: str):
    mock_search.return_value = [
        SearchResult(rank=1, title="Test 1", url="https://example.com/1", snippet="Snippet 1")
    ]
    
    response = await client.post(
        "/api/v1/search",
        headers={"X-API-Key": valid_api_key},
        json={"query": "async query", "scrape_top_n": 1}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["task_id"] is not None
    assert data["scrape_status"] == "processing"

@pytest.mark.asyncio
@patch("app.routers.search.search")
@patch("app.routers.search._background_scrape_search")
async def test_search_idempotency(mock_bg, mock_search, client: httpx.AsyncClient, valid_api_key: str):
    mock_search.return_value = [
        SearchResult(rank=1, title="Test 1", url="https://example.com/1", snippet="Snippet 1")
    ]
    
    payload = {"query": "idem query", "scrape_top_n": 1}
    
    # Run first
    response1 = await client.post(
        "/api/v1/search", headers={"X-API-Key": valid_api_key}, json=payload
    )
    assert response1.status_code == 200
    task_id = response1.json()["task_id"]
    
    # Run second time
    response2 = await client.post(
        "/api/v1/search", headers={"X-API-Key": valid_api_key}, json=payload
    )
    assert response2.status_code == 200
    assert response2.json()["task_id"] == task_id
    assert response2.headers.get("X-Idempotency-Hit") == "true"

@pytest.mark.asyncio
async def test_search_get_results_not_found(client: httpx.AsyncClient, valid_api_key: str):
    import uuid
    fake_id = str(uuid.uuid4())
    response = await client.get(
        f"/api/v1/search/results/{fake_id}",
        headers={"X-API-Key": valid_api_key}
    )
    assert response.status_code == 404
