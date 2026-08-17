"""Canonical co-benefit taxonomy shared across prioritizer request handling."""

from __future__ import annotations

from typing import Literal

CoBenefitKey = Literal[
    "air_quality",
    "cost_of_living",
    "habitat",
    "housing",
    "mobility",
    "stakeholder_engagement",
    "water_quality",
]

ALLOWED_CO_BENEFIT_KEYS: tuple[CoBenefitKey, ...] = (
    "air_quality",
    "cost_of_living",
    "habitat",
    "housing",
    "mobility",
    "stakeholder_engagement",
    "water_quality",
)

CO_BENEFIT_DISPLAY_LABELS: dict[str, str] = {
    "air_quality": "air quality",
    "cost_of_living": "cost of living",
    "habitat": "habitat",
    "housing": "housing",
    "mobility": "mobility",
    "stakeholder_engagement": "stakeholder engagement",
    "water_quality": "water quality",
}
