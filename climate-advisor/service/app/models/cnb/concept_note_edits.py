"""Bounded, run-scoped contracts for proposals that never mutate a draft implicitly."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PositiveInt, model_validator

EditStatus = Literal[
    "processing",
    "clarification_required",
    "proposed",
    "applied",
    "partially_applied",
    "rejected",
    "failed",
    "stale",
]


class EditScope(BaseModel):
    """Automatic model-selected scope with an optional non-binding UI focus hint."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: Literal["auto"] = "auto"
    focused_chapter_id: UUID | None = None


class EditProposalRequest(BaseModel):
    """An idempotent request for an inspectable proposal, not permission to apply."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    instruction: str = Field(min_length=1, max_length=8_000)
    scope: EditScope = Field(default_factory=EditScope)
    idempotency_key: UUID
    refines_proposal_id: UUID | None = None

    @model_validator(mode="after")
    def validate_instruction(self) -> EditProposalRequest:
        """Require substantive instructions without altering exact user text."""
        if not self.instruction.strip():
            raise ValueError("instruction must not be blank")
        return self


class ChapterPlannedTextChange(BaseModel):
    """One exact replacement anchor returned for the supplied chapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    start: int = Field(ge=0, le=50_000)
    before: str = Field(min_length=1, max_length=50_000)
    after: str = Field(max_length=50_000)
    kind: Literal["wording", "factual"]
    group_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    source_refs: list[str] = Field(default_factory=list, max_length=20)
    user_input_quote: str | None = Field(default=None, max_length=8_000)

    @model_validator(mode="after")
    def validate_change(self) -> PlannedTextChange:
        """Reject no-ops and require a provenance claim for factual changes."""
        if self.before == self.after:
            raise ValueError("a change must alter the selected text")
        if self.kind == "factual" and not (self.source_refs or self.user_input_quote):
            raise ValueError("factual changes require evidence or explicit user input")
        return self


class PlannedTextChange(ChapterPlannedTextChange):
    """A chapter-bound replacement assembled by the edit planner."""

    chapter_id: UUID
    # Assigned only by the independent review call, never by the edit planner.
    semantic_support: Literal["preserved", "user", "source"] | None = Field(
        default=None, exclude=True
    )


class EditSemanticDecision(BaseModel):
    """Independent assessment of one indexed replacement in its chapter context."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    change_index: int = Field(ge=0, le=99)
    support: Literal["preserved", "user", "source", "unsupported"]
    explanation: str = Field(min_length=1, max_length=1000)


class ChapterEditReview(BaseModel):
    """Complete semantic review; missing or duplicate decisions fail closed."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    decisions: list[EditSemanticDecision] = Field(min_length=1, max_length=100)


class ChapterEditPlanOutput(BaseModel):
    """Model output for one independently evaluated chapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    intent: Literal["edit", "question", "clarification", "no_change"]
    changes: list[ChapterPlannedTextChange] = Field(
        default_factory=list, max_length=100
    )
    clarification: str | None = Field(default=None, min_length=1, max_length=2_000)

    @model_validator(mode="after")
    def validate_intent(self) -> ChapterEditPlanOutput:
        """Keep edits, questions, clarifications, and unaffected chapters distinct."""
        if (self.intent == "edit") != bool(self.changes):
            raise ValueError("only edit intent may contain changes, and requires them")
        if (self.intent == "clarification") != (self.clarification is not None):
            raise ValueError("clarification intent requires exactly one question")
        return self


class EditPlanOutput(BaseModel):
    """Planner output; identities and timestamps are assigned by the service."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    intent: Literal["edit", "question", "clarification"]
    changes: list[PlannedTextChange] = Field(default_factory=list, max_length=100)
    clarification: str | None = Field(default=None, min_length=1, max_length=2_000)

    @model_validator(mode="after")
    def validate_intent(self) -> EditPlanOutput:
        """Keep ordinary questions and clarification separate from edit proposals."""
        if (self.intent == "edit") != bool(self.changes):
            raise ValueError("only edit intent may contain changes, and requires them")
        if (self.intent == "clarification") != (self.clarification is not None):
            raise ValueError("clarification intent requires exactly one question")
        return self


class EditSourceSnapshot(BaseModel):
    """Server-verified immutable source identity behind one factual replacement."""

    upload_id: UUID
    source_label: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EditChange(PlannedTextChange):
    """A reviewed replacement with server-assigned identity and real chapter title."""

    change_id: UUID
    chapter_title: str
    base_revision: PositiveInt
    source_snapshots: list[EditSourceSnapshot] = Field(default_factory=list)


class EditApplyRequest(BaseModel):
    """Explicit acceptance bound to the proposal's entire base revision vector."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    idempotency_key: UUID
    expected_revisions: dict[UUID, PositiveInt] = Field(min_length=1, max_length=100)
    selected_change_ids: list[UUID] | None = Field(
        default=None, min_length=1, max_length=100
    )

    @model_validator(mode="after")
    def validate_selection(self) -> EditApplyRequest:
        """Keep selection decisions unambiguous on retries."""
        if self.selected_change_ids is not None and len(
            set(self.selected_change_ids)
        ) != len(self.selected_change_ids):
            raise ValueError("selected_change_ids must be unique")
        return self


class EditApplicationResult(BaseModel):
    """Persisted acceptance result returned verbatim for an idempotent retry."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    application_id: UUID
    accepted_change_ids: list[UUID]
    revisions: dict[UUID, PositiveInt]


class EditProposalResponse(BaseModel):
    """Durable proposal state, kept separate from current document content."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    proposal_id: UUID
    run_id: UUID
    instruction: str
    scope: EditScope
    status: EditStatus
    base_revisions: dict[UUID, PositiveInt] = Field(default_factory=dict)
    changes: list[EditChange] = Field(default_factory=list)
    clarification: str | None = None
    error_code: str | None = None
    result: EditApplicationResult | None = None
    created_at: datetime
    updated_at: datetime


class EditHistoryRequest(BaseModel):
    """Explicit compensating revision bound to every affected current chapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    idempotency_key: UUID
    expected_revisions: dict[UUID, PositiveInt] = Field(min_length=1, max_length=100)


class EditHistoryChapter(BaseModel):
    """An inspectable immutable before/after snapshot in one history batch."""

    chapter_id: UUID
    chapter_title: str
    before: str
    after: str


class EditHistoryEntry(BaseModel):
    """Compact ordered history; detail reads include full immutable chapter text."""

    application_id: UUID
    run_id: UUID
    proposal_id: UUID | None
    restores_application_id: UUID | None
    sequence: PositiveInt
    operation: Literal["apply", "undo", "restore"]
    before_revisions: dict[UUID, PositiveInt]
    after_revisions: dict[UUID, PositiveInt]
    accepted_change_ids: list[UUID]
    created_at: datetime
    chapters: list[EditHistoryChapter] = Field(default_factory=list)
