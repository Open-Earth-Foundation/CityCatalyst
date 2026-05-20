"""
This is the main file for the HIAP-MEED API.
It is responsible for setting up the FastAPI app and basic middleware.

Run from project root with:
python -m app.main
"""

from dotenv import load_dotenv

load_dotenv()

import logging
import os

import uvicorn
from fastapi import FastAPI

from app.modules.prioritizer.api import router as prioritization_router
from app.utils.logging_config import setup_logger


setup_logger()
# Always log under the `app.*` namespace so `setup_logger()` captures it,
# including when this module is executed as `__main__`.
logger = logging.getLogger("app.main")


app = FastAPI(
    title="HIAP-MEED",
    description="HIAP-MEED prioritization service.",
    version="0.1.0",
)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {"message": "HIAP-MEED API", "status": "healthy", "health_url": "/health"}


@app.get("/health")
async def health() -> dict[str, str]:
    """Health endpoint used for probes."""
    logger.info("Health check endpoint called")
    return {"status": "healthy"}


app.include_router(prioritization_router)


if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    logger.info(
        "Starting server host=%s port=%s LOG_LEVEL=%s LOG_DIR=%s ARTIFACT_LOG_JSONL=%s "
        "CITY_SOURCE=%s ACTION_SOURCE=%s LEGAL_SOURCE=%s",
        host,
        port,
        os.getenv("LOG_LEVEL", "INFO"),
        os.getenv("LOG_DIR", "logs"),
        os.getenv("ARTIFACT_LOG_JSONL", "true"),
        os.getenv("HIAP_MEED_CITY_DATA_SOURCE", "api"),
        os.getenv("HIAP_MEED_ACTION_DATA_SOURCE", "mock"),
        os.getenv("HIAP_MEED_LEGAL_DATA_SOURCE", "mock"),
    )
    uvicorn.run(app, host=host, port=port)
