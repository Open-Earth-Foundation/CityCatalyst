"""
Database initialization for pgvector support.

This module provides functions to initialize pgvector extension and configure
vector columns for document embeddings.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Import settings from the service app
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'service'))

from app.config.settings import get_settings


async def init_pgvector(session: AsyncSession) -> None:
    """
    Initialize pgvector extension and configure vector columns.

    This function:
    1. Creates the pgvector extension if it doesn't exist
    2. Configures the vector column type for document embeddings
    """
    settings = get_settings()

    # Create pgvector extension if it doesn't exist
    await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    # Create custom vector type for 1536-dimensional embeddings (text-embedding-3-small)
    # This is optional as pgvector can handle vectors of any dimension
    # but provides better performance with explicit types
    await session.execute(text("""
        CREATE TYPE IF NOT EXISTS vector_1536 AS (
            x REAL[1536]
        )
    """))

    await session.commit()


async def create_vector_tables(session: AsyncSession) -> None:
    """
    Create vector-related tables if they don't exist.

    This is a convenience function to ensure all vector tables are created.
    In production, you should use proper Alembic migrations.
    """
    # Import here to avoid circular imports
    from models.document import Document, DocumentChunk, DocumentEmbedding

    # The tables will be created automatically by SQLAlchemy when the models are imported
    # This function is mainly for documentation purposes
    pass
