import asyncio
import httpx
import sys

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-API-Key": "test-integration-key"}

def log(test_name, success, message="", response=None):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"[{status}] {test_name}: {message}")
    if not success and response:
        print(f"   Response: {response.status_code} - {response.text}")

async def run_tests():
    print(f"🚀 Starting v1.1.2 Patch Local Tests...")
    
    # Use a client that doesn't reuse connections across crashes if needed
    async with httpx.AsyncClient(timeout=90, http2=False) as client:
        
        # Test 1: Invalid URL format (Fix 2 & 4)
        try:
            r = await client.post(f"{BASE_URL}/scrape", headers=HEADERS,
                                  json={"url": "not-a-valid-url"})
            log("Invalid URL → 422", r.status_code == 422, f"status={r.status_code}", r)
            if r.status_code == 422:
                data = r.json()
                log("Error format check", "error" in data and data["error"]["code"] == "VALIDATION_ERROR")
        except Exception as e:
            log("Invalid URL → 422", False, f"Test crashed: {e}")

        # Test 2: Non-existent job (Fix 4 & 5)
        try:
            r = await client.get(f"{BASE_URL}/jobs/non-existent-job-id-000", headers=HEADERS)
            log("Non-existent job → 404", r.status_code == 404, f"status={r.status_code}", r)
            if r.status_code == 404:
                data = r.json()
                log("Error format check", "error" in data and data["error"]["code"] == "JOB_NOT_FOUND")
        except Exception as e:
            log("Non-existent job → 404", False, f"Test crashed: {e}")

        # Test 3: DNS Resolution Failure (Fix 1 & 4)
        try:
            r = await client.post(f"{BASE_URL}/scrape", headers=HEADERS,
                                  json={"url": "https://this-domain-does-not-exist-xyz.com"})
            log("DNS Resolution Failure → 400", r.status_code == 400, f"status={r.status_code}", r)
            if r.status_code == 400:
                data = r.json()
                log("Error code check", data.get("error", {}).get("code") == "DNS_RESOLUTION_FAILED")
        except Exception as e:
            log("DNS Resolution Failure → 400", False, f"Test crashed: {e}")

        # Test 4: SSRF Blocked (Fix 1)
        try:
            r = await client.post(f"{BASE_URL}/scrape", headers=HEADERS,
                                  json={"url": "http://169.254.169.254"})
            log("SSRF Blocked → 403", r.status_code == 403, f"status={r.status_code}", r)
        except Exception as e:
            log("SSRF Blocked → 403", False, f"Test crashed: {e}")

        # Test 5: Real Scrape - httpbin.org (Fix 1: Title)
        try:
            r = await client.post(f"{BASE_URL}/scrape", headers=HEADERS,
                                  json={"url": "https://httpbin.org/html"})
            if r.status_code == 200:
                data = r.json()
                log("httpbin.org title", data.get("title") is not None, f"title={data.get('title')}")
            else:
                log("httpbin.org scrape", False, f"status={r.status_code}", r)
        except Exception as e:
            log("httpbin.org scrape", False, f"Test crashed: {e}")

        # Test 6: Real Scrape - Wikipedia (Fix 2: Tables)
        try:
            r = await client.post(f"{BASE_URL}/scrape", headers=HEADERS,
                                  json={"url": "https://en.wikipedia.org/wiki/Python_(programming_language)"})
            if r.status_code == 200:
                data = r.json()
                markdown = data.get("markdown", "")
                log("Wikipedia tables", "|" in markdown, "Found pipe characters in markdown")
            else:
                log("Wikipedia scrape", False, f"status={r.status_code}", r)
        except Exception as e:
            log("Wikipedia scrape", False, f"Test crashed: {e}")

        # Test 7: Real Scrape - react.dev (Fix 3: Playwright)
        try:
            r = await client.post(f"{BASE_URL}/scrape", headers=HEADERS,
                                  json={"url": "https://react.dev"})
            if r.status_code == 200:
                data = r.json()
                renderer = data.get("metadata", {}).get("renderer")
                log("react.dev renderer", renderer == "playwright", f"renderer={renderer}")
            else:
                log("react.dev scrape", False, f"status={r.status_code}", r)
        except Exception as e:
            log("react.dev scrape", False, f"Test crashed: {e}")

    print(f"\n🏁 v1.1.2 Patch Testing Complete.")

if __name__ == "__main__":
    asyncio.run(run_tests())
