from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FlexibleContract(BaseModel):
    model_config = ConfigDict(extra="allow")


class StoredSourceScope(FlexibleContract):
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


class DraftStatusSourceCandidate(FlexibleContract):
    candidate_id: UUID | None = None
    datasource_id: str
    details_datasource_id: str | None = None
    name: str | None = None
    publisher_name: str | None = None
    dataset_name: str | None = None
    dataset_year: int | None = None
    geography_match: Literal[
        "city",
        "locode",
        "region",
        "country",
        "global",
        "unknown",
    ] = "unknown"
    source_scope: StoredSourceScope = Field(default_factory=StoredSourceScope)
    normalized_rows: list[dict[str, Any]] = Field(default_factory=list)
    applicability_status: Literal["applicable", "removed", "failed"]
    applicability_issues: list[str] = Field(default_factory=list)
    failure_reason: str | None = None


class StationaryEnergyCityContext(FlexibleContract):
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
    inventory_id: str
    year: int | None = None
    inventory_type: str | None = None
    gwp: str | None = None
    total_emissions: Decimal | None = None


class StationaryEnergyTaxonomyRow(FlexibleContract):
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
    activity_data: dict[str, Any] | None = None
    activity_data_source: dict[str, Any] | None = None
    gas_values: list[dict[str, Any]] = Field(default_factory=list)
    data_source: dict[str, Any] | None = None


class StationaryEnergySourceCandidate(FlexibleContract):
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
    user_id: str
    city_id: str
    inventory_id: str
    sector_code: Literal["stationary_energy"] = "stationary_energy"
    locale: str | None = None


class LoadStationaryEnergyContextResponse(FlexibleContract):
    city: StationaryEnergyCityContext
    inventory: StationaryEnergyInventoryContext
    taxonomy: list[StationaryEnergyTaxonomyRow] = Field(default_factory=list)
    current_values: list[StationaryEnergyCurrentValue] = Field(default_factory=list)
    source_candidates: list[StationaryEnergySourceCandidate] = Field(default_factory=list)
    permission_summary: dict[str, Any] = Field(default_factory=dict)
    guidance_context: dict[str, Any] = Field(default_factory=dict)


class DraftProposal(FlexibleContract):
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
    proposal_id: UUID
    action: Literal[
        "accept",
        "override_source",
        "override_manual",
        "leave_draft",
        "set_notation_key",
    ]
    selected_source_id: str | None = None
    manual_value: Decimal | None = None
    manual_unit: str | None = None
    notation_key: str | None = None
    unavailable_reason: str | None = None
    unavailable_explanation: str | None = None
    note: str | None = None


class ReviewDecisionResponse(FlexibleContract):
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
    notation_key: str | None = None
    unavailable_reason: str | None = None
    unavailable_explanation: str | None = None
    note: str | None = None
    commit_status: str
    commit_response: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StagedReviewSelectionResponse(FlexibleContract):
    """API response for an active agent-staged review selection."""

    selection_id: UUID
    draft_run_id: UUID
    proposal_id: UUID
    user_id: str
    action: str
    selected_source_id: str | None = None
    selected_candidate_id: UUID | None = None
    notation_key: str | None = None
    unavailable_reason: str | None = None
    unavailable_explanation: str | None = None
    rationale: str | None = None
    tool_call_id: str | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DraftStalenessResponse(FlexibleContract):
    is_stale: bool = False
    reason: str | None = None
    stored_source_ids: list[str] = Field(default_factory=list)
    current_source_ids: list[str] = Field(default_factory=list)


class StartStationaryEnergyDraftRequest(BaseModel):
    user_id: str
    city_id: str
    inventory_id: str
    thread_id: UUID | None = None
    locale: str | None = None
    context: dict[str, Any] | None = None


class StartStationaryEnergyDraftResponse(BaseModel):
    draft_run_id: UUID
    thread_id: UUID | None = None
    user_id: str
    city_id: str
    inventory_id: str
    sector_code: Literal["stationary_energy"]
    status: Literal["resolving_scope", "loading_context", "generating", "ready", "failed"]
    proposals: list[DraftProposal] = Field(default_factory=list)
    trace_id: str | None = None
    error_summary: dict[str, Any] | None = None


class RetryStationaryEnergyDraftRequest(BaseModel):
    user_id: str
    locale: str | None = None
    context: dict[str, Any] | None = None


class GetStationaryEnergyDraftQuery(BaseModel):
    user_id: str


class StationaryEnergyDraftStatusResponse(BaseModel):
    """Full status response for a Stationary Energy draft run."""

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
    staged_review_selections: list[StagedReviewSelectionResponse] = Field(default_factory=list)
    source_candidates: list[DraftStatusSourceCandidate] = Field(default_factory=list)
    trace_id: str | None = None
    error_summary: dict[str, Any] | None = None
    staleness: DraftStalenessResponse | None = None
    created_at: datetime
    updated_at: datetime


class StationaryEnergyDraftListItemResponse(BaseModel):
    draft_run_id: UUID
    thread_id: UUID | None = None
    status: str
    workflow_step: str | None = None
    reviewable_proposal_count: int = 0
    resolved_review_count: int = 0
    staged_commit_count: int = 0
    created_at: datetime
    updated_at: datetime


class ListStationaryEnergyDraftsResponse(BaseModel):
    drafts: list[StationaryEnergyDraftListItemResponse] = Field(default_factory=list)


class ReviewStationaryEnergyDraftRequest(BaseModel):
    user_id: str
    decisions: list[ReviewDecisionInput] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_proposals(self) -> "ReviewStationaryEnergyDraftRequest":
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
    draft_run_id: UUID
    user_id: str
    status: Literal["reviewed", "partially_committed", "failed"]
    decisions: list[ReviewDecisionResponse]


class SaveStationaryEnergyDraftRequest(BaseModel):
    user_id: str


class SaveStationaryEnergyDraftResponse(BaseModel):
    draft_run_id: UUID
    user_id: str
    status: Literal["saved", "partially_saved", "failed", "no_changes"]
    decisions: list[ReviewDecisionResponse]
