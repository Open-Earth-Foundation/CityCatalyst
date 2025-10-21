"""
Database initialization for pgvector support.

This module provides functions to initialize pgvector extension and configure
vector columns for document embeddings.
"""

import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
import sys
# Load environment variables from .env file in parent directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)


def create_db_connection():
    """
    Create database connection using environment variables.

    Required environment variables:
    - CA_DATABASE_URL: PostgreSQL connection string
    """
    # Get database URL from environment variables
    database_url = os.getenv("CA_DATABASE_URL")
    if not database_url:
        raise ValueError("CA_DATABASE_URL environment variable is required")

    DATABASE_URL = database_url

    # Create async engine with asyncpg driver
    # Use environment variable to control SQL echo logging
    echo_sql = os.getenv("CA_DATABASE_ECHO", "false").lower() in ("true", "1", "yes")
    engine = create_async_engine(
        DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://'),
        echo=echo_sql,
        future=True,
    )

    # Create async session factory
    async_session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    return engine, async_session_factory


async def get_db_session():
    """Get database session for ca-postgres container."""
    engine, async_session_factory = create_db_connection()

    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await engine.dispose()


async def init_pgvector(session=None) -> None:
    """
    Initialize pgvector extension.

    This function creates the pgvector extension if it doesn't exist.
    Vector columns are defined in the SQLAlchemy models using pgvector.sqlalchemy.Vector.

    Args:
        session: Optional async session to use. If None, creates a new session.
    """
    if session is not None:
        # Use provided session
        # Create pgvector extension if it doesn't exist
        await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        await session.commit()
        print("pgvector extension initialized successfully!")
    else:
        # Create own session
        engine, async_session_factory = create_db_connection()

        async with async_session_factory() as session:
            # Create pgvector extension if it doesn't exist
            await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

            await session.commit()
            print("pgvector extension initialized successfully!")

        await engine.dispose()


async def create_vector_tables() -> None:
    """
    Create vector-related tables if they don't exist.

    This function is kept for development convenience.
    For production deployments, use proper Alembic migrations instead.
    """
    print("Warning: Using create_all() for table creation.")
    print("For production, consider using: alembic upgrade head")
    print("Note: Only document_embeddings table will be created")

    engine, async_session_factory = create_db_connection()

    async with async_session_factory() as session:
        # Import here to avoid circular imports
        # Add service path for imports
        # Use relative import to avoid sys.path manipulation
        from ..service.app.models.db.document_embedding import DocumentEmbedding

        # Create all tables defined in the models
        # This will create: document_embeddings table
        async with engine.begin() as conn:
            await conn.run_sync(DocumentEmbedding.metadata.create_all)

        await session.commit()
        print("Vector tables created successfully!")

    await engine.dispose()




async def main() -> None:
    """
    Main function to initialize pgvector and set up the database.
    """
    print("Initializing pgvector database setup...")

    try:
        # Step 1: Initialize pgvector extension
        await init_pgvector()

        # Step 2: Create vector tables (development approach)
        await create_vector_tables()

        print("pgvector database setup completed successfully!")
        print("You can now use the vector database functionality.")
        print("Note: For production, consider using proper Alembic migrations.")

    except Exception as e:
        print(f"Error during database setup: {e}")
        raise


if __name__ == "__main__":
    # Run the main initialization function
    asyncio.run(main())
