"""Stationary Energy SSE payload helpers."""

from __future__ import annotations

from typing import Any

STATIONARY_ENERGY_UI_EVENTS = frozenset(
    {
        "stationary_energy_review_state_changed",
        "stationary_energy_review_bulk_confirmation_requested",
        "stationary_energy_review_change_confirmation_requested",
        "stationary_energy_review_rollback_confirmation_requested",
        "stationary_energy_inventory_save_confirmation_requested",
    }
)


def build_stationary_energy_tool_result_payload(
    invocation: dict[str, Any],
    parsed_output: dict[str, Any],
) -> dict[str, Any] | None:
    """Return the SSE payload for Stationary Energy UI events."""
    if parsed_output.get("ui_event") not in STATIONARY_ENERGY_UI_EVENTS:
        return None
    return {
        "name": invocation.get("name", "unknown_tool"),
        "status": invocation.get("status"),
        **parsed_output,
    }
