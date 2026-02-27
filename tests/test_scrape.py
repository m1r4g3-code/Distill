import pytest
import httpx
from unittest.mock import patch
from app.db.models import ApiKey
from app.dependencies import sha256_hex

# We will need some fixtures to insert a valid API key into the test database
# and potentially mock the fetcher to avoid real network requests.




@pytest.mark.asyncio
async def test_scrape_requires_auth(client: httpx.AsyncClient):
    response = await client.post(
        "/api/v1/scrape",
        json={"url": "https://example.com"}
    )
    assert response.status_code == 401
    data = response.json()
    assert data["detail"]["error"]["message"] == "Missing API key"


@pytest.mark.asyncio
async def test_scrape_invalid_url(client: httpx.AsyncClient, valid_api_key: str):
    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "not-a-url"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
async def test_scrape_success(mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    from app.services.fetcher import FetchResult
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body><h1>Test Title</h1><p>Test Content</p></body></html>",
        duration_ms=100,
        renderer="httpx",
        final_url="https://example.com"
    )

    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://example.com/"
    assert "Test Title" in data["title"]
    assert "Test Content" in data["markdown"]
    assert data["cached"] is False


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
async def test_scrape_caches_result(mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    from app.services.fetcher import FetchResult
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com/cached",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body><p>Cache Content</p></body></html>",
        duration_ms=50,
        renderer="httpx",
        final_url="https://example.com/cached"
    )

    # First request
    response1 = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/cached"}
    )
    assert response1.status_code == 200
    assert response1.json()["cached"] is False

    # Second request should be cached
    response2 = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/cached"}
    )
    assert response2.status_code == 200
    assert response2.json()["cached"] is True
    # The mock fetch should only have been called once
    mock_fetch_url.assert_called_once()


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
async def test_scrape_force_refresh(mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    from app.services.fetcher import FetchResult
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com/refresh",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body><p>Initial Content</p></body></html>",
        duration_ms=50,
        renderer="httpx",
        final_url="https://example.com/refresh"
    )

    # First request
    await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/refresh"}
    )

    # Change mock for the second request
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com/refresh",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body><p>Refreshed Content</p></body></html>",
        duration_ms=50,
        renderer="httpx",
        final_url="https://example.com/refresh"
    )

    # Second request with force_refresh=True
    response2 = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/refresh", "force_refresh": True}
    )
    assert response2.status_code == 200
    assert response2.json()["cached"] is False
    assert "Refreshed Content" in response2.json()["markdown"]
    assert mock_fetch_url.call_count == 2


@pytest.mark.asyncio
@patch("app.routers.scrape.validate_ssrf")
async def test_scrape_ssrf_blocked(mock_validate, client: httpx.AsyncClient, valid_api_key: str):
    from fastapi import HTTPException
    # Mock SSRF validation to fail
    mock_validate.side_effect = HTTPException(status_code=403, detail="SSRF blocked")
    
    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "http://169.254.169.254/latest/meta-data/"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
@patch("app.routers.scrape.is_allowed_by_robots_async")
async def test_scrape_robots_txt_blocked(mock_robots, client: httpx.AsyncClient, valid_api_key: str):
    mock_robots.return_value = False
    
    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/private", "respect_robots": True}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["error"]["code"] == "ROBOTS_BLOCKED"


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
async def test_scrape_timeout(mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    mock_fetch_url.side_effect = httpx.TimeoutException("Timeout")
    
    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/timeout"}
    )
    assert response.status_code == 504
    assert response.json()["detail"]["error"]["code"] == "FETCH_TIMEOUT"


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
async def test_scrape_playwright_forced(mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    from app.services.fetcher import FetchResult
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com/pw",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body><p>Playwright Content</p></body></html>",
        duration_ms=150,
        renderer="playwright",
        final_url="https://example.com/pw"
    )

    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/pw", "use_playwright": "always"}
    )
    assert response.status_code == 200
    assert response.json()["metadata"]["renderer"] == "playwright"
    # Ensure fetch_url was actually called with use_playwright="always"
    mock_fetch_url.assert_called_with("https://example.com/pw", timeout_ms=20000, use_playwright="always")


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
async def test_scrape_playwright_forbidden(mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    from app.services.fetcher import FetchResult
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com/nopw",
        status_code=200,
        headers={"content-type": "text/html"},
        text="<html><body><p>JS Required</p></body></html>",
        duration_ms=50,
        renderer="httpx",
        final_url="https://example.com/nopw"
    )

    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/nopw", "use_playwright": "never"}
    )
    assert response.status_code == 200
    assert response.json()["metadata"]["renderer"] == "httpx"
    mock_fetch_url.assert_called_with("https://example.com/nopw", timeout_ms=20000, use_playwright="never")


@pytest.mark.asyncio
@patch("app.routers.scrape.fetch_url")
@patch("app.services.extractor.extract_pdf")
async def test_scrape_pdf_content(mock_extract_pdf, mock_fetch_url, client: httpx.AsyncClient, valid_api_key: str):
    from app.services.fetcher import FetchResult
    mock_fetch_url.return_value = FetchResult(
        url="https://example.com/doc.pdf",
        status_code=200,
        headers={"content-type": "application/pdf"},
        text="",
        duration_ms=100,
        renderer="httpx",
        final_url="https://example.com/doc.pdf",
        raw_bytes=b"%PDF-1.4 mock pdf bytes"
    )
    mock_extract_pdf.return_value = ("# Mock PDF Content", {"title": "PDF Title"})

    response = await client.post(
        "/api/v1/scrape",
        headers={"X-API-Key": valid_api_key},
        json={"url": "https://example.com/doc.pdf"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "# Mock PDF Content" in data["markdown"]
    assert data["title"] == "PDF Title"

