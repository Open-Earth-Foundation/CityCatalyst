from __future__ import annotations

from typing import Any, Mapping


_SCOPE_KEY_GROUPS: tuple[tuple[str, ...], ...] = (
    ("sector_id", "sector_reference_number"),
    ("subsector_id", "subsector_reference_number"),
    ("subcategory_id", "subcategory_reference_number"),
    ("scope_id",),
)


def extract_stationary_energy_draft_run_id(*containers: Any) -> str | None:
    for container in containers:
        value = _extract_from_container(container)
        if value:
            return value
    return None


def _extract_from_container(container: Any) -> str | None:
    if not isinstance(container, dict):
        return None

    for key in (
        "stationary_energy_draft_run_id",
        "stationary_energy_draft_id",
        "draft_run_id",
    ):
        value = container.get(key)
        if value:
            return str(value)

    nested = container.get("stationary_energy") or container.get("stationary_energy_draft")
    if isinstance(nested, dict):
        return _extract_from_container(nested)

    return None


def stationary_energy_scope_identity(scope: Mapping[str, Any] | None) -> tuple[str | None, ...]:
    if not scope:
        return tuple(None for _ in _SCOPE_KEY_GROUPS)
    return tuple(_first_non_empty(scope, *keys) for keys in _SCOPE_KEY_GROUPS)


def stationary_energy_scope_matches_target(
    *,
    target_ref: Mapping[str, Any] | None,
    source_scope: Mapping[str, Any] | None,
) -> bool:
    if not target_ref or not source_scope:
        return False

    target_identity = stationary_energy_scope_identity(target_ref)
    source_identity = stationary_energy_scope_identity(source_scope)
    target_sector, target_subsector, target_subcategory, target_scope = target_identity
    source_sector, source_subsector, source_subcategory, source_scope_id = source_identity

    if target_sector and source_sector and target_sector != source_sector:
        return False
    if target_subsector:
        if not source_subsector or target_subsector != source_subsector:
            return False
    if target_subcategory:
        if not source_subcategory or target_subcategory != source_subcategory:
            return False
    if target_scope:
        if not source_scope_id or target_scope != source_scope_id:
            return False

    return any(value is not None for value in target_identity)


def stationary_energy_scope_label(scope: Mapping[str, Any] | None) -> str:
    identity = stationary_energy_scope_identity(scope)
    parts = [value for value in identity if value]
    return " / ".join(parts) if parts else "unscoped target"


def _first_non_empty(scope: Mapping[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = scope.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None
