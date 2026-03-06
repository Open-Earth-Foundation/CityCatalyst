"""
Pydantic models for the MEED prioritizer.

This module intentionally keeps the domain surface small for the initial phase:
- `CityData` from city identity + city context inputs
- `Action` from action catalog + impact rows
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CityData(BaseModel):
    """
    City identity and socio-economic context.

    Inputs:
    - City identity fields from the upstream city endpoint.
    - `city_context` row-like records aligned with `city_context.csv` fields.
    """

    comuna_name: str
    locode: str = Field(min_length=1)
    region_name: str
    comuna_code: str
    region_code: str
    comuna: str | None = None
    city_context: list[dict[str, Any]] = Field(default_factory=list)
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class Action(BaseModel):
    """
    Action catalog record with embedded impact rows.

    Inputs:
    - Action identity and attributes from the upstream actions endpoint.
    - `impacts` row-like records aligned with `actions_mitigation_impact.csv`.
    """

    action_id: str = Field(min_length=1)
    action_name: str
    action_type: str | None = None
    description: str | None = None
    action_category: str | None = None
    action_subcategory: str | None = None
    investment_cost: str | None = None
    implementation_timeline: str | None = None
    biome: str | None = None
    impacts: list[dict[str, Any]] = Field(default_factory=list)
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


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


class PrioritizationRequest(BaseModel):
    """Request payload for the prioritization endpoint."""

    locode: str = Field(min_length=1)
    excluded_action_ids: list[str] = Field(default_factory=list)
    weights_override: dict[str, float] | None = None
    top_n: int | None = Field(default=None, ge=1)


class PrioritizationResponse(BaseModel):
    """Response payload with ordered action IDs and execution metadata."""

    ranked_action_ids: list[str] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)


__all__ = [
    "Action",
    "BlockScoreResult",
    "CityData",
    "HardFilterResult",
    "PrioritizationRequest",
    "PrioritizationResponse",
    "ScoredAction",
]
