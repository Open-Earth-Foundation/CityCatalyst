from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class StationaryEnergyLLMProposal(BaseModel):
    """Typed proposal item returned by the Stationary Energy draft prompt."""

    target_ref: dict[str, Any] = Field(default_factory=dict)
    current_value: dict[str, Any] | None = None
    recommended_candidate_id: UUID | None = None
    recommended_datasource_id: str | None = None
    alternative_candidate_ids: list[UUID] = Field(default_factory=list)
    proposed_value: dict[str, Any] | None = None
    rationale: str
    status: Literal["ready", "needs_review", "gap", "conflict"]
    confidence_score: Decimal | None = Field(default=None, ge=0, le=1)


class StationaryEnergyLLMResponse(BaseModel):
    """Top-level structured LLM response for Stationary Energy proposals."""

    proposals: list[StationaryEnergyLLMProposal] = Field(default_factory=list)


@dataclass
class StationaryEnergyLLMProposalResult:
    """Normalized LLM proposal payload plus trace metadata for persistence."""

    proposals: list[dict[str, Any]]
    trace: dict[str, Any]
