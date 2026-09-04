"""Public and model-output contracts for sequential Concept Note drafting."""

from __future__ import annotations

from datetime import datetime
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
ConceptNoteValidationStatus = Literal["ready", "needs_review", "incomplete"]
ConceptNoteValidationCheckStatus = Literal["pass", "warning", "fail"]
ConceptNoteValidationFindingSeverity = Literal["warning", "blocking"]


class ConceptNoteChapterDraftOutput(BaseModel):
    """Structured output produced for exactly one template chapter."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    body_markdown: str = Field(min_length=1, max_length=50_000)
    missing_information: list[str] = Field(default_factory=list, max_length=30)


class ConceptNoteValidationCheckResponse(BaseModel):
    """One derived readiness area in the public validation response."""

    key: str
    label: str
    status: ConceptNoteValidationCheckStatus
    message: str | None = None


class ConceptNoteValidationFindingResponse(BaseModel):
    """One actionable issue found by a validation pass or deterministic gate."""

    phase: str
    category: str
    severity: ConceptNoteValidationFindingSeverity
    message: str
    suggested_action: str
    involved_chapter_ids: list[UUID] = Field(default_factory=list)
    excerpts: list[str] = Field(default_factory=list)


class ConceptNoteChapterValidationResponse(BaseModel):
    """Latest persisted chapter validation with server-derived staleness."""

    status: ConceptNoteValidationStatus
    is_stale: bool
    validated_revision_number: int | None = Field(default=None, ge=1)
    validated_at: datetime
    checks: list[ConceptNoteValidationCheckResponse] = Field(default_factory=list)
    findings: list[ConceptNoteValidationFindingResponse] = Field(default_factory=list)


class ConceptNoteChapterValidationActionResponse(
    ConceptNoteChapterValidationResponse
):
    """Explicit mark-ready response identifying the validated chapter."""

    chapter_id: UUID


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
    validation: ConceptNoteChapterValidationResponse | None = None


class ConceptNoteDraftResponse(BaseModel):
    """Current persisted state of the independent drafting process."""

    run_id: UUID
    status: ConceptNoteDraftStatus
    completed_chapters: int = Field(ge=0)
    total_chapters: int = Field(ge=0)
    current_chapter_id: UUID | None = None
    error_code: str | None = None
    chapters: list[ConceptNoteDraftChapterResponse] = Field(default_factory=list)
