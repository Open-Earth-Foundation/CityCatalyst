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
            "transport_logistics_employment",
            "electricity_access",
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
    action_category: str | None = None
    action_subcategory: str | None = None
    investment_cost: str | None = None
    implementation_timeline: str | None = None
    biome: str | None = None
    mitigation_impact: dict[str, dict[str, Any]] = Field(default_factory=dict)
    impacts: list[dict[str, Any]] = Field(default_factory=list)
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _backfill_impacts(self) -> Action:
        """Flatten `mitigation_impact` object into legacy `impacts` row list."""
        if self.impacts or not self.mitigation_impact:
            return self
        flattened: list[dict[str, Any]] = []
        for impact_type, impact_data in self.mitigation_impact.items():
            if not isinstance(impact_data, dict):
                continue
            flattened.append({"impact_type": impact_type, **impact_data})
        self.impacts = flattened
        return self


class BlockScoreResult(BaseModel):
    """Per-block action scores and optional explainability metadata."""

    score_by_action_id: dict[str, float] = Field(default_factory=dict)
    evidence_by_action_id: dict[str, dict[str, object]] | None = None


class HardFilterResult(BaseModel):
    """Result of hard filtering before scoring blocks run."""

    valid_actions: list[Action] = Field(default_factory=list)
    discarded_excluded: list[Action] = Field(default_factory=list)
    evidence: dict[str, dict[str, object]] = Field(default_factory=dict)


class ScoredAction(BaseModel):
    """Action scores after weighted aggregation and ranking."""

    action: Action
    impact_score: float
    alignment_score: float
    feasibility_score: float
    final_score: float
    rank: int
    evidence: dict[str, object] = Field(default_factory=dict)

