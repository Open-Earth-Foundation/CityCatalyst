"""Pydantic contracts for offline Concept Note Builder funder research."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, JsonValue, model_validator

from app.models.cnb.similar_projects import CnbSimilarProjectSearchRequest


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
    """Source-grounded support for one opportunity or funded-project field."""

    evidence_ref: str
    funding_opportunity_ref: str | None = None
    funded_project_ref: str | None = None
    target_path: str
    source_ref: str
    source_location: str | None = None
    quote_or_summary: str

    @model_validator(mode="after")
    def validate_exactly_one_parent(self) -> "FieldEvidence":
        """Require evidence to identify exactly one funding parent."""
        has_opportunity = self.funding_opportunity_ref is not None
        has_project = self.funded_project_ref is not None
        if has_opportunity == has_project:
            raise ValueError(
                "evidence must reference exactly one funding opportunity or "
                "funded project"
            )
        return self


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


class CanonicalFunder(ResearchModel):
    """One existing canonical funder available for reviewer selection."""

    funder_id: UUID
    name: str


class FunderIdentityCandidate(ResearchModel):
    """One proposed canonical funder match retained for human review."""

    funder_id: UUID
    name: str
    match_reason: str


class FundingOpportunityDraft(ResearchModel):
    """One review-facing funding-opportunity row."""

    funding_opportunity_ref: str
    funder_ref: str
    name: str
    applicant_type: str | None = None
    category: str | None = None
    sector: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    min_award: Decimal | None = None
    max_award: Decimal | None = None
    currency: str | None = None
    status: str | None = None
    summary: str | None = None
    known_gaps: list[str] = Field(default_factory=list)


class FundedProjectDraft(ResearchModel):
    """One review-facing funded-project row."""

    funded_project_ref: str
    funder_ref: str
    name: str
    applicant_name: str | None = None
    applicant_type: str | None = None
    reported_funder_name: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    category: str | None = None
    sector: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    award_amount: Decimal | None = None
    currency: str | None = None
    award_year: int | None = None
    status: str | None = None
    summary: str | None = None
    project_tags: list[str] = Field(default_factory=list)
    known_gaps: list[str] = Field(default_factory=list)
    candidate_funders: list[FunderIdentityCandidate] = Field(default_factory=list)
    selected_funder_id: UUID | None = None


class TemplateChapterDraft(ResearchModel):
    """One chapter discovered in an application template."""

    chapter_ref: str
    title: str
    description: str | None = None
    required: bool | None = None


class FunderTemplateDraft(ResearchModel):
    """One application-template row linked to a funding opportunity."""

    template_ref: str
    funding_opportunity_ref: str
    template_name: str
    output_format: str | None = None
    chapter_schema: list[TemplateChapterDraft] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)


class FunderCriterionDraft(ResearchModel):
    """One criterion row linked to a funding opportunity."""

    criterion_ref: str
    funding_opportunity_ref: str
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


class FundingOpportunityResearchResultRow(ResearchModel):
    """Structured-output-safe funding-opportunity row."""

    funding_opportunity_ref: str
    funder_ref: str
    name: str
    applicant_type: str | None = None
    category: str | None = None
    sector: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    min_award: float | None = None
    max_award: float | None = None
    currency: str | None = None
    status: str | None = None
    summary: str | None = None


class FundedProjectResearchResult(ResearchModel):
    """Structured-output-safe funded-project row."""

    funded_project_ref: str
    funder_ref: str
    name: str
    applicant_name: str | None = None
    applicant_type: str | None = None
    reported_funder_name: str | None = None
    city: str | None = None
    state_region: str | None = None
    country: str | None = None
    category: str | None = None
    sector: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    award_amount: float | None = None
    currency: str | None = None
    award_year: int | None = None
    status: str | None = None
    summary: str | None = None


class FunderTemplateResearchResult(ResearchModel):
    """Structured-output-safe template row produced by the model."""

    template_ref: str
    funding_opportunity_ref: str
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
    funding_opportunity_ref: str
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
    funding_opportunities: list[FundingOpportunityResearchResultRow]
    funded_projects: list[FundedProjectResearchResult]
    funder_templates: list[FunderTemplateResearchResult] = Field(default_factory=list)
    funder_criteria: list[FunderCriterionResearchResult] = Field(default_factory=list)
    source_assessments: list[SourceDocumentAssessment] = Field(default_factory=list)
    evidence: list[FieldEvidence] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    conflicts: list[ResearchConflictResult] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_result_references(self) -> "FundingOpportunityResearchResult":
        """Require one opportunity and valid project, evidence, and conflict links."""
        reference_lists = (
            (
                "funding_opportunities.funding_opportunity_ref",
                [
                    item.funding_opportunity_ref
                    for item in self.funding_opportunities
                ],
            ),
            (
                "funded_projects.funded_project_ref",
                [item.funded_project_ref for item in self.funded_projects],
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
            item.funding_opportunity_ref for item in self.funding_opportunities
        }
        if len(opportunity_refs) != 1:
            raise ValueError(
                "funding_opportunities must contain exactly one opportunity"
            )

        project_refs = {item.funded_project_ref for item in self.funded_projects}
        for item in [*self.funding_opportunities, *self.funded_projects]:
            if item.funder_ref != self.funder.funder_ref:
                raise ValueError(
                    "funding references must use the dossier funder_ref"
                )
        for item in [*self.funder_templates, *self.funder_criteria]:
            if item.funding_opportunity_ref not in opportunity_refs:
                raise ValueError(
                    f"{type(item).__name__}.funding_opportunity_ref must reference "
                    "a funding opportunity"
                )
        for item in self.evidence:
            if (
                item.funding_opportunity_ref is not None
                and item.funding_opportunity_ref not in opportunity_refs
            ):
                raise ValueError(
                    "evidence.funding_opportunity_ref must reference an opportunity"
                )
            if (
                item.funded_project_ref is not None
                and item.funded_project_ref not in project_refs
            ):
                raise ValueError(
                    "evidence.funded_project_ref must reference a funded project"
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
    """Program seeds, optional target project or prior progress, and turn limit."""

    funder_name: str = Field(min_length=1)
    funder_url: HttpUrl
    program_name: str = Field(min_length=1)
    program_url: HttpUrl
    application_template_url: HttpUrl | None = None
    current_filled_object: FundingOpportunityResearchResult | None = None
    target_project: CnbSimilarProjectSearchRequest | None = None
    target_funded_projects: int = Field(default=1, gt=0, le=50)
    max_turns: int = Field(default=15, gt=0)


class ResearchRunMetadata(ResearchModel):
    """Code-owned reproducibility and execution metadata for one research run."""

    pipeline_version: Literal["3.0"]
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

    schema_version: Literal["3.0"]
    run_id: str
    run_metadata: ResearchRunMetadata
    request: FundingOpportunityResearchRequest
    funder: FunderDraft
    funding_opportunities: list[FundingOpportunityDraft]
    funded_projects: list[FundedProjectDraft]
    funder_templates: list[FunderTemplateDraft] = Field(default_factory=list)
    funder_criteria: list[FunderCriterionDraft] = Field(default_factory=list)
    sources: list[SourceDocumentDraft] = Field(default_factory=list)
    evidence: list[FieldEvidence] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    conflicts: list[ResearchConflict] = Field(default_factory=list)
    agent_trace: list[AgentTurn] = Field(default_factory=list)
    review: ReviewState
