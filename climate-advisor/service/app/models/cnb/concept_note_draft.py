"""Public and model-output contracts for sequential Concept Note drafting."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ConceptNoteDraftStatus = Literal["not_started", "running", "failed", "complete"]
ConceptNoteChapterStatus = Literal[
    "empty",
    "draft",
    "needs_review",
    "ready",
]


class ConceptNoteChapterDraftOutput(BaseModel):
    """Structured output produced for exactly one template chapter."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    body_markdown: str = Field(min_length=1, max_length=50_000)
    missing_information: list[str] = Field(default_factory=list, max_length=30)


class ConceptNoteDraftChapterResponse(BaseModel):
    """One persisted chapter with its current immutable revision."""

    chapter_id: UUID
    template_section_id: str | None = None
    title: str
    position: int = Field(ge=0)
    status: ConceptNoteChapterStatus
    required: bool
    user_locked: bool
    body_markdown: str | None = None
    missing_information: list[str] = Field(default_factory=list)
    revision_number: int | None = Field(default=None, ge=1)


class ConceptNoteDraftResponse(BaseModel):
    """Current persisted state of the independent drafting process."""

    run_id: UUID
    status: ConceptNoteDraftStatus
    completed_chapters: int = Field(ge=0)
    total_chapters: int = Field(ge=0)
    current_chapter_id: UUID | None = None
    error_code: str | None = None
    chapters: list[ConceptNoteDraftChapterResponse] = Field(default_factory=list)
