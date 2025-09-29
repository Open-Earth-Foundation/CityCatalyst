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
    engine = create_async_engine(
        DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://'),
        echo=True,  # Set to False in production
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


async def init_pgvector() -> None:
    """
    Initialize pgvector extension and configure vector columns.

    This function:
    1. Creates the pgvector extension if it doesn't exist
    2. Configures the vector column type for document embeddings
    """
    engine, async_session_factory = create_db_connection()

    async with async_session_factory() as session:
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
        print("pgvector extension initialized successfully!")

    await engine.dispose()


async def create_vector_tables() -> None:
    """
    Create vector-related tables if they don't exist.

    This is a convenience function to ensure all vector tables are created.
    In production, you should use proper Alembic migrations.
    """
    engine, async_session_factory = create_db_connection()

    async with async_session_factory() as session:
        # Import here to avoid circular imports
        from models.document import Document, DocumentChunk, DocumentEmbedding

        # Create all tables defined in the models
        # This will create: documents, document_chunks, document_embeddings
        async with engine.begin() as conn:
            await conn.run_sync(Document.metadata.create_all)
            await conn.run_sync(DocumentChunk.metadata.create_all)
            await conn.run_sync(DocumentEmbedding.metadata.create_all)

        await session.commit()
        print("Vector tables created successfully!")

    await engine.dispose()


async def run_migrations() -> None:
    """
    Run database migrations to set up the complete vector database schema.
    """
    engine, async_session_factory = create_db_connection()

    async with async_session_factory() as session:
        # Run the vector database migration
        # Import the migration function directly from the migration file
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'migrations'))
        from vector_database import upgrade

        async with engine.begin() as conn:
            await conn.run_sync(lambda sync_conn: upgrade(sync_conn))

        await session.commit()
        print("Database migrations completed successfully!")

    await engine.dispose()


async def main() -> None:
    """
    Main function to initialize pgvector and set up the database.
    """
    print("Initializing pgvector database setup...")

    try:
        # Step 1: Initialize pgvector extension
        await init_pgvector()

        # Step 2: Create vector tables using migrations
        await run_migrations()

        print("pgvector database setup completed successfully!")
        print("You can now use the vector database functionality.")

    except Exception as e:
        print(f"Error during database setup: {e}")
        raise


if __name__ == "__main__":
    # Run the main initialization function
    asyncio.run(main())
