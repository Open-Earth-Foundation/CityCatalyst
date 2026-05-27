"""Helpers for true subsector-level emissions matching."""

from __future__ import annotations


def normalize_gpc_reference_to_subsector_key(gpc_reference_number: str) -> str:
    """Return the canonical `sector.subsector` key from one GPC reference."""
    normalized = gpc_reference_number.strip().upper()
    if not normalized:
        raise ValueError("GPC reference number must not be empty")

    parts = [part.strip() for part in normalized.split(".") if part.strip()]
    if len(parts) < 2:
        raise ValueError(
            "GPC reference number must include at least sector and subsector, "
            f"got `{gpc_reference_number}`"
        )
    return f"{parts[0]}.{parts[1]}"


def resolve_action_subsector_keys(
    *, sector_number: str, subsector_numbers: list[int]
) -> list[str]:
    """Return ordered `sector.subsector` keys for one action emissions entry."""
    normalized_sector = sector_number.strip().upper()
    if not normalized_sector:
        raise ValueError("sector_number must not be empty")
    if not subsector_numbers:
        raise ValueError("subsector_number must contain at least one integer")

    deduplicated_subsectors = list(dict.fromkeys(subsector_numbers))
    return [f"{normalized_sector}.{subsector_number}" for subsector_number in deduplicated_subsectors]
