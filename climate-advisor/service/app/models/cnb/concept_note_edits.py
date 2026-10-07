"""Bounded, run-scoped contracts for proposals that never mutate a draft implicitly."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from app.models.cnb.concept_note_structure import StructureProposal
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

# Run context sections an edit may cite, with the label shown to the user.
EDIT_CONTEXT_LABELS: dict[str, str] = {
    "city": "CityCatalyst city profile",
    "project": "CityCatalyst project",
    "ghgi": "CityCatalyst GHG inventory",
    "ccra": "CityCatalyst climate risk assessment",
    "hiap": "CityCatalyst prioritized climate actions",
    "manual_population": "Population entered for this concept note",
}
EditContextSection = Literal[
    "city", "project", "ghgi", "ccra", "hiap", "manual_population"
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
    """One resolved replacement anchor in a chapter snapshot."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    start: int = Field(ge=0, le=50_000)
    before: str = Field(min_length=1, max_length=50_000)
    after: str = Field(max_length=50_000)
    kind: Literal["wording", "factual"]
    group_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    source_refs: list[str] = Field(
        default_factory=list,
        max_length=20,
        description="One-based selected-source indices encoded as strings, never labels or IDs.",
    )
    user_input_quote: str | None = Field(default=None, max_length=8_000)
    context_refs: list[EditContextSection] = Field(
        default_factory=list,
        max_length=len(EDIT_CONTEXT_LABELS),
        description="Run context sections (CityCatalyst data or user-entered population) supporting the change.",
    )

    @model_validator(mode="after")
    def validate_change(self) -> PlannedTextChange:
        """Reject no-ops and require a provenance claim for factual changes."""
        if self.before == self.after:
            raise ValueError("a change must alter the selected text")
        if self.kind == "factual" and not (
            self.source_refs or self.user_input_quote or self.context_refs
        ):
            raise ValueError(
                "factual changes require evidence, run context, or explicit user input"
            )
        return self


class PlannedTextChange(ChapterPlannedTextChange):
    """A chapter-bound replacement assembled by the edit planner."""

    chapter_id: UUID
    # Assigned only by the independent review call, never by the edit planner.
    semantic_support: Literal["preserved", "user", "source", "context"] | None = Field(
        default=None, exclude=True
    )


class EditSemanticDecision(BaseModel):
    """Independent assessment of one indexed replacement in its chapter context."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    change_index: int = Field(ge=0, le=99)
    support: Literal["preserved", "user", "source", "context", "unsupported"]
    explanation: str = Field(min_length=1, max_length=1000)


class ChapterEditReview(BaseModel):
    """Complete semantic review; missing or duplicate decisions fail closed."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    decisions: list[EditSemanticDecision] = Field(min_length=1, max_length=100)


class EditNotice(BaseModel):
    """Server-counted exclusions retained with the reviewable proposal."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    code: Literal["protected_markers", "locked_chapters", "template_headings"]
    count: int = Field(ge=1)


class DraftReplacement(BaseModel):
    """Agent-selected replacements over an exact, server-owned search result."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    search_id: str
    replacement: str = Field(max_length=50_000)
    replace_all: bool = False
    match_ids: list[str] = Field(default_factory=list, max_length=100)
    kind: Literal["wording", "factual"]
    group_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    source_refs: list[str] = Field(default_factory=list, max_length=20)
    user_input_quote: str | None = Field(default=None, max_length=8_000)
    context_refs: list[EditContextSection] = Field(
        default_factory=list, max_length=len(EDIT_CONTEXT_LABELS)
    )


class EditAgentOutput(BaseModel):
    """End the tool loop; successful changes come only from the proposal tool."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    intent: Literal["edit", "question", "clarification"]
    clarification: str | None = Field(default=None, min_length=1, max_length=2_000)

    @model_validator(mode="after")
    def validate_clarification(self) -> EditAgentOutput:
        """Require an explanation only when an edit cannot be proposed."""
        if (self.intent == "clarification") != (self.clarification is not None):
            raise ValueError("clarification intent requires exactly one explanation")
        return self


class EditPlanOutput(BaseModel):
    """Planner output; identities and timestamps are assigned by the service."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    intent: Literal["edit", "question", "clarification"]
    structure: StructureProposal | None = None
    changes: list[PlannedTextChange] = Field(default_factory=list, max_length=100)
    notices: list[EditNotice] = Field(default_factory=list)
    clarification: str | None = Field(default=None, min_length=1, max_length=2_000)

    @model_validator(mode="after")
    def validate_intent(self) -> EditPlanOutput:
        """Keep ordinary questions and clarification separate from edit proposals."""
        if self.structure is not None and self.changes:
            raise ValueError("Propose structure and text changes separately")
        if (self.intent == "edit") != bool(self.changes or self.structure):
            raise ValueError("only edit intent may contain changes, and requires them")
        if (self.intent == "clarification") != (self.clarification is not None):
            raise ValueError("clarification intent requires exactly one question")
        return self


class EditSourceSnapshot(BaseModel):
    """Server-verified immutable source identity behind one factual replacement."""

    upload_id: UUID
    source_label: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EditContextSnapshot(BaseModel):
    """Server-verified run context section behind one factual replacement."""

    section: EditContextSection
    label: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class EditChange(PlannedTextChange):
    """A reviewed replacement with server-assigned identity and real chapter title."""

    change_id: UUID
    chapter_title: str
    base_revision: PositiveInt
    source_snapshots: list[EditSourceSnapshot] = Field(default_factory=list)
    context_snapshots: list[EditContextSnapshot] = Field(default_factory=list)


class EditApplyRequest(BaseModel):
    """Explicit acceptance bound to the proposal's entire base revision vector."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    idempotency_key: UUID
    expected_revisions: dict[UUID, PositiveInt] = Field(
        default_factory=dict, max_length=100
    )
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
    structure: StructureProposal | None = None
    changes: list[EditChange] = Field(default_factory=list)
    notices: list[EditNotice] = Field(default_factory=list)
    clarification: str | None = None
    error_code: str | None = None
    result: EditApplicationResult | None = None
    created_at: datetime
    updated_at: datetime
