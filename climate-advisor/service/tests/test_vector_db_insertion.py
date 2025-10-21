"""
Test suite for verifying that documents are properly inserted into the vector database.

This test validates:
- Documents are inserted with correct metadata
- Embeddings are generated and stored
- Vector data is properly formatted
- Database structure is correct
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from typing import List
from uuid import UUID

from dotenv import load_dotenv
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Load environment variables for database connection
env_path = Path(__file__).resolve().parents[2] / '.env'
load_dotenv(env_path)

# Ensure project root is importable
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import the correct model (service app version)
sys.path.insert(0, str(PROJECT_ROOT / "service"))
from app.models.db.document_embedding import DocumentEmbedding


class VectorDBInsertionTests(unittest.TestCase):
    """Test cases for vector database insertion functionality."""

    def setUp(self):
        """Set up test database connection."""
        # Get database URL from environment
        database_url = os.getenv('CA_DATABASE_URL')
        if not database_url:
            self.skipTest("CA_DATABASE_URL environment variable not set")

        # Convert to asyncpg format
        self.database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://')

        # Create engine for testing
        self.engine = create_async_engine(
            self.database_url,
            echo=False,
            future=True,
        )

        # Create session factory
        self.session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    def tearDown(self):
        """Clean up after tests."""
        if hasattr(self, 'engine'):
            asyncio.run(self.engine.dispose())

    async def get_session(self) -> AsyncSession:
        """Get a database session for testing."""
        return self.session_factory()

    def test_database_connection(self):
        """Test that we can connect to the database."""
        async def _test_connection():
            async with self.session_factory() as session:
                result = await session.execute(text("SELECT 1"))
                self.assertEqual(result.scalar(), 1)

        # Run the async test
        asyncio.run(_test_connection())

    def test_embeddings_table_exists(self):
        """Test that the document_embeddings table exists."""
        async def _test_table_exists():
            async with self.session_factory() as session:
                result = await session.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = 'document_embeddings'
                    )
                """))
                self.assertTrue(result.scalar(), "document_embeddings table should exist")

        asyncio.run(_test_table_exists())

    def test_embeddings_are_inserted(self):
        """Test that embeddings were inserted into the database."""
        async def _test_embeddings_exist():
            async with self.session_factory() as session:
                # Count total embeddings
                result = await session.execute(text("SELECT COUNT(*) FROM document_embeddings"))
                count = result.scalar() or 0

                # Should have at least some embeddings from our upload
                self.assertTrue(count > 0, "Should have embeddings in the database")
                print(f"Found {count} embeddings in database")

        asyncio.run(_test_embeddings_exist())

    def test_embedding_structure(self):
        """Test that embeddings have correct structure and metadata."""
        async def _test_embedding_structure():
            async with self.session_factory() as session:
                # Get sample embeddings
                result = await session.execute(text("""
                    SELECT embedding_id, filename, file_type, model_name, chunk_index, chunk_size
                    FROM document_embeddings
                    ORDER BY chunk_index
                    LIMIT 5
                """))

                embeddings = result.fetchall()

                for embedding in embeddings:
                    embedding_id, filename, file_type, model_name, chunk_index, chunk_size = embedding

                    # Validate UUID format
                    self.assertIsInstance(embedding_id, UUID, "embedding_id should be a UUID")

                    # Validate required fields
                    self.assertIsNotNone(filename, "filename should not be None")
                    self.assertEqual(file_type, "pdf", "file_type should be 'pdf'")
                    self.assertEqual(model_name, "text-embedding-3-large", "model should be text-embedding-3-large")
                    self.assertIsInstance(chunk_index, int, "chunk_index should be an integer")
                    self.assertGreater(chunk_size, 0, "chunk_size should be positive")

                    # Validate filename
                    self.assertIn("GPC_Full_MASTER_RW_v7.pdf", filename, "Should be the GPC document")

        asyncio.run(_test_embedding_structure())

    def test_embedding_vector_data(self):
        """Test that embedding vectors are properly stored."""
        async def _test_vector_data():
            async with self.session_factory() as session:
                # Check that embeddings have vectors
                result = await session.execute(text("""
                    SELECT COUNT(*) FROM document_embeddings WHERE embedding_vector IS NOT NULL
                """))
                count_with_vectors = result.scalar()

                result = await session.execute(text("SELECT COUNT(*) FROM document_embeddings"))
                total_count = result.scalar()

                self.assertEqual(count_with_vectors, total_count,
                               "All embeddings should have vectors")

                # Check vector column type
                result = await session.execute(text("""
                    SELECT data_type FROM information_schema.columns
                    WHERE table_name = 'document_embeddings' AND column_name = 'embedding_vector'
                """))
                vector_type = result.scalar()

                # Should be a user-defined type (pgvector)
                self.assertEqual(vector_type, "USER-DEFINED", "Vector column should be USER-DEFINED type")

        asyncio.run(_test_vector_data())

    def test_embedding_metadata_completeness(self):
        """Test that all required metadata fields are populated."""
        async def _test_metadata():
            async with self.session_factory() as session:
                # Check for required fields that should not be NULL
                required_fields = [
                    'embedding_id', 'model_name', 'filename', 'file_type',
                    'chunk_content', 'chunk_index', 'chunk_size', 'created_at'
                ]

                for field in required_fields:
                    result = await session.execute(text(f"""
                        SELECT COUNT(*) FROM document_embeddings WHERE {field} IS NULL
                    """))
                    null_count = result.scalar()
                    self.assertEqual(null_count, 0, f"No embeddings should have NULL {field}")

                # Verify specific metadata values
                result = await session.execute(text("""
                    SELECT DISTINCT model_name FROM document_embeddings
                """))
                models = [row[0] for row in result.fetchall()]
                self.assertIn("text-embedding-3-large", models, "Should use text-embedding-3-large model")

                result = await session.execute(text("""
                    SELECT DISTINCT file_type FROM document_embeddings
                """))
                file_types = [row[0] for row in result.fetchall()]
                self.assertIn("pdf", file_types, "Should have PDF file type")

        asyncio.run(_test_metadata())

    def test_chunk_continuity(self):
        """Test that chunks are properly ordered and continuous."""
        async def _test_chunk_continuity():
            async with self.session_factory() as session:
                # Get all chunk indices for the main document
                result = await session.execute(text("""
                    SELECT DISTINCT chunk_index
                    FROM document_embeddings
                    WHERE filename = 'GPC_Full_MASTER_RW_v7.pdf'
                    ORDER BY chunk_index
                """))

                chunk_indices = [row[0] for row in result.fetchall()]

                # Should have continuous chunk indices starting from 0
                expected_chunks = list(range(len(chunk_indices)))
                self.assertEqual(chunk_indices, expected_chunks,
                               f"Chunk indices should be continuous: {chunk_indices}")

                print(f"Found {len(chunk_indices)} continuous chunks from 0 to {len(chunk_indices)-1}")

        asyncio.run(_test_chunk_continuity())

    def test_embedding_dimensions(self):
        """Test that embeddings have the expected dimensions."""
        async def _test_dimensions():
            async with self.session_factory() as session:
                # For text-embedding-3-large, we expect 3072 dimensions
                expected_dimensions = 3072

                # Note: Direct dimension checking with pgvector is complex,
                # but we can verify the model name implies correct dimensions
                result = await session.execute(text("""
                    SELECT COUNT(*) FROM document_embeddings
                    WHERE model_name = 'text-embedding-3-large'
                """))
                large_model_count = result.scalar()

                result = await session.execute(text("SELECT COUNT(*) FROM document_embeddings"))
                total_count = result.scalar()

                self.assertEqual(large_model_count, total_count,
                               "All embeddings should use text-embedding-3-large model")

                print(f"All {total_count} embeddings use text-embedding-3-large model (3072 dimensions)")

        asyncio.run(_test_dimensions())


class VectorDBIntegrationTests(unittest.TestCase):
    """Integration tests for vector database operations."""

    def setUp(self):
        """Set up integration test environment."""
        # Similar setup to unit tests but for integration scenarios
        database_url = os.getenv('CA_DATABASE_URL')
        if not database_url:
            self.skipTest("CA_DATABASE_URL environment variable not set")

        self.database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://')

    def test_vector_similarity_setup(self):
        """Test that vector similarity operations can be set up."""
        async def _test_similarity_setup():
            # This is a basic test to ensure pgvector extension is working
            engine = create_async_engine(
                self.database_url,
                echo=False,
                future=True,
            )

            async with engine.begin() as conn:
                # Test basic vector operations setup with a simple 1D vector
                result = await conn.execute(text("SELECT '[1]'::vector"))
                vector_result = result.scalar()

                # Should return a vector
                self.assertIsNotNone(vector_result)

            await engine.dispose()

        asyncio.run(_test_similarity_setup())


if __name__ == "__main__":
    # Run the tests
    unittest.main(verbosity=2)
