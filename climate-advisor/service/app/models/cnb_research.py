"""Pydantic contracts for offline Concept Note Builder funder research."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, JsonValue, model_validator


FinancialAmountKind = Literal[
    "program_capitalization",
    "portfolio_technical_assistance_total",
    "individual_technical_assistance",
    "requested_assistance",
    "identified_investment_longlist",
    "priority_investment_shortlist",
    "committed_financing",
    "disbursed_financing",
    "other",
]


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
    """Source-grounded support for one path in the opportunity dossier."""

    evidence_ref: str
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


class TemplateChapterDraft(ResearchModel):
    """One chapter discovered in an application template."""

    chapter_ref: str
    title: str
    description: str | None = None
    required: bool | None = None


class FunderTemplateDraft(ResearchModel):
    """Optional application-template structure for the program."""

    template_ref: str
    template_name: str
    source_url: HttpUrl
    output_format: str | None = None
    chapter_schema: list[TemplateChapterDraft] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)


class FunderCriterionDraft(ResearchModel):
    """One eligibility, evaluation, or application criterion."""

    criterion_ref: str
    criterion_type: str
    label: str
    requirement_text: str
    weight: Decimal | None = None
    hard_gate: bool | None = None
    normalized_rule: JsonValue | None = None


class FundedProjectDraft(ResearchModel):
    """A previously funded project associated with the program."""

    project_ref: str
    title: str
    applicant: str | None = None
    city: str | None = None
    state_or_region: str | None = None
    country: str | None = None
    category: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    summary: str | None = None


class FundedProjectActionDraft(ResearchModel):
    """One action carried out by a referenced funded project."""

    action_ref: str
    project_ref: str
    action_type: str | None = None
    category: str | None = None
    hazards: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    description: str


class FundingLinkDraft(ResearchModel):
    """Program award or request linked to a project or action."""

    funding_link_ref: str
    project_ref: str | None = None
    action_ref: str | None = None
    program_name: str
    award_amount: Decimal | None = None
    requested_amount: Decimal | None = None
    currency: str | None = None
    calendar_year: int | None = None
    instrument_type: str | None = None
    lifecycle_stage: str | None = None
    status: str | None = None


class FinancialAmountDraft(ResearchModel):
    """One monetary fact with explicit meaning, timing, and project linkage."""

    amount_ref: str
    project_ref: str | None = None
    action_ref: str | None = None
    program_name: str
    amount: Decimal
    currency: str
    amount_kind: FinancialAmountKind
    calendar_year: int | None = None
    status: str | None = None
    description: str


class FundingPipelineEntryDraft(ResearchModel):
    """A ranked or fundable application disclosed by the program."""

    entry_ref: str
    program_name: str
    external_project_reference: str | None = None
    applicant: str | None = None
    rank: int | None = None
    requested_amount: Decimal | None = None
    fundable_amount: Decimal | None = None
    currency: str | None = None
    calendar_year: int | None = None
    status: str | None = None


class FundingOpportunityResearchDraft(ResearchModel):
    """Denormalized funder and program dossier for one opportunity."""

    funder_name: str
    funder_url: HttpUrl
    funder_type: str | None = None
    funder_country: str | None = None
    funder_region: str | None = None
    funder_profile: FunderProfileDraft
    program_name: str
    program_url: HttpUrl
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    min_award: Decimal | None = None
    max_award: Decimal | None = None
    currency: str | None = None
    live_status: str | None = None
    status: str | None = None
    application_template: FunderTemplateDraft | None = None
    criteria: list[FunderCriterionDraft] = Field(default_factory=list)
    funded_projects: list[FundedProjectDraft] = Field(default_factory=list)
    funded_project_actions: list[FundedProjectActionDraft] = Field(
        default_factory=list
    )
    funding_links: list[FundingLinkDraft] = Field(default_factory=list)
    financial_amounts: list[FinancialAmountDraft] = Field(default_factory=list)
    pipeline_entries: list[FundingPipelineEntryDraft] = Field(default_factory=list)


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
        _ensure_unique([item.key for item in self.stated], "funder_profile.stated.key")
        _ensure_unique([item.key for item in self.derived], "funder_profile.derived.key")
        return self


class FunderCriterionResearchResult(ResearchModel):
    """Strict model-facing criterion with a textual normalized rule."""

    criterion_ref: str
    criterion_type: str
    label: str
    requirement_text: str
    weight: float | None = None
    hard_gate: bool | None = None
    normalized_rule: str | None = None


class FunderTemplateResearchResult(ResearchModel):
    """Structured-output-safe application template produced by the model."""

    template_ref: str
    template_name: str
    source_url: str
    output_format: str | None = None
    chapter_schema: list[TemplateChapterDraft] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_chapter_refs(self) -> "FunderTemplateResearchResult":
        """Keep application-template chapter paths unambiguous for review."""
        _ensure_unique(
            [item.chapter_ref for item in self.chapter_schema],
            "application_template.chapter_ref",
        )
        return self


class FundingLinkResearchResult(ResearchModel):
    """Structured-output-safe project or action funding relationship."""

    funding_link_ref: str
    project_ref: str | None = None
    action_ref: str | None = None
    program_name: str
    award_amount: float | None = None
    requested_amount: float | None = None
    currency: str | None = None
    calendar_year: int | None = None
    instrument_type: str | None = None
    lifecycle_stage: str | None = None
    status: str | None = None


class FinancialAmountResearchResult(ResearchModel):
    """Structured-output-safe monetary fact with explicit financial meaning."""

    amount_ref: str
    project_ref: str | None = None
    action_ref: str | None = None
    program_name: str
    amount: float
    currency: str
    amount_kind: FinancialAmountKind
    calendar_year: int | None = None
    status: str | None = None
    description: str


class FundingPipelineEntryResearchResult(ResearchModel):
    """Structured-output-safe published pipeline entry."""

    entry_ref: str
    program_name: str
    external_project_reference: str | None = None
    applicant: str | None = None
    rank: int | None = None
    requested_amount: float | None = None
    fundable_amount: float | None = None
    currency: str | None = None
    calendar_year: int | None = None
    status: str | None = None


class FundingOpportunityResearchAgentDraft(ResearchModel):
    """Structured-output-safe opportunity contract produced by the model."""

    funder_name: str
    funder_url: str
    funder_type: str | None = None
    funder_country: str | None = None
    funder_region: str | None = None
    funder_profile: FunderProfileResearchResult
    program_name: str
    program_url: str
    finance_route: str | None = None
    instrument_type: str | None = None
    region_scope: str | None = None
    min_award: float | None = None
    max_award: float | None = None
    currency: str | None = None
    live_status: str | None = None
    status: str | None = None
    application_template: FunderTemplateResearchResult | None = None
    criteria: list[FunderCriterionResearchResult] = Field(default_factory=list)
    funded_projects: list[FundedProjectDraft] = Field(default_factory=list)
    funded_project_actions: list[FundedProjectActionDraft] = Field(
        default_factory=list
    )
    funding_links: list[FundingLinkResearchResult] = Field(default_factory=list)
    financial_amounts: list[FinancialAmountResearchResult] = Field(
        default_factory=list
    )
    pipeline_entries: list[FundingPipelineEntryResearchResult] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def validate_record_references(self) -> "FundingOpportunityResearchAgentDraft":
        """Require unique record IDs and valid project/action relationships."""
        # Reject duplicate IDs before evidence paths and UI decisions use them as keys.
        reference_lists = (
            ("criteria.criterion_ref", [item.criterion_ref for item in self.criteria]),
            (
                "funded_projects.project_ref",
                [item.project_ref for item in self.funded_projects],
            ),
            (
                "funded_project_actions.action_ref",
                [item.action_ref for item in self.funded_project_actions],
            ),
            (
                "funding_links.funding_link_ref",
                [item.funding_link_ref for item in self.funding_links],
            ),
            (
                "financial_amounts.amount_ref",
                [item.amount_ref for item in self.financial_amounts],
            ),
            (
                "pipeline_entries.entry_ref",
                [item.entry_ref for item in self.pipeline_entries],
            ),
        )
        for field_name, values in reference_lists:
            _ensure_unique(values, field_name)

        # Validate every optional relationship against the records in this dossier.
        project_refs = {item.project_ref for item in self.funded_projects}
        actions_by_ref = {
            item.action_ref: item for item in self.funded_project_actions
        }
        for action in self.funded_project_actions:
            if action.project_ref not in project_refs:
                raise ValueError(
                    "funded_project_actions.project_ref must reference a funded "
                    f"project: {action.project_ref}"
                )

        linked_records = [*self.funding_links, *self.financial_amounts]
        for item in linked_records:
            if item.project_ref is not None and item.project_ref not in project_refs:
                raise ValueError(
                    f"{type(item).__name__}.project_ref references an unknown "
                    f"project: {item.project_ref}"
                )
            if item.action_ref is None:
                continue
            action = actions_by_ref.get(item.action_ref)
            if action is None:
                raise ValueError(
                    f"{type(item).__name__}.action_ref references an unknown "
                    f"action: {item.action_ref}"
                )
            if item.project_ref is not None and action.project_ref != item.project_ref:
                raise ValueError(
                    f"{type(item).__name__} links action {item.action_ref} to the "
                    f"wrong project {item.project_ref}"
                )
        return self


class ResearchConflictResult(ResearchModel):
    """Structured-output-safe conflict converted to final JsonValue candidates."""

    target_path: str
    candidate_values: list[str]
    evidence_refs: list[str]
    explanation: str


class FundingOpportunityResearchResult(ResearchModel):
    """Exact structured output produced by the research model."""

    opportunity: FundingOpportunityResearchAgentDraft
    source_assessments: list[SourceDocumentAssessment] = Field(default_factory=list)
    evidence: list[FieldEvidence] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    conflicts: list[ResearchConflictResult] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_result_references(self) -> "FundingOpportunityResearchResult":
        """Require unique evidence IDs and conflict links to known evidence."""
        _ensure_unique(
            [item.source_ref for item in self.source_assessments],
            "source_assessments.source_ref",
        )
        evidence_refs = [item.evidence_ref for item in self.evidence]
        _ensure_unique(evidence_refs, "evidence.evidence_ref")
        known_evidence_refs = set(evidence_refs)
        for conflict in self.conflicts:
            unknown_refs = set(conflict.evidence_refs) - known_evidence_refs
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
    max_turns: int = Field(gt=0)


class ResearchRunMetadata(ResearchModel):
    """Code-owned reproducibility and execution metadata for one research run."""

    pipeline_version: Literal["1.2"]
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
        "model_completed",
    ]
    mlflow_run_id: str | None = None


class FundingOpportunityResearchBundle(ResearchModel):
    """Canonical locally reviewable envelope emitted by the pipeline."""

    schema_version: Literal["1.2"]
    run_id: str
    run_metadata: ResearchRunMetadata
    request: FundingOpportunityResearchRequest
    opportunity: FundingOpportunityResearchDraft
    sources: list[SourceDocumentDraft] = Field(default_factory=list)
    evidence: list[FieldEvidence] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    conflicts: list[ResearchConflict] = Field(default_factory=list)
    agent_trace: list[AgentTurn] = Field(default_factory=list)
    review: ReviewState
