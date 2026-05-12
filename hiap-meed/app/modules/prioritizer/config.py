"""Configuration and validation for prioritization scoring."""

from __future__ import annotations

import logging
import os
from math import isclose
from typing import Mapping


logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS: dict[str, float] = {
    "impact": 0.55,
    "alignment": 0.22,
    "feasibility": 0.23,
}

REQUIRED_WEIGHT_KEYS: set[str] = set(DEFAULT_WEIGHTS.keys())
DEFAULT_TOP_N = 20
# Impact scoring knobs
IMPACT_TEXT_TO_MULTIPLIER: dict[str, float] = {
    "very low": 0.2,
    "low": 0.4,
    "medium": 0.6,
    "high": 0.8,
    "very high": 1.0,
}

IMPACT_DEFAULT_TIMELINE_SCORE = 0.5

IMPACT_TIMELINE_TO_SCORE: dict[str, float] = {
    "<5 years": 1.0,
    "5-10 years": 0.5,
    ">10 years": 0.0,
}
IMPACT_WEIGHT_REDUCTION_SHARE = 0.80
IMPACT_WEIGHT_TIMELINE = 0.20

# Alignment scoring knobs
ALIGNMENT_WEIGHT_POLICY = 0.75
ALIGNMENT_WEIGHT_SECTOR = 0.15
ALIGNMENT_WEIGHT_OTHER = 0.05
ALIGNMENT_WEIGHT_TIMEFRAME = 0.05

# Feasibility scoring knobs
FEASIBILITY_WEIGHT_LEGAL = 0.50
FEASIBILITY_WEIGHT_SOCIO = 0.50


def validate_weights(weights: Mapping[str, float] | None) -> dict[str, float]:
    """
    Validate scoring weights.

    Inputs:
    - `weights`: Optional override map for impact/alignment/feasibility.

    Returns:
    - Validated weights keyed by required dimensions.

    Raises:
    - ValueError when keys are missing/unknown, values are negative, or sum is not 1.0.
    """

    resolved: dict[str, float] = dict(DEFAULT_WEIGHTS)
    if weights:
        resolved.update(weights)

    missing = REQUIRED_WEIGHT_KEYS - set(resolved.keys())
    unknown = set(resolved.keys()) - REQUIRED_WEIGHT_KEYS

    if missing:
        raise ValueError(f"Missing weight keys: {sorted(missing)}")
    if unknown:
        raise ValueError(f"Unknown weight keys: {sorted(unknown)}")

    for key, value in resolved.items():
        if value < 0:
            raise ValueError(f"Weight `{key}` must be >= 0")

    total = sum(resolved.values())
    if total <= 0:
        raise ValueError("Weight sum must be greater than zero")

    if not isclose(total, 1.0, rel_tol=1e-9, abs_tol=1e-9):
        logger.error("Invalid weight sum=%s. Expected exactly 1.0", total)
        raise ValueError(f"Weight sum must be 1.0, got {total}")

    return resolved


def validate_block_component_weights() -> None:
    """Validate all block-internal component weights for 0..1 bounds and sum-to-1."""
    block_weights: dict[str, dict[str, float]] = {
        "impact": {
            "IMPACT_WEIGHT_REDUCTION_SHARE": IMPACT_WEIGHT_REDUCTION_SHARE,
            "IMPACT_WEIGHT_TIMELINE": IMPACT_WEIGHT_TIMELINE,
        },
        "alignment": {
            "ALIGNMENT_WEIGHT_POLICY": ALIGNMENT_WEIGHT_POLICY,
            "ALIGNMENT_WEIGHT_SECTOR": ALIGNMENT_WEIGHT_SECTOR,
            "ALIGNMENT_WEIGHT_OTHER": ALIGNMENT_WEIGHT_OTHER,
            "ALIGNMENT_WEIGHT_TIMEFRAME": ALIGNMENT_WEIGHT_TIMEFRAME,
        },
        "feasibility": {
            "FEASIBILITY_WEIGHT_LEGAL": FEASIBILITY_WEIGHT_LEGAL,
            "FEASIBILITY_WEIGHT_SOCIO": FEASIBILITY_WEIGHT_SOCIO,
        },
    }
    for block_name, weights in block_weights.items():
        for weight_name, value in weights.items():
            if value < 0.0 or value > 1.0:
                raise ValueError(
                    f"{weight_name} for `{block_name}` must be within [0, 1], got {value}"
                )
        total = sum(weights.values())
        if not isclose(total, 1.0, rel_tol=1e-9, abs_tol=1e-9):
            raise ValueError(
                f"Internal `{block_name}` weights must sum to 1.0, got {total}"
            )


def _parse_top_n(value: str, *, source_label: str) -> int:
    """Parse and validate a positive integer top_n setting."""
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"{source_label} must be an integer, got `{value}`") from error
    if parsed <= 0:
        raise ValueError(f"{source_label} must be > 0, got {parsed}")
    return parsed


def get_default_top_n() -> int:
    """
    Return configured default top_n for prioritization output size.

    Reads `HIAP_MEED_TOP_N` from environment and defaults to 20 when unset.
    """
    raw_value = os.getenv("HIAP_MEED_TOP_N")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_TOP_N
    return _parse_top_n(raw_value.strip(), source_label="HIAP_MEED_TOP_N")


def resolve_top_n(top_n_override: int | None) -> int:
    """Resolve effective top_n from optional request override and env default."""
    if top_n_override is not None:
        if top_n_override <= 0:
            raise ValueError(f"topN must be > 0, got {top_n_override}")
        return top_n_override
    return get_default_top_n()


def normalize_impact_text_label(value: str) -> str:
    """Normalize impact band labels for dictionary lookups."""
    return " ".join(value.strip().lower().replace("_", " ").split())


def resolve_impact_text_multiplier(impact_text: str) -> float:
    """Resolve configured multiplier for a mitigation impact text label."""
    normalized = normalize_impact_text_label(impact_text)
    if normalized not in IMPACT_TEXT_TO_MULTIPLIER:
        raise ValueError(
            "Unknown mitigation impact_text value "
            f"`{impact_text}` (normalized: `{normalized}`)"
        )
    return IMPACT_TEXT_TO_MULTIPLIER[normalized]


def get_alignment_other_preference_mapping_model() -> str | None:
    """Return configured model name for alignment other-preference mapping."""
    raw_value = os.getenv("HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL")
    if raw_value is None or not raw_value.strip():
        return None
    return raw_value.strip()


def parse_bool_env(value: str | None, *, default: bool) -> bool:
    """Parse common env-var boolean encodings with a fallback default."""
    if value is None:
        return default
    normalized = value.strip().lower()
    if not normalized:
        return default
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def is_explanations_enabled() -> bool:
    """Return global feature switch for LLM explanation generation."""
    raw_value = os.getenv("HIAP_MEED_EXPLANATIONS_ENABLED")
    return parse_bool_env(raw_value, default=True)


def get_explanations_model() -> str | None:
    """Return configured explanation model name, if set."""
    value = os.getenv("HIAP_MEED_EXPLANATIONS_MODEL")
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def get_explanation_translations_model() -> str | None:
    """Return configured translation model name, if set."""
    value = os.getenv("HIAP_MEED_EXPLANATION_TRANSLATIONS_MODEL")
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def is_free_text_exclusion_resolution_enabled() -> bool:
    """Return feature switch for preview-time LLM exclusion resolution."""
    raw_value = os.getenv("HIAP_MEED_FREE_TEXT_EXCLUSIONS_ENABLED")
    return parse_bool_env(raw_value, default=False)


def get_free_text_exclusion_model() -> str | None:
    """Return configured model name for free-text exclusion resolution."""
    value = os.getenv("HIAP_MEED_FREE_TEXT_EXCLUSIONS_MODEL")
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized
