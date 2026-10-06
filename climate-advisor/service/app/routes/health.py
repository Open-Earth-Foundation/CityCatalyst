import asyncio
import logging

from app.db.session import get_session_factory
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

logger = logging.getLogger(__name__)
READINESS_TIMEOUT_SECONDS = 1.0

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Return the liveness payload without depending on external services."""
    return {"status": "ok"}


@router.get("/ready")
async def readiness() -> dict[str, str]:
    """Bound connection acquisition and the query so an outage returns 503 promptly."""
    try:
        async with asyncio.timeout(READINESS_TIMEOUT_SECONDS):
            session_factory = get_session_factory()
            async with session_factory() as session:
                await session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Climate Advisor database readiness check failed")
        raise HTTPException(
            status_code=503,
            detail="Workflow database is unavailable",
        ) from exc

    return {"status": "ready"}
