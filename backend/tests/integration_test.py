import asyncio
import sys
import argparse
from httpx import AsyncClient, ASGITransport
from app.main import app

# Using the seeded API key
TEST_KEY = "test-integration-key"

async def run_scrape(url: str, use_playwright: str = "never", include_raw_html: bool = False):
    """
    Performs a real scrape of the provided URL 
    using the real database and real internet connection.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", timeout=30.0) as ac:
        payload = {
            "url": url,
            "include_links": True,
            "use_playwright": use_playwright,
            "include_raw_html": include_raw_html
        }
        headers = {"X-API-Key": TEST_KEY}
        
        print(f"\n--- Starting real scrape request ---")
        print(f"URL: {url}")
        print(f"Playwright: {use_playwright}")
        
        try:
            response = await ac.post("/api/v1/scrape", json=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                print(f"Status: SUCCESS (200)")
                print(f"Title: {data.get('title')}")
                print(f"Canonical URL: {data.get('canonical_url')}")
                print(f"Markdown length: {len(data.get('markdown', ''))} characters")
                
                # Show a snippet of the markdown
                content = data.get('markdown', '')
                if content:
                    snippet = content[:500] + "..." if len(content) > 500 else content
                    print("\n--- Content Snippet ---")
                    print(snippet)
                    print("----------------------")
                
                if data.get("links"):
                    links = data["links"]
                    print(f"Links found: {len(links.get('internal', []))} internal, {len(links.get('external', []))} external")
                
                return True
            else:
                print(f"Status: FAILED ({response.status_code})")
                print(f"Error Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"An error occurred during the request: {e}")
            return False

async def main():
    parser = argparse.ArgumentParser(description="WebExtract Integration Test Tool")
    parser.add_argument("url", nargs="?", help="The URL to scrape")
    parser.add_argument("--playwright", choices=["auto", "always", "never"], default="never", help="Playwright rendering mode")
    parser.add_argument("--raw", action="store_true", help="Include raw HTML in output")
    
    args = parser.parse_args()
    
    target_url = args.url
    if not target_url:
        target_url = input("Enter the URL you want to scrape: ").strip()
    
    if not target_url:
        print("Error: No URL provided.")
        sys.exit(1)
        
    if not (target_url.startswith("http://") or target_url.startswith("https://")):
        print("Error: URL must start with http:// or https://")
        sys.exit(1)

    success = await run_scrape(
        url=target_url, 
        use_playwright=args.playwright, 
        include_raw_html=args.raw
    )
    
    if not success:
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nTest cancelled by user.")
        sys.exit(0)
