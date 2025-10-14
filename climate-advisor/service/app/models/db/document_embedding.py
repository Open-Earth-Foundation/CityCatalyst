"""Document embedding model for vector search functionality."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from pgvector.sqlalchemy import Vector

from ...db import Base


class DocumentEmbedding(Base):
    """Model for storing document embeddings for vector similarity search."""
    
    __tablename__ = "document_embeddings"

    embedding_id: Mapped[str] = mapped_column(PG_UUID(), primary_key=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    embedding_vector: Mapped[Vector] = mapped_column(Vector(None), nullable=False)  # type: ignore
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    
    # Document metadata fields (from migration 20251003_003723)
    filename: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    file_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    chunk_content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)

