import sys
import asyncio
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.middleware.logging import RequestLoggingMiddleware, get_request_id
from app.routers.jobs import router as jobs_router
from app.routers.map import router as map_router
from app.routers.search import router as search_router
from app.routers.scrape import router as scrape_router
from app.routers.agent import router as agent_router
from app.routers.metrics import router as metrics_router

APP_VERSION = "1.2.0"

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.tasks.cleanup import run_cleanup_loop
    task = asyncio.create_task(run_cleanup_loop())
    yield
    task.cancel()

def create_app() -> FastAPI:
    from app.config import settings
    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(dsn=settings.sentry_dsn)
        
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    app = FastAPI(title="WebExtract Engine", version=APP_VERSION, lifespan=lifespan)

    app.add_middleware(RequestLoggingMiddleware)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": exc.errors()[0]["msg"] if exc.errors() else "Invalid request body",
                    "request_id": get_request_id(),
                    "details": [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()],
                }
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        import structlog
        structlog.get_logger("app").exception("unhandled_error")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred",
                    "request_id": get_request_id(),
                    "type": type(exc).__name__,
                }
            },
        )

    app.include_router(scrape_router, prefix="/api/v1")
    app.include_router(map_router, prefix="/api/v1")
    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(search_router, prefix="/api/v1")
    app.include_router(agent_router, prefix="/api/v1")
    app.include_router(metrics_router)  # No prefix for spec compliance

    @app.get("/health")
    async def health_check():
        from datetime import datetime, timezone
        from sqlalchemy import text
        from app.db.session import AsyncSessionLocal
        from playwright.async_api import async_playwright
        
        db_status = "ok"
        pw_status = "ok"
        overall_status = "ok"

        # Check DB connection
        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
        except Exception as e:
            structlog.get_logger("app").error("health.db_engine_error", error=str(e))
            db_status = "error"
            overall_status = "degraded"

        # Check Playwright / Chromium availability
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-gpu", "--single-process"]
                )
                await browser.close()
        except Exception as e:
            structlog.get_logger("app").error("health.playwright_error", error=str(e))
            pw_status = "error"
            overall_status = "degraded"

        return {
            "status": overall_status,
            "version": APP_VERSION,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "dependencies": {
                "database": db_status,
                "playwright": pw_status
            }
        }

    return app


app = create_app()
