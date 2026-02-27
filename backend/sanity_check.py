import httpx
import json
import time

BASE_URL = "http://localhost:8005"
API_KEY = "test-integration-key"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

def test_health():
    print("Testing /health...")
    response = httpx.get(f"{BASE_URL}/health", timeout=30.0)
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2))
    assert response.status_code == 200

def test_scrape_invalid_url():
    print("\nTesting /api/v1/scrape with invalid URL (Serialization Fix)...")
    payload = {"url": "not-a-valid-url"}
    response = httpx.post(f"{BASE_URL}/api/v1/scrape", headers=HEADERS, json=payload, timeout=30.0)
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2))
    assert response.status_code == 422
    # Check if 'details' exists and is a list (serialization fix)
    assert "details" in response.json()["error"]

def test_scrape_valid():
    print("\nTesting /api/v1/scrape with valid URL...")
    payload = {"url": "https://example.com", "cache_ttl_seconds": 0}
    response = httpx.post(f"{BASE_URL}/api/v1/scrape", headers=HEADERS, json=payload, timeout=30.0)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print("Scrape successful.")
    else:
        print(response.text)
    assert response.status_code == 200

def test_agent_idempotency():
    print("\nTesting /api/v1/agent/extract idempotency...")
    payload = {
        "url": "https://example.com",
        "prompt": "Extract the page title",
        "schema": {"title": "string"}
    }
    
    print("Submitting first request...")
    response1 = httpx.post(f"{BASE_URL}/api/v1/agent/extract", headers=HEADERS, json=payload, timeout=30.0)
    print(f"Status 1: {response1.status_code}")
    job_id1 = response1.json().get("job_id")
    print(f"Job ID 1: {job_id1}")
    
    print("Submitting second request (immediate)...")
    response2 = httpx.post(f"{BASE_URL}/api/v1/agent/extract", headers=HEADERS, json=payload, timeout=30.0)
    print(f"Status 2: {response2.status_code}")
    job_id2 = response2.json().get("job_id")
    print(f"Job ID 2: {job_id2}")
    
    assert response1.status_code == 202 or response1.status_code == 200
    assert response2.status_code == 202 or response2.status_code == 200
    assert job_id1 == job_id2
    print("Idempotency verified: Both requests returned the same Job ID.")

if __name__ == "__main__":
    try:
        test_health()
        test_scrape_invalid_url()
        test_scrape_valid()
        test_agent_idempotency()
        print("\nALL SANITY CHECKS PASSED!")
    except Exception as e:
        print(f"\nSANITY CHECK FAILED: {e}")
        import traceback
        traceback.print_exc()
