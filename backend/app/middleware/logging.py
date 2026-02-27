import time
import uuid
import structlog
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")
log = structlog.get_logger("middleware")

def get_request_id() -> str:
    rid = request_id_ctx.get()
    return rid or ""

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or f"req_{uuid.uuid4().hex[:12]}"
        request_id_ctx.set(request_id)
        
        # Bind request_id to structlog thread-local context
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start = time.perf_counter()
        status_code = 500
        
        log.info("request.start", method=request.method, endpoint=request.url.path)

        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            log.info(
                "request.complete",
                method=request.method,
                endpoint=request.url.path,
                http_status=status_code,
                duration_ms=duration_ms,
            )
            # Unbind explicitly
            structlog.contextvars.unbind_contextvars("request_id")
