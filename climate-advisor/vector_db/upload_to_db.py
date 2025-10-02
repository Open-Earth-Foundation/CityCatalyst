#!/usr/bin/env python3
"""
PDF Upload and Embedding Script for Climate Advisor Vector Database

This script processes PDF files, extracts text, splits into chunks,
generates embeddings using OpenAI, and stores everything in a PostgreSQL
database with pgvector support.

USAGE:
    python upload_to_db.py [OPTIONS]

OPTIONS:
    --directory PATH    Directory containing PDF files (default: files)
    --help             Show this help message and exit

EXAMPLES:
    # Process all PDFs in the default 'files' directory
    python upload_to_db.py

    # Process PDFs from a specific directory
    python upload_to_db.py --directory /path/to/pdfs

    # Show help
    python upload_to_db.py --help

PREREQUISITES:
    1. PostgreSQL database with pgvector extension installed
    2. Environment variables configured in ../.env:
       - CA_DATABASE_URL: PostgreSQL connection string
       - OPENAI_API_KEY: OpenAI API key for embeddings

    3. Required Python packages installed (run in climate-advisor/service/):
       pip install -r requirements.txt

CONFIGURATION:
    - Chunk size: 1000 characters (fixed)
    - Chunk overlap: 200 characters (fixed)
    - Directory: files (default, can be overridden with --directory)

OUTPUT:
    The script will:
    1. Initialize pgvector extension in the database
    2. Process each PDF file in the specified directory
    3. Extract text content and split into chunks
    4. Generate embeddings using OpenAI's text-embedding-3-small model
    5. Store documents, chunks, and embeddings in the database
    6. Display progress and summary statistics

    Example output:
    Processing PDF files in files/...
    Processing document.pdf...
    Generating embeddings for 15 chunks...
    Successfully stored document.pdf
    ...
    === Summary ===
    Processed 3 documents
    Successfully stored 3 documents
    Failed to store 0 documents
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path
from typing import List, Dict, Any
from uuid import uuid4
from dotenv import load_dotenv

# Load environment variables from .env file in parent directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Configuration constants
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200
DEFAULT_DIRECTORY = "files"

# Import from local modules
from models.document import DocumentEmbedding
from utils.text_processing import DocumentProcessor
from services.embedding_service import EmbeddingService, EmbeddingResult

from vector_init import init_pgvector

# Add the service directory to Python path for database session
sys.path.insert(0, str(Path(__file__).parent.parent / "service"))
from app.db.session import get_session  # type: ignore


async def create_database_tables(engine) -> None:
    """Create database tables if they don't exist."""
    async with engine.begin() as conn:
        # Import models to ensure they are registered with SQLAlchemy
        # Create all tables for the vector models
        await conn.run_sync(DocumentEmbedding.metadata.create_all)


async def store_document_with_embeddings(
    session: AsyncSession,
    doc_data: Dict[str, Any],
    embedding_results: List[EmbeddingResult]
) -> bool:
    """
    Store document chunks with their embeddings in the database.

    Args:
        session: Database session
        doc_data: Processed document data
        embedding_results: Results from embedding generation

    Returns:
        True if successful, False otherwise
    """
    try:
        # Store each chunk with its embedding
        for i, chunk_data in enumerate(doc_data["chunks"]):
            # Find corresponding embedding result
            embedding_result = None
            for result in embedding_results:
                if result.text == chunk_data["content"] and result.success:
                    embedding_result = result
                    break

            if embedding_result is None:
                print(f"Warning: No embedding found for chunk {i} in {doc_data['filename']}")
                continue

            # Create embedding record with document metadata and chunk content
            embedding = DocumentEmbedding(
                embedding_id=str(uuid4()),
                model_name=embedding_result.model,
                embedding_vector=embedding_result.embedding,
                # Document metadata
                filename=doc_data["filename"],
                file_path=doc_data.get("file_path"),
                file_type=doc_data.get("file_type", "pdf"),
                # Chunk data
                chunk_content=chunk_data["content"],
                chunk_index=chunk_data["chunk_index"],
                chunk_size=chunk_data["metadata"]["chunk_size"],
            )

            session.add(embedding)

        await session.commit()
        return True

    except Exception as e:
        await session.rollback()
        print(f"Error storing document {doc_data['filename']}: {str(e)}")
        return False


async def process_and_store_documents(
    directory_path: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP
) -> None:
    """
    Process all PDFs in a directory and store them with embeddings.

    Args:
        directory_path: Path to directory containing PDF files
        chunk_size: Size of text chunks
        chunk_overlap: Overlap between chunks
    """
    # Initialize services
    doc_processor = DocumentProcessor(chunk_size, chunk_overlap)
    embedding_service = EmbeddingService()

    # Process documents
    print(f"Processing PDF files in {directory_path}...")
    processed_docs = doc_processor.process_directory(directory_path)

    if not processed_docs:
        print("No documents processed.")
        return

    # Get database session
    async for session in get_session():
        # Initialize pgvector
        print("Initializing pgvector...")
        await init_pgvector(session)

        total_docs = len(processed_docs)
        success_count = 0

        for i, doc_data in enumerate(processed_docs, 1):
            print(f"\nProcessing document {i}/{total_docs}: {doc_data['filename']}")

            # Extract text chunks for embedding
            text_chunks = [chunk["content"] for chunk in doc_data["chunks"]]

            if not text_chunks:
                print(f"Warning: No text chunks found for {doc_data['filename']}")
                continue

            print(f"Generating embeddings for {len(text_chunks)} chunks...")

            # Generate embeddings
            embedding_results = await embedding_service.generate_embeddings_batch(text_chunks)

            # Check for failures
            failed_embeddings = [r for r in embedding_results if not r.success]
            if failed_embeddings:
                print(f"Warning: {len(failed_embeddings)} embeddings failed for {doc_data['filename']}")
                for failure in failed_embeddings[:3]:  # Show first 3 failures
                    print(f"  - {failure.error}")

            # Store in database
            success = await store_document_with_embeddings(session, doc_data, embedding_results)

            if success:
                success_count += 1
                print(f"Successfully stored {doc_data['filename']}")
            else:
                print(f"Failed to store {doc_data['filename']}")

        print("=== Summary ===")
        print(f"Processed {total_docs} documents")
        print(f"Successfully stored {success_count} documents")
        print(f"Failed to store {total_docs - success_count} documents")


async def main():
    """Main function to run the upload script."""
    parser = argparse.ArgumentParser(description="Upload PDFs to vector database with embeddings")
    parser.add_argument(
        "--directory",
        type=str,
        default=DEFAULT_DIRECTORY,
        help="Directory containing PDF files (default: files)"
    )

    args = parser.parse_args()

    # Check environment variables
    if not os.getenv("CA_DATABASE_URL"):
        print("Error: CA_DATABASE_URL environment variable is required")
        sys.exit(1)

    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable is required")
        sys.exit(1)

    # Process and store documents
    await process_and_store_documents(
        args.directory,
        DEFAULT_CHUNK_SIZE,
        DEFAULT_CHUNK_OVERLAP
    )


if __name__ == "__main__":
    asyncio.run(main())
