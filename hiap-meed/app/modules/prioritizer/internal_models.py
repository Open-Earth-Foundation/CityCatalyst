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

    comuna_name: str
    locode: str = Field(min_length=1)
    country_code: str | None = None
    region_name: str
    comuna_code: str
    region_code: str
    population_size: int | None = None
    population_density: float | None = None
    area: float | None = None
    comuna: str | None = None
    city_context: list[dict[str, Any]] = Field(default_factory=list)
    as_of: datetime | None = None
    source: str | None = None
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
    activity_type_description: str | None = None
    description: str | None = None
    action_category: str | None = None
    action_subcategory: str | None = None
    investment_cost: str | None = None
    implementation_timeline: str | None = None
    biome: str | None = None
    emissions: dict[str, Any] = Field(default_factory=dict)
    co_benefits: dict[str, dict[str, Any]] = Field(default_factory=dict)
    socioeconomic_indicators: list[dict[str, Any]] = Field(default_factory=list)
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


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


class LegalRequirementRecord(BaseModel):
    """Internal legal requirement contract shared across scoring blocks."""

    signal_code: str
    signal_name: str
    operator: str
    required_value: str | None = None
    legal_signal_value: str | None = None
    strength: str
    alignment_status: str
    location_scope: str | None = None
    location_name: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    evidence_count: int = 0


class ScoredAction(BaseModel):
    """Action scores after weighted aggregation and ranking."""

    action: Action
    impact_score: float
    alignment_score: float
    feasibility_score: float
    final_score: float
    rank: int
    evidence: dict[str, object] = Field(default_factory=dict)

