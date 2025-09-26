from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from sqlalchemy import DateTime, String, Text, Integer, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
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


class Document(Base):
    __tablename__ = "documents"

    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=True)  # Extracted text content
    metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship to chunks
    chunks: Mapped[List["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_documents_filename", "filename"),
        Index("ix_documents_file_type", "file_type"),
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    chunk_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship to document
    document: Mapped["Document"] = relationship("Document", back_populates="chunks")

    # Relationship to embeddings
    embeddings: Mapped[List["DocumentEmbedding"]] = relationship(
        "DocumentEmbedding", back_populates="chunk", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_document_chunks_document_id", "document_id"),
        Index("ix_document_chunks_chunk_index", "chunk_index"),
    )


class DocumentEmbedding(Base):
    __tablename__ = "document_embeddings"

    embedding_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    chunk_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("document_chunks.chunk_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    embedding_vector: Mapped[List[float]] = mapped_column(
        "embedding_vector", nullable=False  # This will be handled by pgvector
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship to chunk
    chunk: Mapped["DocumentChunk"] = relationship("DocumentChunk", back_populates="embeddings")

    __table_args__ = (
        Index("ix_document_embeddings_chunk_id", "chunk_id"),
        Index("ix_document_embeddings_model_name", "model_name"),
    )
