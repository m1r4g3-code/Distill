from fastapi import FastAPI

from app.middleware.logging import RequestLoggingMiddleware
from app.routers.jobs import router as jobs_router
from app.routers.map import router as map_router
from app.routers.search import router as search_router
from app.routers.scrape import router as scrape_router
from app.routers.agent import router as agent_router


def create_app() -> FastAPI:
    app = FastAPI(title="WebExtract Engine", version="1.0.0")

    app.add_middleware(RequestLoggingMiddleware)

    app.include_router(scrape_router, prefix="/api/v1")
    app.include_router(map_router, prefix="/api/v1")
    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(search_router, prefix="/api/v1")
    app.include_router(agent_router, prefix="/api/v1")

    return app


app = create_app()
