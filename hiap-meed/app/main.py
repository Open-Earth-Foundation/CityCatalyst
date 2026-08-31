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
from app.modules.reference_data.api import router as reference_data_router
from app.utils.logging_config import setup_logger
from app.utils.mlflow_logging import initialize_mlflow


setup_logger()
# Always log under the `app.*` namespace so `setup_logger()` captures it,
# including when this module is executed as `__main__`.
logger = logging.getLogger("app.main")
initialize_mlflow()


app = FastAPI(
    title="HIAP-MEED",
    description=(
        "Climate-action prioritization and City Action Report generation service. "
        "Workflow requests contain `meta.requestId` for caller correlation and "
        "a `requestData` payload for operation-specific input. Successful business "
        "responses contain server-owned `meta` with the resolved request ID, response "
        "timestamp, and returned record count."
    ),
    version="0.1.0",
    openapi_tags=[
        {
            "name": "prioritization",
            "description": (
                "Rank city climate actions, preview exclusions, generate City Action "
                "Reports, and translate completed explanations."
            ),
        },
        {
            "name": "reference data",
            "description": (
                "Read normalized city, action, policy, feasibility, and finance "
                "reference data through the same operations used by HIAP-MEED workflows."
            ),
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
    return {"message": "HIAP-MEED API", "status": "healthy", "health_url": "/health"}


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


app.include_router(prioritization_router)
app.include_router(reference_data_router)


if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    logger.info(
        "Starting server host=%s port=%s LOG_LEVEL=%s LOG_DIR=%s LOCAL_ARTIFACTS_ENABLED=%s "
        "CITY_SOURCE=%s ACTION_SOURCE=%s LEGAL_SOURCE=%s POLICY_SOURCE=%s "
        "MITIGATION_FEASIBILITY_SOURCE=%s FINANCIAL_FEASIBILITY_SOURCE=%s",
        host,
        port,
        os.getenv("LOG_LEVEL", "INFO"),
        os.getenv("LOG_DIR", "logs"),
        os.getenv("LOCAL_ARTIFACTS_ENABLED", "true"),
        os.getenv("HIAP_MEED_CITY_DATA_SOURCE", "api"),
        os.getenv("HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE", "api"),
        os.getenv("HIAP_MEED_LEGAL_DATA_SOURCE", "s3"),
        os.getenv("HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE", "api"),
        os.getenv(
            "HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE",
            "api",
        ),
        os.getenv(
            "HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE",
            "api",
        ),
    )
    uvicorn.run(app, host=host, port=port)

