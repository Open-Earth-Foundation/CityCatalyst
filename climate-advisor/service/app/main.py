from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware import Middleware
from starlette.responses import Response
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import Any, Dict
import time

from .config.settings import get_settings
from .routes.health import router as health_router
from .routes.threads import router as threads_router
from .routes.messages import router as messages_router
from .middleware.request_context import RequestContextMiddleware, get_request_id
from loguru import logger


def create_problem_details(
    request: Request,
    status: int,
    title: str,
    detail: str = "",
    type_: str = "about:blank",
) -> Dict[str, Any]:
    instance = str(request.url)
    return {
        "type": type_,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
        "request_id": get_request_id(),
    }


def get_app() -> FastAPI:
    settings = get_settings()

    middleware = [
        Middleware(RequestContextMiddleware),
        Middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-Id"],
        ),
    ]

    app = FastAPI(
        title="Climate Advisor Service",
        version="0.1.0",
        middleware=middleware,
    )

    # Lifespan: mark ready after startup
    @app.on_event("startup")
    async def _startup() -> None:
        app.state.ready = True
        logger.info("service_started", service="climate-advisor", ready=app.state.ready)

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        logger.info("service_stopping", service="climate-advisor")

    # Routers
    app.include_router(health_router)
    app.include_router(threads_router, prefix="/v1")
    app.include_router(messages_router, prefix="/v1")

    # Exception handlers -> Problem Details
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        problem = create_problem_details(
            request,
            status=422,
            title="Unprocessable Entity",
            detail=str(exc),
            type_="https://datatracker.ietf.org/doc/html/rfc4918#section-11.2",
        )
        return JSONResponse(status_code=422, content=problem, media_type="application/problem+json")

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # Covers 404/400/etc raised via HTTPException
        problem = create_problem_details(
            request,
            status=exc.status_code,
            title=exc.detail if isinstance(exc.detail, str) else "HTTP Error",
            detail=exc.detail if isinstance(exc.detail, str) else "",
        )
        return JSONResponse(status_code=exc.status_code, content=problem, media_type="application/problem+json")

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        problem = create_problem_details(
            request,
            status=400,
            title="Bad Request",
            detail=str(exc),
        )
        return JSONResponse(status_code=400, content=problem, media_type="application/problem+json")

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.exception("unhandled_exception")
        problem = create_problem_details(
            request,
            status=500,
            title="Internal Server Error",
            detail="An unexpected error occurred.",
        )
        return JSONResponse(status_code=500, content=problem, media_type="application/problem+json")

    return app


app = get_app()
