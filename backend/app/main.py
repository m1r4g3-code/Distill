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
from app.routers.admin import router as admin_router

APP_VERSION = "1.3.1"

tags_metadata = [
    {
        "name": "scrape",
        "description": "High-speed URL content extraction with automatic JS rendering detection.",
    },
    {
        "name": "map",
        "description": "Website architecture discovery and sitemap generation.",
    },
    {
        "name": "agent",
        "description": "Intelligent multi-modal agents for structured data extraction using natural language prompts.",
    },
    {
        "name": "search",
        "description": "Global web search integration across multiple providers.",
    },
    {
        "name": "jobs",
        "description": "Status tracking and result retrieval for background asynchronous tasks.",
    },
    {
        "name": "admin",
        "description": "Administrative endpoints for API key lifecycle management.",
    },
]

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
        try:
            from asyncio import WindowsProactorEventLoopPolicy
            if not isinstance(asyncio.get_event_loop_policy(), WindowsProactorEventLoopPolicy):
                asyncio.set_event_loop_policy(WindowsProactorEventLoopPolicy())
        except Exception:
            pass

        # Defensive stdout/stderr redirection for Windows console encoding
        import io
        if hasattr(sys.stdout, 'buffer') and sys.stdout.buffer:
            try:
                sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
            except Exception:
                pass
        if hasattr(sys.stderr, 'buffer') and sys.stderr.buffer:
            try:
                sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)
            except Exception:
                pass

    app = FastAPI(
        title="Distill - Scalable Web Extraction & Intelligence Engine",
        description="A powerful API for high-scale web scraping, website mapping, and AI-driven data extraction.",
        version=APP_VERSION,
        openapi_tags=tags_metadata,
        lifespan=lifespan,
    )

    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:3001",
            "https://distill.vercel.app",
            "https://*.vercel.app",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(RequestLoggingMiddleware)

    def _make_json_safe(content):
        import json
        return json.loads(json.dumps(content, default=str))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        from fastapi.encoders import jsonable_encoder
        print(f"DEBUG: validation_exception_handler hit for {get_request_id()}")
        errors = exc.errors()
        content = {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": errors[0]["msg"] if errors else "Invalid request body",
                "request_id": get_request_id(),
                "details": errors,
            }
        }
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_make_json_safe(content),
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
    app.include_router(admin_router, prefix="/api/v1/admin")
    app.include_router(metrics_router)  # No prefix for spec compliance

    @app.get("/health")
    async def health_check():
        import structlog
        from datetime import datetime, timezone
        from sqlalchemy import text
        from app.db.session import AsyncSessionLocal
        from playwright.async_api import async_playwright
        from app.db_redis import ping_redis
        
        db_status = "ok"
        pw_status = "ok"
        redis_status = "ok"
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

        # Check Redis connection
        if not await ping_redis():
            structlog.get_logger("app").error("health.redis_error")
            redis_status = "error"
            overall_status = "degraded"

        return {
            "status": overall_status,
            "version": APP_VERSION,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "dependencies": {
                "database": db_status,
                "redis": redis_status,
                "playwright": pw_status
            }
        }

    return app


app = create_app()
