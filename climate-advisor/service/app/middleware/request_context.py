from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import logging
import time
import uuid
import contextvars

# Set up logger
logger = logging.getLogger(__name__)


_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")


def get_request_id() -> str:
    rid = _request_id_ctx.get()
    return rid


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Capture or create request id
        req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        _request_id_ctx.set(req_id)

        start = time.perf_counter()
        logger.info(
            "Request started",
            extra={
                "request_id": req_id,
                "method": request.method,
                "path": request.url.path,
            },
        )
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "Request error occurred",
                extra={
                    "request_id": req_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration_ms, 2),
                },
                exc_info=exc,
            )
            raise

        duration_ms = (time.perf_counter() - start) * 1000
        # Add request id to response headers
        response.headers.setdefault("X-Request-Id", req_id)

        logger.info(
            "Request completed",
            extra={
                "request_id": req_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        return response
