from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ConceptNoteMarkdownRequest(BaseModel):
    """Completed CC-produced Markdown and immutable artifact metadata."""

    markdown: str = Field(min_length=1)
    filename: str = Field(min_length=1, max_length=255)
    source_label: str | None = Field(default=None, max_length=255)
    page_count: int = Field(ge=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ConceptNoteMarkdownResponse(BaseModel):
    """Acknowledgement returned after durable repository registration."""

    upload_id: UUID
    status: Literal["processing"] = "processing"
