"""Parameters a region must provide to run CCC v1.

Scaffold note: no approved methodology exists yet. The weights a region
provides are placeholders to exercise the scoring kernel, not methodology.
"""

from pydantic import BaseModel, Field, field_validator

from app.shared.scoring.weights import validate_weights

PILLARS = ("impact", "alignment", "feasibility")


class MethodologyConfig(BaseModel):
    """Region-provided configuration for one CCC v1 run."""

    weights: dict[str, float] = Field(
        description="Weight per pillar name; must cover every pillar and sum to 1."
    )
    top_n: int | None = Field(
        default=None, ge=1, description="Optional cap on ranked items."
    )

    @field_validator("weights")
    @classmethod
    def _check_weights(cls, weights: dict[str, float]) -> dict[str, float]:
        """Require valid weights covering exactly the CCC v1 pillars."""
        validate_weights(weights)
        if set(weights) != set(PILLARS):
            raise ValueError(f"weights must cover exactly the pillars {list(PILLARS)}")
        return weights
