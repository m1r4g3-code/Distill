import json
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    rid = request_id_ctx.get()
    return rid or ""


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or f"req_{uuid.uuid4().hex[:12]}"
        request_id_ctx.set(request_id)

        start = time.perf_counter()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            payload = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": "info",
                "event": "request.complete",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
            }
            print(json.dumps(payload, ensure_ascii=False))
