"""Initialize pgvector and vector-table support through the shared database layer."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_engine, get_session_factory
from app.models.db.document_embedding import DocumentEmbedding


logger = logging.getLogger(__name__)


async def init_pgvector(session: AsyncSession | None = None) -> None:
    """Create the pgvector extension using a supplied or managed session."""
    if session is not None:
        await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await session.commit()
        logger.info("pgvector extension initialized")
        return

    # Use the application's configured session factory when no session is supplied.
    session_factory = get_session_factory()
    async with session_factory() as managed_session:
        await managed_session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await managed_session.commit()
    logger.info("pgvector extension initialized")


async def create_vector_tables() -> None:
    """Create vector tables for local development through shared SQLAlchemy metadata."""
    logger.warning("Creating vector tables directly; use Alembic in production")
    engine = get_engine()
    async with engine.begin() as connection:
        await connection.run_sync(DocumentEmbedding.metadata.create_all)
    logger.info("Vector tables created")
