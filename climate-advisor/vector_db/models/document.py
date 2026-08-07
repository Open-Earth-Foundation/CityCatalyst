from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, String, Text, Integer, func, Index
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

# Import the base from the service app
import sys
import os

# Add the parent directory (climate-advisor) to the path so we can import from service
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, parent_dir)

from service.app.db.base import Base


class DocumentEmbedding(Base):
    __tablename__ = "document_embeddings"

    # Primary embedding data
    embedding_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    embedding_vector: Mapped[List[float]] = mapped_column(
        Vector(),
        nullable=False,
    )
    
    # Document metadata
    filename: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    file_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Chunk data
    chunk_content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_document_embeddings_model_name", "model_name"),
        Index("ix_document_embeddings_filename", "filename"),
        Index("ix_document_embeddings_filename_chunk", "filename", "chunk_index"),
    )
