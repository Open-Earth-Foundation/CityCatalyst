"""
This is the main file for the HIAP Brazil v3 API (SCAFFOLD).
It sets up the FastAPI app and mounts the routers.

The methodology is not defined yet: rankings are mock data.

Run from project root with:
python -m app.main
"""

from dotenv import load_dotenv

load_dotenv()

import logging
import os

import uvicorn
from fastapi import FastAPI

from app.api.prioritize import SCAFFOLD_WARNING
from app.api.prioritize import router as prioritize_router
from app.utils.logging_config import setup_logger

setup_logger()
# Always log under the `app.*` namespace so `setup_logger()` captures it,
# including when this module is executed as `__main__`.
logger = logging.getLogger("app.main")
logger.warning(SCAFFOLD_WARNING)

app = FastAPI(
    title="HIAP-BRAZILV3",
    description=(
        "SCAFFOLD of the Brazil v3 climate-action prioritization service. The "
        "methodology is not defined yet and all rankings are mock data "
        "(`meta.mock` is true, `meta.methodologyStatus` is `scaffold`). Workflow "
        "requests contain `meta.requestId` and a `requestData` payload."
    ),
    version="0.1.0",
    openapi_tags=[
        {
            "name": "prioritization",
            "description": "Rank items for a region + methodology + version (mock data).",
        },
    ],
)


@app.get(
    "/",
    summary="Get service entry-point details",
    description="Returns a small discovery payload and the unauthenticated health URL.",
    responses={200: {"description": "Service discovery payload returned."}},
)
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "message": "HIAP-BRAZILV3 API",
        "status": "healthy",
        "methodologyStatus": "scaffold",
        "health_url": "/health",
    }


@app.get(
    "/health",
    summary="Check service health",
    description="Unauthenticated liveness endpoint for load balancers and deployment probes.",
    responses={200: {"description": "Process is running and able to serve requests."}},
)
async def health() -> dict[str, str]:
    """Health endpoint used for probes."""
    logger.info("Health check endpoint called")
    return {"status": "healthy"}


app.include_router(prioritize_router)


if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    logger.info(
        "Starting server host=%s port=%s LOG_LEVEL=%s LOG_DIR=%s",
        host,
        port,
        os.getenv("LOG_LEVEL", "INFO"),
        os.getenv("LOG_DIR", "logs"),
    )
    uvicorn.run(app, host=host, port=port)
