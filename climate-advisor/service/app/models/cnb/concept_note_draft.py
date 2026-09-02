"""Public and model-output contracts for sequential Concept Note drafting."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ConceptNoteDraftStatus = Literal["not_started", "running", "failed", "complete"]
ConceptNoteChapterStatus = Literal[
    "empty",
    "draft",
    "needs_review",
    "ready",
]
ConceptNoteGapSeverity = Literal["critical", "noncritical"]
ConceptNoteGapState = Literal[
    "open",
    "processing",
    "resolved",
    "dismissed",
    "caveat",
]
ConceptNoteGapResolutionAction = Literal[
    "answer",
    "correction",
    "not_a_gap",
    "defer_as_caveat",
    "evidence_update",
]
ConceptNoteRegenerationStatus = Literal["idle", "processing", "failed"]


class ConceptNoteGapSuggestion(BaseModel):
    """One source-grounded answer that the user can review and edit."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    value: str = Field(min_length=1, max_length=2_000)
    source_refs: list[str] = Field(min_length=1, max_length=10)


class ConceptNoteDraftGapOutput(BaseModel):
    """Structured missing-information item emitted by the chapter drafter."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    field_key: str = Field(pattern=r"^[a-z0-9]+(?:_[a-z0-9]+)*$", max_length=255)
    question: str = Field(min_length=1, max_length=2_000)
    why_asking: str = Field(min_length=1, max_length=2_000)
    severity: ConceptNoteGapSeverity
    suggestions: list[ConceptNoteGapSuggestion] = Field(
        default_factory=list,
        max_length=3,
    )


class ConceptNoteChapterDraftOutput(BaseModel):
    """Structured output produced for exactly one template chapter."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    body_markdown: str = Field(min_length=1, max_length=50_000)
    missing_information: list[ConceptNoteDraftGapOutput] = Field(
        default_factory=list,
        max_length=30,
    )


class ConceptNoteGapResolutionResponse(BaseModel):
    """Latest append-only resolution event for one gap."""

    resolution_id: UUID
    action: ConceptNoteGapResolutionAction
    answer: str | None = None
    actor_user_id: str
    source_refs: list[str] = Field(default_factory=list)
    created_at: datetime


class ConceptNoteGapResponse(BaseModel):
    """One actionable or historical structured information gap."""

    gap_id: UUID
    field_key: str
    question: str
    why_asking: str
    severity: ConceptNoteGapSeverity
    state: ConceptNoteGapState
    suggestions: list[ConceptNoteGapSuggestion] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    version: int = Field(ge=1)
    resolution: ConceptNoteGapResolutionResponse | None = None
    created_at: datetime
    updated_at: datetime


class ConceptNoteGapResolveRequest(BaseModel):
    """Versioned, idempotent request to resolve or revisit one gap."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: Literal[
        "answer",
        "correction",
        "not_a_gap",
        "defer_as_caveat",
    ]
    answer: str | None = Field(default=None, max_length=10_000)
    expected_version: int = Field(ge=1)
    idempotency_key: UUID

    @model_validator(mode="after")
    def validate_answer(self) -> ConceptNoteGapResolveRequest:
        """Require text only for answer-bearing resolution actions."""
        if self.action in {"answer", "correction"} and not self.answer:
            raise ValueError("answer is required for answer and correction actions")
        if self.action not in {"answer", "correction"} and self.answer is not None:
            raise ValueError("answer is only valid for answer and correction actions")
        return self


class ConceptNoteChapterConfirmRequest(BaseModel):
    """Idempotently confirm one exact chapter revision as Ready."""

    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    idempotency_key: UUID


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
    gaps: list[ConceptNoteGapResponse] = Field(default_factory=list)
    open_gap_count: int = Field(default=0, ge=0)
    caveat_count: int = Field(default=0, ge=0)
    revision_number: int | None = Field(default=None, ge=1)
    confirmed_body_markdown: str | None = None
    confirmed_revision_number: int | None = Field(default=None, ge=1)
    proposed_revision_number: int | None = Field(default=None, ge=1)
    regeneration_status: ConceptNoteRegenerationStatus = "idle"
    regeneration_error: str | None = None


class ConceptNoteDraftResponse(BaseModel):
    """Current persisted state of the independent drafting process."""

    run_id: UUID
    status: ConceptNoteDraftStatus
    completed_chapters: int = Field(ge=0)
    total_chapters: int = Field(ge=0)
    current_chapter_id: UUID | None = None
    focused_gap_id: UUID | None = None
    error_code: str | None = None
    chapters: list[ConceptNoteDraftChapterResponse] = Field(default_factory=list)
