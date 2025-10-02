from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from sqlalchemy import DateTime, String, Text, Integer, func, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

try:
    from sqlalchemy.dialects.postgresql import UUID as PGUUID
except ImportError:  # pragma: no cover
    from sqlalchemy import String as PGUUID  # type: ignore

# Import the base from the service app
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'service'))

from app.db.base import Base


class DocumentEmbedding(Base):
    __tablename__ = "document_embeddings"

    embedding_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Document metadata stored directly in embeddings table
    filename: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_content: Mapped[str] = mapped_column(Text, nullable=False)
    document_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Full document content
    metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Embedding data
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    embedding_vector: Mapped[List[float]] = mapped_column(
        "embedding_vector", nullable=False  # This will be handled by pgvector
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_document_embeddings_filename", "filename"),
        Index("ix_document_embeddings_file_type", "file_type"),
        Index("ix_document_embeddings_model_name", "model_name"),
    )
