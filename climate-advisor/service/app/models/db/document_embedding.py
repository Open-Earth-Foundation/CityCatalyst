"""Document embedding model for vector search functionality."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DocumentEmbedding(Base):
    """Model for storing document embeddings for vector similarity search."""
    
    __tablename__ = "document_embeddings"

    embedding_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    embedding_vector: Mapped[list[float]] = mapped_column(Vector(None), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Document metadata fields (from migration 20251003_003723)
    filename: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    chunk_content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index(
            "ix_document_embeddings_filename_chunk",
            "filename",
            "chunk_index",
        ),
    )

