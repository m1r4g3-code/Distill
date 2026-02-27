import asyncio
import structlog
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright, Browser, BrowserContext

logger = structlog.get_logger("app.worker.playwright_pool")

class PlaywrightBrowserPool:
    """
    Maintains a single Playwright Chromium instance shared across tasks
    and manages isolated BrowserContext instances (capped to max 3 concurrent uses)
    to prevent memory ballooning in the worker.
    """

    def __init__(self, max_contexts: int = 3):
        self.max_contexts = max_contexts
        self._pw = None
        self._browser: Browser | None = None
        self._semaphore = asyncio.Semaphore(max_contexts)

    async def start(self) -> None:
        if self._browser is not None:
            return

        logger.info("playwright_pool.starting", max_contexts=self.max_contexts)
        try:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ],
            )
            logger.info("playwright_pool.started")
        except Exception as e:
            logger.exception("playwright_pool.start_failed", error=str(e))
            raise

    async def stop(self) -> None:
        logger.info("playwright_pool.stopping")
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._pw:
            await self._pw.stop()
            self._pw = None
        logger.info("playwright_pool.stopped")

    @asynccontextmanager
    async def get_context(self) -> AsyncGenerator[BrowserContext, None]:
        """Provides an isolated Playwright context, blocking if the pool is full."""
        if not self._browser:
            raise RuntimeError("Browser pool has not been started")

        await self._semaphore.acquire()
        context = await self._browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        try:
            yield context
        finally:
            await context.close()
            self._semaphore.release()
