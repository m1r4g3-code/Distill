import asyncio
from app.services.playwright_fetcher import fetch_playwright

async def main():
    try:
        res = await fetch_playwright("https://nowsecure.nl/", timeout_ms=30000)
        print("Status Code:", res.status_code)
        with open("test.html", "w", encoding="utf-8") as f:
            f.write(res.text)
        print("Wrote test.html")
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
