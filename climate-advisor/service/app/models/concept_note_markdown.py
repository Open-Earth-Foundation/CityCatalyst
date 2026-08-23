from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ConceptNoteSourceFormat = Literal["pdf", "markdown"]


def source_format_from_filename(filename: str) -> ConceptNoteSourceFormat:
    """Return the immutable source format encoded by an upload filename."""
    normalized = filename.casefold()
    if normalized.endswith(".pdf"):
        return "pdf"
    if normalized.endswith(".md"):
        return "markdown"
    raise ValueError("Concept Note sources must use a .pdf or .md filename")


class ConceptNoteUploadCreateRequest(BaseModel):
    """Register an immutable upload identity before CC processing begins."""

    model_config = ConfigDict(extra="forbid")

    upload_id: UUID
    user_id: str = Field(min_length=1, max_length=255)
    filename: str = Field(min_length=1, max_length=255)
    source_label: str | None = Field(default=None, max_length=255)
    source_format: ConceptNoteSourceFormat = "pdf"

    @model_validator(mode="after")
    def validate_source_format(self) -> ConceptNoteUploadCreateRequest:
        """Require the declared source format to match the immutable filename."""
        if source_format_from_filename(self.filename) != self.source_format:
            raise ValueError("source_format does not match filename")
        return self


class ConceptNoteMarkdownRequest(BaseModel):
    """Completed CC-owned Markdown object and immutable result metadata."""

    model_config = ConfigDict(extra="forbid")

    markdown_s3_key: str = Field(min_length=1, max_length=1024)
    filename: str = Field(min_length=1, max_length=255)
    source_label: str | None = Field(default=None, max_length=255)
    source_format: ConceptNoteSourceFormat = "pdf"
    page_count: int | None = Field(default=None, ge=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_source_metadata(self) -> ConceptNoteMarkdownRequest:
        """Keep PDF pagination and native Markdown anchors mutually exclusive."""
        if source_format_from_filename(self.filename) != self.source_format:
            raise ValueError("source_format does not match filename")
        if self.source_format == "pdf" and self.page_count is None:
            raise ValueError("PDF sources require page_count")
        if self.source_format == "markdown" and self.page_count is not None:
            raise ValueError("Markdown sources cannot declare page_count")
        return self


class ConceptNoteMarkdownResponse(BaseModel):
    """Lifecycle response returned for one run-scoped upload."""

    upload_id: UUID
    status: Literal["queued", "processing", "ready", "failed"]


class ConceptNoteUploadStatusResponse(ConceptNoteMarkdownResponse):
    """Safe persisted metadata returned to the CC browser-facing proxy."""

    run_id: UUID
    filename: str
    source_label: str | None = None
    source_format: ConceptNoteSourceFormat
    page_count: int | None = None
    error_code: str | None = None
    received_at: datetime
    completed_at: datetime | None = None


class ConceptNoteUploadFailureRequest(BaseModel):
    """Record a stable CC upload, OCR, or delivery failure."""

    model_config = ConfigDict(extra="forbid")

    error_code: str = Field(min_length=1, max_length=64)


class ConceptNoteUploadDeliveryContext(BaseModel):
    """Metadata CC needs to deliver a terminal source-processing outcome."""

    upload_id: UUID
    run_id: UUID
    user_id: str
    filename: str
    source_label: str | None = None
    source_format: ConceptNoteSourceFormat
