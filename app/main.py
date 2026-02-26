from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.middleware.logging import RequestLoggingMiddleware, get_request_id
from app.routers.jobs import router as jobs_router
from app.routers.map import router as map_router
from app.routers.search import router as search_router
from app.routers.scrape import router as scrape_router
from app.routers.agent import router as agent_router


def create_app() -> FastAPI:
    app = FastAPI(title="WebExtract Engine", version="1.0.0")

    app.add_middleware(RequestLoggingMiddleware)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": str(exc.errors()[0]["msg"]) if exc.errors() else "Invalid request",
                    "request_id": get_request_id(),
                    "details": exc.errors(),
                }
            },
        )

    app.include_router(scrape_router, prefix="/api/v1")
    app.include_router(map_router, prefix="/api/v1")
    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(search_router, prefix="/api/v1")
    app.include_router(agent_router, prefix="/api/v1")

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "message": "Scraper is running"}

    return app


app = create_app()
