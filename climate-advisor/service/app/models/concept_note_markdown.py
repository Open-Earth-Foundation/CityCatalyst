from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ConceptNoteUploadCreateRequest(BaseModel):
    """Register an immutable upload identity before CC conversion begins."""

    model_config = ConfigDict(extra="forbid")

    upload_id: UUID
    user_id: str = Field(min_length=1, max_length=255)
    filename: str = Field(min_length=1, max_length=255)
    source_label: str | None = Field(default=None, max_length=255)


class ConceptNoteMarkdownRequest(BaseModel):
    """Completed CC-owned Markdown object and immutable result metadata."""

    model_config = ConfigDict(extra="forbid")

    markdown_s3_key: str = Field(min_length=1, max_length=1024)
    filename: str = Field(min_length=1, max_length=255)
    source_label: str | None = Field(default=None, max_length=255)
    page_count: int = Field(ge=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ConceptNoteMarkdownResponse(BaseModel):
    """Lifecycle response returned for one run-scoped upload."""

    upload_id: UUID
    status: Literal["queued", "processing", "ready", "failed"]


class ConceptNoteUploadStatusResponse(ConceptNoteMarkdownResponse):
    """Safe persisted metadata returned to the CC browser-facing proxy."""

    run_id: UUID
    filename: str
    source_label: str | None = None
    page_count: int | None = None
    error_code: str | None = None
    received_at: datetime
    completed_at: datetime | None = None


class ConceptNoteUploadFailureRequest(BaseModel):
    """Record a stable CC upload, OCR, or delivery failure."""

    model_config = ConfigDict(extra="forbid")

    error_code: str = Field(min_length=1, max_length=64)


class ConceptNoteUploadDeliveryContext(BaseModel):
    """Metadata CC needs to deliver a terminal OCR outcome."""

    upload_id: UUID
    run_id: UUID
    user_id: str
    filename: str
    source_label: str | None = None
