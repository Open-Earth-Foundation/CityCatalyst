from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FlexibleContract(BaseModel):
    """Base schema that preserves extra fields from CityCatalyst payloads."""

    model_config = ConfigDict(extra="allow")


class StoredSourceScope(FlexibleContract):
    """Stored source scope identifiers and labels."""

    sector_id: str | None = None
    sector_name: str | None = None
    sector_reference_number: str | None = None
    subsector_id: str | None = None
    subsector_name: str | None = None
    subsector_reference_number: str | None = None
    subcategory_id: str | None = None
    subcategory_name: str | None = None
    subcategory_reference_number: str | None = None
    scope_id: str | None = None
    scope_name: str | None = None


class StoredSourceCandidate(FlexibleContract):
    """Stored source candidate returned in draft status responses."""

    candidate_id: UUID | None = None
    draft_run_id: UUID
    datasource_id: str
    name: str | None = None
    publisher_name: str | None = None
    retrieval_method: str | None = None
    dataset_name: str | None = None
    dataset_year: int | None = None
    url: str | None = None
    geography_match: Literal[
        "city",
        "locode",
        "region",
        "country",
        "global",
        "unknown",
    ] = "unknown"
    source_scope: StoredSourceScope = Field(default_factory=StoredSourceScope)
    source_data: dict[str, Any] | None = None
    normalized_rows: list[dict[str, Any]] = Field(default_factory=list)
    applicability_status: Literal["applicable", "removed", "failed"]
    applicability_issues: list[str] = Field(default_factory=list)
    failure_reason: str | None = None
    quality_score: Decimal | None = None
    confidence_notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StationaryEnergyCityContext(FlexibleContract):
    """City metadata used when generating Stationary Energy drafts."""

    city_id: str
    name: str | None = None
    locode: str | None = None
    country: str | None = None
    country_locode: str | None = None
    region: str | None = None
    region_locode: str | None = None
    area: Decimal | None = None
    population: int | None = None


class StationaryEnergyInventoryContext(FlexibleContract):
    """Inventory metadata used when generating Stationary Energy drafts."""

    inventory_id: str
    year: int | None = None
    inventory_type: str | None = None
    gwp: str | None = None
    total_emissions: Decimal | None = None


class StationaryEnergyTaxonomyRow(FlexibleContract):
    """Stationary Energy taxonomy row for sector targeting."""

    sector_id: str | None = None
    sector_name: str | None = None
    sector_reference_number: str | None = None
    subsector_id: str | None = None
    subsector_name: str | None = None
    subsector_reference_number: str | None = None
    subcategory_id: str | None = None
    subcategory_name: str | None = None
    subcategory_reference_number: str | None = None
    scope_id: str | None = None
    scope_name: str | None = None


class StationaryEnergyCurrentValue(FlexibleContract):
    """Current inventory value for a Stationary Energy target."""

    inventory_value_id: str | None = None
    activity_value_id: str | None = None
    gas_value_id: str | None = None
    datasource_id: str | None = None
    sector_id: str | None = None
    subsector_id: str | None = None
    subcategory_id: str | None = None
    scope_id: str | None = None
    gas: str | None = None
    value: Decimal | None = None
    unit: str | None = None
    emissions_value: Decimal | None = None
    emissions_unit: str | None = None
    data_source: dict[str, Any] | None = None


class StationaryEnergySourceCandidate(FlexibleContract):
    """Candidate external source considered by the draft generator."""

    datasource_id: str
    name: str | None = None
    publisher_name: str | None = None
    retrieval_method: str | None = None
    dataset_name: str | None = None
    dataset_year: int | None = None
    url: str | None = None
    geography_match: Literal[
        "city",
        "locode",
        "region",
        "country",
        "global",
        "unknown",
    ] = "unknown"
    source_scope: StoredSourceScope = Field(default_factory=StoredSourceScope)
    source_data: dict[str, Any] | None = None
    normalized_rows: list[dict[str, Any]] = Field(default_factory=list)
    applicability_status: Literal["applicable", "removed", "failed"] = "applicable"
    applicability_issues: list[str] = Field(default_factory=list)
    failure_reason: str | None = None
    quality_score: Decimal | None = None
    confidence_notes: str | None = None


class LoadStationaryEnergyContextRequest(BaseModel):
    """Request sent to CityCatalyst to load Stationary Energy context."""

    user_id: str
    city_id: str
    inventory_id: str
    sector_code: Literal["stationary_energy"] = "stationary_energy"
    locale: str | None = None


class LoadStationaryEnergyContextResponse(FlexibleContract):
    """CityCatalyst Stationary Energy context response."""

    city: StationaryEnergyCityContext
    inventory: StationaryEnergyInventoryContext
    taxonomy: list[StationaryEnergyTaxonomyRow] = Field(default_factory=list)
    current_values: list[StationaryEnergyCurrentValue] = Field(default_factory=list)
    source_candidates: list[StationaryEnergySourceCandidate] = Field(default_factory=list)
    permission_summary: dict[str, Any] = Field(default_factory=dict)


class DraftProposal(FlexibleContract):
    """Draft proposal returned to the user for review."""

    proposal_id: UUID
    draft_run_id: UUID
    target_ref: dict[str, Any] = Field(default_factory=dict)
    current_value: dict[str, Any] | None = None
    recommended_candidate_id: UUID | None = None
    recommended_datasource_id: str | None = None
    alternative_candidate_ids: list[UUID] = Field(default_factory=list)
    proposed_value: dict[str, Any] | None = None
    rationale: str | None = None
    status: Literal[
        "draft",
        "ready",
        "needs_review",
        "gap",
        "conflict",
        "accepted",
        "overridden",
        "left_draft",
    ] = "draft"
    confidence_score: Decimal | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReviewDecisionInput(BaseModel):
    """User decision for one Stationary Energy draft proposal."""

    proposal_id: UUID
    action: Literal["accept", "override_source", "override_manual", "leave_draft"]
    selected_source_id: str | None = None
    manual_value: Decimal | None = None
    manual_unit: str | None = None
    note: str | None = None


class ReviewDecisionResponse(FlexibleContract):
    """Persisted review decision returned in API responses."""

    decision_id: UUID
    draft_run_id: UUID
    proposal_id: UUID
    decision_version: int
    user_id: str
    action: str
    selected_source_id: str | None = None
    selected_candidate_id: UUID | None = None
    manual_value: Decimal | None = None
    manual_unit: str | None = None
    note: str | None = None
    commit_status: str
    commit_response: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StartStationaryEnergyDraftRequest(BaseModel):
    """Request to start a Stationary Energy draft run."""

    user_id: str
    city_id: str
    inventory_id: str
    thread_id: UUID | None = None
    locale: str | None = None
    context: dict[str, Any] | None = None


class StartStationaryEnergyDraftResponse(BaseModel):
    """Response returned after starting or retrying a draft run."""

    draft_run_id: UUID
    thread_id: UUID | None = None
    user_id: str
    city_id: str
    inventory_id: str
    sector_code: Literal["stationary_energy"]
    status: Literal["resolving_scope", "loading_context", "generating", "ready", "failed"]
    proposals: list[DraftProposal] = Field(default_factory=list)
    trace_id: str | None = None
    llm_trace: dict[str, Any] | None = None
    error_summary: dict[str, Any] | None = None


class RetryStationaryEnergyDraftRequest(BaseModel):
    """Request to retry an existing Stationary Energy draft run."""

    user_id: str
    locale: str | None = None
    context: dict[str, Any] | None = None


class GetStationaryEnergyDraftQuery(BaseModel):
    """Query parameters for fetching a Stationary Energy draft."""

    user_id: str


class StationaryEnergyDraftStatusResponse(BaseModel):
    """Full status snapshot for a Stationary Energy draft run."""

    draft_run_id: UUID
    thread_id: UUID | None = None
    user_id: str
    city_id: str
    inventory_id: str
    sector_code: Literal["stationary_energy"]
    status: str
    workflow_step: str | None = None
    proposals: list[DraftProposal] = Field(default_factory=list)
    review_decisions: list[ReviewDecisionResponse] = Field(default_factory=list)
    source_candidates: list[StoredSourceCandidate] = Field(default_factory=list)
    trace_id: str | None = None
    llm_trace: dict[str, Any] | None = None
    error_summary: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class ReviewStationaryEnergyDraftRequest(BaseModel):
    """Request to review proposals in a Stationary Energy draft run."""

    user_id: str
    decisions: list[ReviewDecisionInput] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_proposals(self) -> "ReviewStationaryEnergyDraftRequest":
        """Ensure each proposal has at most one review decision."""

        seen: set[UUID] = set()
        duplicates: set[str] = set()
        for decision in self.decisions:
            if decision.proposal_id in seen:
                duplicates.add(str(decision.proposal_id))
                continue
            seen.add(decision.proposal_id)
        if duplicates:
            duplicate_ids = ", ".join(sorted(duplicates))
            raise ValueError(
                f"Review decisions must contain at most one entry per proposal_id: {duplicate_ids}"
            )
        return self


class ReviewStationaryEnergyDraftResponse(BaseModel):
    """Response returned after Stationary Energy draft review."""

    draft_run_id: UUID
    user_id: str
    status: Literal["reviewed", "partially_committed", "failed"]
    decisions: list[ReviewDecisionResponse]
