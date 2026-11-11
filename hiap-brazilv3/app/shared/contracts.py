"""Methodology-agnostic contracts exchanged between pipeline steps.

These mirror the contracts proposed in the CC-720 RFC (`RankableItem`,
`ScoreVector`, `FilterDecision`, `RankingResult`). They carry no methodology
or region assumptions.
"""

from typing import Any

from pydantic import BaseModel, Field


class RankableItem(BaseModel):
    """One thing a methodology ranks (an action, shift, intervention, ...)."""

    id: str = Field(description="Stable item identifier.")
    name: str = Field(description="Human-readable item name.")
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Adapter-owned extra fields; the kernel never reads them.",
    )


class ScoreVector(BaseModel):
    """Named pillar or component scores for one item."""

    scores: dict[str, float] = Field(description="Score per pillar name.")


class FilterDecision(BaseModel):
    """Eligibility decision for one item from a hard filter."""

    item_id: str
    eligible: bool
    reason: str | None = Field(
        default=None, description="Why the item was excluded, when not eligible."
    )


class RankedItem(BaseModel):
    """One item in a ranking."""

    item_id: str
    rank: int = Field(ge=1, description="1-based position in the ranking.")
    final_score: float
    score_vector: ScoreVector


class RankingResult(BaseModel):
    """Output of a methodology pipeline."""

    ranked: list[RankedItem] = Field(default_factory=list)
    excluded: list[FilterDecision] = Field(default_factory=list)
