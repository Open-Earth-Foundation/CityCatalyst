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


app = FastAPI(
    title="HIAP-MEED",
    description="HIAP-MEED prioritization service.",
    version="0.1.0",
)

setup_logger()
logger = logging.getLogger(__name__)


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
    uvicorn.run(app, host=host, port=port, log_config=None)
