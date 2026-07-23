"""Pydantic contracts for offline Concept Note Builder funder research."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, JsonValue, model_validator


def _ensure_unique(values: list[str], field_name: str) -> None:
    """Reject duplicate model-generated identifiers before they reach review."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        raise ValueError(f"{field_name} values must be unique: {duplicate_list}")


class ResearchModel(BaseModel):
    """Base model that rejects fields outside the documented research contract."""

    model_config = ConfigDict(extra="forbid")


class FieldEvidence(ResearchModel):
    """Source-grounded support for one funding-record field or related row."""

    evidence_ref: str
    funding_record_ref: str
    target_path: str
    source_ref: str
    source_location: str | None = None
    quote_or_summary: str


class ResearchGap(ResearchModel):
    """A useful target field that could not be established from evidence."""

    target_path: str
    reason: str


class ResearchConflict(ResearchModel):
    """Competing sourced values retained for human review."""

    target_path: str
    candidate_values: list[JsonValue]
    evidence_refs: list[str]
    explanation: str


class AgentTurn(ResearchModel):
    """Concise trace entry for a model-selected or seed Firecrawl action."""

    turn: int = Field(ge=0)
    action: str
    query_or_url: str
    result_summary: str


class ReviewState(ResearchModel):
    """Human review state; research runs can only create pending records."""

    status: Literal["pending_review", "approved", "needs_changes", "rejected"]
    reviewer: str | None = None
    reviewed_at: datetime | None = None
    notes: list[str] = Field(default_factory=list)


class FunderProfileDraft(ResearchModel):
    """Funder facts separated into stated policy and derived award patterns."""

    stated: dict[str, JsonValue] = Field(default_factory=dict)
    derived: dict[str, JsonValue] = Field(default_factory=dict)


class FunderDraft(ResearchModel):
    """One offline funder row ready for later UUID-backed persistence."""

    funder_ref: str
    name: str
    funder_type: str | None = None
    country: str | None = None
    region: str | None = None
    profile: FunderProfileDraft


class FundingRecordDraft(ResearchModel):
    """One opportunity or funded-project row in the shared funding-record shape."""

    funding_record_ref: str
    funder_ref: str
    is_opportunity: bool
    name: str
    applicant_name: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    category: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    min_award: Decimal | None = None
    max_award: Decimal | None = None
    award_amount: Decimal | None = None
    currency: str | None = None
    award_year: int | None = None
    status: str | None = None
    summary: str | None = None


class TemplateChapterDraft(ResearchModel):
    """One chapter discovered in an application template."""

    chapter_ref: str
    title: str
    description: str | None = None
    required: bool | None = None


class FunderTemplateDraft(ResearchModel):
    """One application-template row linked to the opportunity funding record."""

    template_ref: str
    funding_record_ref: str
    template_name: str
    output_format: str | None = None
    chapter_schema: list[TemplateChapterDraft] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)


class FunderCriterionDraft(ResearchModel):
    """One criterion row linked to the opportunity funding record."""

    criterion_ref: str
    funding_record_ref: str
    criterion_type: str
    label: str
    requirement_text: str
    weight: Decimal | None = None
    hard_gate: bool | None = None
    normalized_rule: JsonValue | None = None


class SourceDocumentAssessment(ResearchModel):
    """Model-supplied classification for a code-captured Firecrawl source."""

    source_ref: str
    source_type: str
    publication_date: str | None = None
    license_status: str | None = None


class SourceDocumentDraft(ResearchModel):
    """Immutable provenance metadata for a local Firecrawl snapshot."""

    source_ref: str
    source_type: str
    url: HttpUrl
    title: str | None = None
    publication_date: date | None = None
    license_status: str | None = None
    content_hash: str
    fetched_at: datetime
    local_snapshot_path: str


class FunderProfileFact(ResearchModel):
    """One strict model-facing key/value profile fact."""

    key: str
    value: str


class FunderProfileResearchResult(ResearchModel):
    """Strict model-facing profile converted to bundle dictionaries by code."""

    stated: list[FunderProfileFact] = Field(default_factory=list)
    derived: list[FunderProfileFact] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_keys(self) -> "FunderProfileResearchResult":
        """Prevent dictionary conversion from silently replacing profile facts."""
        _ensure_unique([item.key for item in self.stated], "profile.stated.key")
        _ensure_unique([item.key for item in self.derived], "profile.derived.key")
        return self


class FunderResearchResult(ResearchModel):
    """Structured-output-safe funder row produced by the model."""

    funder_ref: str
    name: str
    funder_type: str | None = None
    country: str | None = None
    region: str | None = None
    profile: FunderProfileResearchResult


class FundingRecordResearchResult(ResearchModel):
    """Structured-output-safe opportunity or funded-project row."""

    funding_record_ref: str
    funder_ref: str
    is_opportunity: bool
    name: str
    applicant_name: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    category: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    min_award: float | None = None
    max_award: float | None = None
    award_amount: float | None = None
    currency: str | None = None
    award_year: int | None = None
    status: str | None = None
    summary: str | None = None


class FunderTemplateResearchResult(ResearchModel):
    """Structured-output-safe template row produced by the model."""

    template_ref: str
    funding_record_ref: str
    template_name: str
    output_format: str | None = None
    chapter_schema: list[TemplateChapterDraft] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_chapter_refs(self) -> "FunderTemplateResearchResult":
        """Keep application-template chapter paths unambiguous for review."""
        _ensure_unique(
            [item.chapter_ref for item in self.chapter_schema],
            "funder_templates.chapter_ref",
        )
        return self


class FunderCriterionResearchResult(ResearchModel):
    """Structured-output-safe criterion row with a textual normalized rule."""

    criterion_ref: str
    funding_record_ref: str
    criterion_type: str
    label: str
    requirement_text: str
    weight: float | None = None
    hard_gate: bool | None = None
    normalized_rule: str | None = None


class ResearchConflictResult(ResearchModel):
    """Structured-output-safe conflict converted to final JsonValue candidates."""

    target_path: str
    candidate_values: list[str]
    evidence_refs: list[str]
    explanation: str


class FundingOpportunityResearchResult(ResearchModel):
    """Exact architecture-shaped structured output produced by the research model."""

    funder: FunderResearchResult
    funding_records: list[FundingRecordResearchResult]
    funder_templates: list[FunderTemplateResearchResult] = Field(default_factory=list)
    funder_criteria: list[FunderCriterionResearchResult] = Field(default_factory=list)
    source_assessments: list[SourceDocumentAssessment] = Field(default_factory=list)
    evidence: list[FieldEvidence] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    conflicts: list[ResearchConflictResult] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_result_references(self) -> "FundingOpportunityResearchResult":
        """Require one opportunity and valid record, evidence, and conflict links."""
        reference_lists = (
            (
                "funding_records.funding_record_ref",
                [item.funding_record_ref for item in self.funding_records],
            ),
            (
                "funder_templates.template_ref",
                [item.template_ref for item in self.funder_templates],
            ),
            (
                "funder_criteria.criterion_ref",
                [item.criterion_ref for item in self.funder_criteria],
            ),
            (
                "source_assessments.source_ref",
                [item.source_ref for item in self.source_assessments],
            ),
            ("evidence.evidence_ref", [item.evidence_ref for item in self.evidence]),
        )
        for field_name, values in reference_lists:
            _ensure_unique(values, field_name)

        opportunity_refs = {
            item.funding_record_ref
            for item in self.funding_records
            if item.is_opportunity
        }
        if len(opportunity_refs) != 1:
            raise ValueError("funding_records must contain exactly one opportunity")

        record_refs = {item.funding_record_ref for item in self.funding_records}
        for record in self.funding_records:
            if record.funder_ref != self.funder.funder_ref:
                raise ValueError(
                    "funding_records.funder_ref must reference the dossier funder"
                )
        for item in [*self.funder_templates, *self.funder_criteria]:
            if item.funding_record_ref not in opportunity_refs:
                raise ValueError(
                    f"{type(item).__name__}.funding_record_ref must reference "
                    "the opportunity record"
                )
        for item in self.evidence:
            if item.funding_record_ref not in record_refs:
                raise ValueError(
                    "evidence.funding_record_ref must reference a funding record"
                )

        evidence_refs = {item.evidence_ref for item in self.evidence}
        for conflict in self.conflicts:
            unknown_refs = set(conflict.evidence_refs) - evidence_refs
            if unknown_refs:
                unknown_list = ", ".join(sorted(unknown_refs))
                raise ValueError(
                    "conflicts.evidence_refs must reference retained evidence: "
                    f"{unknown_list}"
                )
        return self


class FundingOpportunityResearchRequest(ResearchModel):
    """Authoritative seeds, optional prior progress, and the agent-turn limit."""

    funder_name: str = Field(min_length=1)
    funder_url: HttpUrl
    program_name: str = Field(min_length=1)
    program_url: HttpUrl
    application_template_url: HttpUrl | None = None
    current_filled_object: FundingOpportunityResearchResult | None = None
    max_turns: int = Field(default=15, gt=0)


class ResearchRunMetadata(ResearchModel):
    """Code-owned reproducibility and execution metadata for one research run."""

    pipeline_version: Literal["2.0"]
    model_name: str
    reasoning_effort: str
    prompt_sha256: str
    started_at: datetime
    completed_at: datetime
    duration_seconds: float = Field(ge=0)
    max_turns: int = Field(gt=0)
    turns_used: int = Field(gt=0)
    termination_reason: Literal[
        "coverage_complete",
        "turn_limit",
    ]
    mlflow_run_id: str | None = None


class FundingOpportunityResearchBundle(ResearchModel):
    """Canonical locally reviewable envelope emitted by the pipeline."""

    schema_version: Literal["2.0"]
    run_id: str
    run_metadata: ResearchRunMetadata
    request: FundingOpportunityResearchRequest
    funder: FunderDraft
    funding_records: list[FundingRecordDraft]
    funder_templates: list[FunderTemplateDraft] = Field(default_factory=list)
    funder_criteria: list[FunderCriterionDraft] = Field(default_factory=list)
    sources: list[SourceDocumentDraft] = Field(default_factory=list)
    evidence: list[FieldEvidence] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    conflicts: list[ResearchConflict] = Field(default_factory=list)
    agent_trace: list[AgentTurn] = Field(default_factory=list)
    review: ReviewState
