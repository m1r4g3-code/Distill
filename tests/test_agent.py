import pytest
import uuid
import json
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from app.main import app
from app.db.models import ApiKey, Job, Extraction
from app.db.session import get_session
from app.services.fetcher import FetchResult

@pytest.fixture
def mock_fetch_url():
    with patch("app.routers.agent.fetch_url", new_callable=AsyncMock) as m:
        m.return_value = FetchResult(
            url="https://news.ycombinator.com",
            status_code=200,
            headers={"content-type": "text/html"},
            text="<html><body><h1>Hacker News</h1><ul><li>Story 1</li><li>Story 2</li></ul></body></html>",
            duration_ms=100,
            renderer="httpx"
        )
        yield m

@pytest.fixture
def mock_gemini():
    with patch("app.services.llm.genai.GenerativeModel") as m:
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps({"stories": ["Story 1", "Story 2"]})
        mock_model.generate_content.return_value = mock_response
        m.return_value = mock_model
        yield m

@pytest.mark.asyncio
async def test_agent_extract_flow(mock_fetch_url, mock_gemini):
    """
    Tests the full flow of agent extraction:
    1. Request extraction (creates job)
    2. Mock background execution
    3. Check results
    """
    # Mock Database
    mock_session = AsyncMock()
    
    # Mock API Key lookup
    mock_key_result = MagicMock()
    mock_key_result.scalar_one_or_none.return_value = ApiKey(
        id=uuid.uuid4(),
        name="Test",
        scopes=["scrape", "agent"],
        is_active=True
    )
    
    # Mock Job lookup
    job_id = uuid.uuid4()
    mock_job = Job(
        id=job_id,
        api_key_id=mock_key_result.scalar_one_or_none.return_value.id,
        type="agent_extract",
        status="completed"
    )
    
    # Mock Extraction lookup
    mock_extraction = Extraction(
        job_id=job_id,
        data={"stories": ["Story 1", "Story 2"]},
        prompt="Extract stories"
    )
    
    # Setup session.execute returns
    def side_effect(query, *args, **kwargs):
        m = MagicMock()
        q_str = str(query).lower()
        if "from api_keys" in q_str:
            m.scalar_one_or_none.return_value = mock_key_result.scalar_one_or_none.return_value
        elif "from jobs" in q_str:
            m.scalar_one_or_none.return_value = mock_job
        elif "from extractions" in q_str:
            m.scalar_one_or_none.return_value = mock_extraction
        return m

    mock_session.execute.side_effect = side_effect
    
    app.dependency_overrides[get_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Start extraction
            payload = {
                "url": "https://news.ycombinator.com",
                "prompt": "Extract stories",
                "schema": {"type": "object"}
            }
            headers = {"X-API-Key": "test-key"}
            
            response = await ac.post("/api/v1/agent/extract", json=payload, headers=headers)
            assert response.status_code == 202
            data = response.json()
            assert "job_id" in data
            
            # 2. Get results (mocking that the job is already completed)
            results_response = await ac.get(f"/api/v1/jobs/{data['job_id']}/results", headers=headers)
            assert results_response.status_code == 200
            results_data = results_response.json()
            assert results_data["type"] == "agent_extract"
            assert results_data["data"]["stories"] == ["Story 1", "Story 2"]
            
    finally:
        app.dependency_overrides = {}
