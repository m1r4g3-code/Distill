import pytest
import uuid
import hashlib
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from app.main import app
from app.db.models import ApiKey, Page
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
            text="""
            <html>
            <head>
                <title>Test Page</title>
                <meta property="og:title" content="OG Title">
                <meta property="og:description" content="OG Description">
                <meta property="og:image" content="https://example.com/og.jpg">
                <meta name="author" content="Jane Doe">
                <meta property="article:published_time" content="2024-01-01T00:00:00Z">
                <meta property="og:site_name" content="Example Site">
                <link rel="canonical" href="https://example.com/canonical">
                <link rel="icon" href="/favicon.ico">
            </head>
            <body lang="en">
                <h1>Hello World</h1>
                <p>This is a test.</p>
                <p>We use cookies on this site.</p>
                <p>Home > Blog > Article</p>
                <table>
                    <tr><th>Header 1</th><th>Header 2</th></tr>
                    <tr><td>Data 1</td><td>Data 2</td></tr>
                </table>
            </body>
            </html>
            """,
            duration_ms=100,
            renderer="httpx"
        )
        yield m

# --- Tests ---

@pytest.mark.asyncio
async def test_scrape_v1_1_0_features(mock_fetch_url):
    """Test v1.1.0 specific features in /scrape."""
    
    # Setup Mock Database Session
    mock_session = AsyncMock()
    
    # Mock the result of the API key lookup
    mock_key_result = MagicMock()
    mock_key_result.scalar_one_or_none.return_value = ApiKey(
        id=uuid.uuid4(),
        key_hash=sha256_hex("test-key"),
        name="Test",
        scopes=["scrape"],
        is_active=True,
        rate_limit=60
    )
    
    # Mock the result of the Page lookup (cache miss)
    mock_page_result = MagicMock()
    mock_page_result.scalar_one_or_none.return_value = None
    
    # Setup session.execute to return different mocks for different queries
    def execute_side_effect(query, *args, **kwargs):
        q_str = str(query).lower()
        m = MagicMock()
        if "from api_keys" in q_str:
            m.scalar_one_or_none.return_value = mock_key_result.scalar_one_or_none.return_value
        elif "from pages" in q_str:
            m.scalar_one_or_none.return_value = None
        return m
        
    mock_session.execute.side_effect = execute_side_effect
    
    # Override get_session dependency
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            payload = {
                "url": "https://example.com",
                "include_links": True
            }
            headers = {"X-API-Key": "test-key"}
            
            response = await ac.post("/api/v1/scrape", json=payload, headers=headers)
            
            assert response.status_code == 200
            data = response.json()
            
            # Check Metadata (Task 1 & 5)
            meta = data["metadata"]
            assert meta["author"] == "Jane Doe"
            assert meta["site_name"] == "Example Site"
            assert meta["language"] == "en"
            assert meta["og_image"] == "https://example.com/og.jpg"
            assert meta["favicon_url"] == "https://example.com/favicon.ico"
            
            # Check Word Count & Read Time (Task 4)
            assert meta["word_count"] > 0
            assert "read_time_minutes" in meta
            
            # Check Markdown Cleanliness (Task 2)
            markdown = data["markdown"]
            assert "We use cookies" not in markdown
            assert "Home > Blog > Article" not in markdown
            
            # Check Table Extraction (Task 3)
            assert "| Header 1 | Header 2 |" in markdown
            
    finally:
        app.dependency_overrides = {}
