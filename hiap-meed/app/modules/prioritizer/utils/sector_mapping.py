"""Canonical sector mapping helpers for prioritizer actions."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action

SECTOR_NUMBER_TO_TAG: dict[str, str] = {
    "I": "stationary_energy",
    "II": "transportation",
    "III": "waste",
    "IV": "ippu",
    "V": "afolu",
}

ALLOWED_SECTOR_TAGS: set[str] = set(SECTOR_NUMBER_TO_TAG.values())


def normalize_sector_tag(value: str) -> str | None:
    """Return the sector tag only when the input is already one canonical value."""
    normalized = value.strip()
    if not normalized:
        return None
    return normalized if normalized in ALLOWED_SECTOR_TAGS else None


def normalize_sector_tags(values: list[str]) -> set[str]:
    """Keep only exact canonical sector tags from a list of input values."""
    sector_tags: set[str] = set()
    for value in values:
        sector_tag = normalize_sector_tag(value)
        if sector_tag is not None:
            sector_tags.add(sector_tag)
    return sector_tags


def resolve_action_sector_tags(action: Action) -> set[str]:
    """Resolve all canonical sector tags visible in an action's metadata."""
    sector_tags: set[str] = set()

    # Use the GPC emissions sector number returned by the action pathways API.
    sector_number = str(action.emissions.get("sector_number", "")).strip().upper()
    if sector_number in SECTOR_NUMBER_TO_TAG:
        sector_tags.add(SECTOR_NUMBER_TO_TAG[sector_number])

    return sector_tags
