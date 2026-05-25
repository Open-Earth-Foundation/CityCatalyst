"""Internal prioritizer contracts used between pipeline blocks."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class CityData(BaseModel):
    """
    Internal city representation consumed by alignment/feasibility blocks.

    This model is intentionally snake_case and independent from external
    upstream response DTOs.
    """

    city_name: str
    locode: str = Field(min_length=1)
    country_code: str | None = None
    region_name: str
    region_code: str
    population_size: int | None = None
    population_density: float | None = None
    area_km2: float | None = None
    city_context: list[dict[str, Any]] = Field(default_factory=list)
    as_of: datetime | None = None
    source: str | None = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    raw: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _backfill_city_context(cls, values: Any) -> Any:
        """Build a minimal context list from known city indicators if absent."""
        if not isinstance(values, dict):
            return values
        if values.get("city_context"):
            return values

        indicators = (
            "unemployment_rate",
            "renter_share",
            "employment_in_transport_and_logistics",
            "electricity_access_rate",
            "industry_construction_employment",
            "median_household_income",
            "public_transport_share",
            "poverty_rate",
            "home_ownership",
        )
        context_rows: list[dict[str, Any]] = []
        for indicator_name in indicators:
            indicator_value = values.get(indicator_name)
            if isinstance(indicator_value, dict):
                context_rows.append({"attribute_name": indicator_name, **indicator_value})
        if context_rows:
            values["city_context"] = context_rows
        return values


class Action(BaseModel):
    """Internal action representation consumed by scoring blocks."""

    action_id: str = Field(min_length=1)
    action_name: str
    action_type: str | None = None
    description: str | None = None
    intervention_summary: str | None = None
    outcome_summary: str | None = None
    intervention_type: str | None = None
    action_role: str | None = None
    publisher_id: str | None = None
    generation_method: str | None = None
    name_i18n: dict[str, str] = Field(default_factory=dict)
    description_i18n: dict[str, str] = Field(default_factory=dict)
    intervention_summary_i18n: dict[str, str] = Field(default_factory=dict)
    outcome_summary_i18n: dict[str, str] = Field(default_factory=dict)
    investment_cost: str | None = None
    implementation_timeline: str | None = None
    emissions: dict[str, Any] = Field(default_factory=dict)
    co_benefits: dict[str, dict[str, Any]] = Field(default_factory=dict)
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class ActionPathwaysFetchResult(BaseModel):
    """Action pathway rows plus request-scoped fetch metadata."""

    actions: list[Action] = Field(default_factory=list)
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    upstream_meta: dict[str, Any] = Field(default_factory=dict)
    warning: str | None = None


class BlockScoreResult(BaseModel):
    """Per-block action scores and optional explainability metadata."""

    score_by_action_id: dict[str, float] = Field(default_factory=dict)
    evidence_by_action_id: dict[str, dict[str, object]] | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class CityActivityRow(BaseModel):
    """Normalized city activity row retained for future activity-data matching."""

    gpc_reference_number: str = Field(min_length=1)
    sector_subsector_key: str = Field(min_length=3)
    activity_type: str | None = None
    activity_value: float | None = None
    activity_unit: str | None = None
    total_emissions: float | None = None
    total_emissions_unit: str | None = None
    data_source: str | None = None
    notation_key: str | None = None


class CityEmissionsContext(BaseModel):
    """Normalized city emissions inputs used by the Impact block."""

    emissions_by_subsector_key: dict[str, float] = Field(default_factory=dict)
    activity_rows: list[CityActivityRow] = Field(default_factory=list)


class HardFilterResult(BaseModel):
    """Result of hard filtering before scoring blocks run."""

    valid_actions: list[Action] = Field(default_factory=list)
    discarded_excluded: list[Action] = Field(default_factory=list)
    discarded_legal: list[Action] = Field(default_factory=list)
    evidence: dict[str, dict[str, object]] = Field(default_factory=dict)


class LegalAssessmentRecord(BaseModel):
    """Internal flat legal assessment contract shared across scoring blocks."""

    action_id: str = Field(min_length=1)
    country_code: str
    gpc_sector: str | None = None
    verdict_category: str | None = None
    verdict_score: float | None = None
    ownership_category: str | None = None
    ownership_score: float | None = None
    ownership_weight: float | None = None
    ownership_description: str | None = None
    restrictions_category: str | None = None
    restrictions_score: float | None = None
    restrictions_weight: float | None = None
    restrictions_description: str | None = None
    legal_justification: str | None = None
    analysis_date: str | None = None
    generation_method: str | None = None
    legal_references: list[str] = Field(default_factory=list)
    release_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    ownership_description_i18n: dict[str, str] = Field(default_factory=dict)
    restrictions_description_i18n: dict[str, str] = Field(default_factory=dict)
    legal_justification_i18n: dict[str, str] = Field(default_factory=dict)
    raw: dict[str, Any] = Field(default_factory=dict)
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class ActionPolicyScoreRecord(BaseModel):
    """Internal action policy score contract consumed by the Alignment block."""

    action_id: str = Field(min_length=1)
    policy_support_score: float | None = None
    policy_support_category: str | None = None
    best_relevance: str | None = None
    n_findings: int | None = None
    n_docs: int | None = None
    sum_strength: float | None = None
    policy_evidence: list[dict[str, Any]] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class ActionPolicyScoresFetchResult(BaseModel):
    """Action policy score rows plus request-scoped fetch metadata."""

    scores_by_action_id: dict[str, ActionPolicyScoreRecord] = Field(
        default_factory=dict
    )
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    upstream_meta: dict[str, Any] = Field(default_factory=dict)
    warning: str | None = None


class ActionMitigationFeasibilityScoreRecord(BaseModel):
    """Internal mitigation feasibility score contract consumed by Feasibility."""

    action_id: str = Field(min_length=1)
    locode: str
    global_mitigation_option: str | None = None
    action_mapping_strength: str | None = None
    option_family: str | None = None
    action_score: float | None = None
    n_feasibility_dimensions: int | None = None
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    breakdown: dict[str, Any] = Field(default_factory=dict)
    rank_within_city: int | None = None
    raw: dict[str, Any] = Field(default_factory=dict)
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class ActionMitigationFeasibilityScoresFetchResult(BaseModel):
    """Mitigation feasibility score rows plus request-scoped fetch metadata."""

    scores_by_action_id: dict[str, ActionMitigationFeasibilityScoreRecord] = Field(
        default_factory=dict
    )
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    upstream_meta: dict[str, Any] = Field(default_factory=dict)
    warning: str | None = None


class ScoredAction(BaseModel):
    """Action scores after weighted aggregation and ranking."""

    action: Action
    impact_score: float
    alignment_score: float
    feasibility_score: float
    final_score: float
    rank: int
    evidence: dict[str, object] = Field(default_factory=dict)

