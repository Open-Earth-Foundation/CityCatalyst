"""
This is the main file for the HIAP API.
It is responsible for setting up the FastAPI app and adding middleware.
It also mounts the routers for the different features of the API.

Run it from the /app directory with:
python main.py
"""

from dotenv import load_dotenv

load_dotenv()

import os
import uvicorn
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from prioritizer.api import router as prioritizer_router
from plan_creator_legacy.api import router as plan_creator_legacy_router
from plan_creator.api import router as plan_creator_router
from utils.logging_config import setup_logger


app = FastAPI(
    title="High Impact Actions Prioritizer",
    description="API for prioritizing high impact actions",
    version="1.0.0",
)

# Add CORS middleware configuration with more explicit settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cap.openearth.dev",
        "https://cap-plan-creator.openearth.dev",
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH", "PUT"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "Access-Control-Allow-Headers",
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods",
        "Access-Control-Allow-Credentials",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)


setup_logger()
logger = logging.getLogger(__name__)


@app.get("/")
async def root():
    logger.info("Health check endpoint called")
    return {"message": "Hello World"}


# Mount feature routers
app.include_router(prioritizer_router, prefix="/prioritizer", tags=["Prioritizer"])
app.include_router(plan_creator_router, prefix="/plan-creator", tags=["Plan Creator"])
app.include_router(
    plan_creator_legacy_router,
    prefix="/plan-creator-legacy",
    tags=["Plan Creator Legacy"],
)


if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", 8000))

    logger.info("Starting Uvicorn server")
    uvicorn.run(app, host=host, port=port, log_config=None)
