"""Generic Climate Advisor feature flags.

Feature flags are intentionally simple server-side switches parsed from
``CA_FEATURE_FLAGS`` as a comma-separated list, matching the CityCatalyst flag
style while keeping CA defaults off.
"""

from __future__ import annotations

import os
from enum import Enum


class FeatureFlags(str, Enum):
    """Feature flag names supported by the Climate Advisor service."""

    STATIONARY_ENERGY_AGENTIC = "STATIONARY_ENERGY_AGENTIC"


def parse_feature_flags(raw_flags: str | None) -> list[str]:
    """Parse a comma-separated feature flag string into normalized names."""

    if not raw_flags:
        return []

    clean_flags = raw_flags.strip().strip("\"'")
    return [
        flag.strip().strip("\"'")
        for flag in clean_flags.split(",")
        if flag.strip().strip("\"'")
    ]


def get_feature_flags(raw_flags: str | None = None) -> list[str]:
    """Return configured feature flags from an override or the environment."""

    if raw_flags is None:
        raw_flags = os.getenv("CA_FEATURE_FLAGS", "")
    return parse_feature_flags(raw_flags)


def has_feature_flag(flag: FeatureFlags, raw_flags: str | None = None) -> bool:
    """Return whether a feature flag is enabled."""

    return flag.value in get_feature_flags(raw_flags)
