"""Process PDF documents and persist their vector embeddings."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session_factory
from app.models.db.document_embedding import DocumentEmbedding
from vector_db.config_loader import get_embedding_config
from vector_db.services.embedding_service import EmbeddingResult, EmbeddingService
from vector_db.utils.text_processing import DocumentProcessor
from vector_db.vector_init import init_pgvector


logger = logging.getLogger(__name__)


async def store_document_with_embeddings(
    session: AsyncSession,
    document: dict[str, Any],
    embedding_results: list[EmbeddingResult],
) -> bool:
    """Persist successful chunk embeddings and roll back on database failure."""
    try:
        # Match successful provider results to their source chunks.
        for chunk_index, chunk in enumerate(document["chunks"]):
            embedding_result = next(
                (
                    result
                    for result in embedding_results
                    if result.text == chunk["content"] and result.success
                ),
                None,
            )
            if embedding_result is None:
                logger.warning(
                    "No embedding found for chunk %s in %s",
                    chunk_index,
                    document["filename"],
                )
                continue

            # Store document metadata together with each embedded chunk.
            session.add(
                DocumentEmbedding(
                    embedding_id=uuid4(),
                    model_name=embedding_result.model,
                    embedding_vector=embedding_result.embedding,
                    filename=document["filename"],
                    file_path=document.get("file_path"),
                    file_type=document.get("file_type", "pdf"),
                    chunk_content=chunk["content"],
                    chunk_index=chunk["chunk_index"],
                    chunk_size=chunk["metadata"]["chunk_size"],
                )
            )

        await session.commit()
        return True
    except Exception:
        await session.rollback()
        logger.exception("Failed to store document %s", document["filename"])
        return False


async def process_and_store_documents(
    directory_path: Path,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> None:
    """Process every PDF in a directory and persist generated embeddings."""
    config = get_embedding_config()
    resolved_chunk_size = (
        config.default_chunk_size if chunk_size is None else chunk_size
    )
    resolved_chunk_overlap = (
        config.default_chunk_overlap if chunk_overlap is None else chunk_overlap
    )

    # Extract and split all source documents before opening a database session.
    document_processor = DocumentProcessor(
        resolved_chunk_size,
        resolved_chunk_overlap,
    )
    logger.info("Processing PDF files in %s", directory_path)
    documents = document_processor.process_directory(str(directory_path))
    if not documents:
        logger.info("No documents processed")
        return

    # Initialize storage once, then embed and persist each document in order.
    embedding_service = EmbeddingService()
    session_factory = get_session_factory()
    async with session_factory() as session:
        await init_pgvector(session)
        success_count = 0
        total_documents = len(documents)

        for document_index, document in enumerate(documents, 1):
            logger.info(
                "Processing document %s/%s: %s",
                document_index,
                total_documents,
                document["filename"],
            )
            text_chunks = [chunk["content"] for chunk in document["chunks"]]
            if not text_chunks:
                logger.warning("No text chunks found for %s", document["filename"])
                continue

            logger.info("Generating embeddings for %s chunks", len(text_chunks))
            results = await embedding_service.generate_embeddings_batch(text_chunks)
            failures = [result for result in results if not result.success]
            if failures:
                logger.warning(
                    "%s embeddings failed for %s: %s",
                    len(failures),
                    document["filename"],
                    [failure.error for failure in failures[:3]],
                )

            if await store_document_with_embeddings(session, document, results):
                success_count += 1
                logger.info("Stored %s", document["filename"])

    logger.info(
        "Embedding summary: processed=%s stored=%s failed=%s",
        total_documents,
        success_count,
        total_documents - success_count,
    )
