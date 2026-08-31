import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db.session import get_session_factory


logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Return the liveness payload without depending on external services."""
    return {"status": "ok"}


@router.get("/ready")
async def readiness() -> dict[str, str]:
    """Return readiness only when the workflow database accepts a query."""
    try:
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
