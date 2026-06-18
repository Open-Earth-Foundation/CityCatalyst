"""Localized UI-message helpers for Stationary Energy review tools."""

from __future__ import annotations

from typing import Any

from app.services.stationary_energy.stationary_energy_review_models import (
    MessageParamValue,
    StationaryEnergyAgentReviewBlockedChoice,
    StationaryEnergyAgentReviewChoice,
)


def message_payload(
    message_key: str,
    **message_params: MessageParamValue,
) -> dict[str, Any]:
    """Return language-neutral UI message metadata for CityCatalyst."""
    return {
        "message_key": message_key,
        "message_params": message_params,
    }


def stage_message_payload(
    selected_choices: list[StationaryEnergyAgentReviewChoice],
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
    pending_required_count: int,
) -> dict[str, Any]:
    """Build localized-message metadata after staging choices."""
    # Select a stable localization key based on full, partial, or blocked success.
    if selected_choices and not blocked_choices:
        return message_payload(
            "tool-message-stage-success",
            selected=len(selected_choices),
            pending=pending_required_count,
        )
    if selected_choices:
        return message_payload(
            "tool-message-stage-partial",
            selected=len(selected_choices),
            blocked=len(blocked_choices),
            pending=pending_required_count,
        )
    if blocked_choices:
        return message_payload(
            "tool-message-stage-blocked",
            blocked=len(blocked_choices),
        )
    return message_payload("tool-message-stage-none")


def bulk_confirmation_message_payload(
    selected_choices: list[StationaryEnergyAgentReviewChoice],
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
    pending_required_count: int,
) -> dict[str, Any]:
    """Build localized-message metadata for bulk confirmation previews."""
    if selected_choices and not blocked_choices:
        return message_payload(
            "tool-message-bulk-confirm-success",
            selected=len(selected_choices),
            pending=pending_required_count,
        )
    if selected_choices:
        return message_payload(
            "tool-message-bulk-confirm-partial",
            selected=len(selected_choices),
            blocked=len(blocked_choices),
        )
    if blocked_choices:
        return message_payload(
            "tool-message-bulk-confirm-blocked",
            blocked=len(blocked_choices),
        )
    return message_payload("tool-message-bulk-confirm-none")


def staged_change_confirmation_message_payload(
    selected_choices: list[StationaryEnergyAgentReviewChoice],
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
) -> dict[str, Any]:
    """Build localized-message metadata for staged-source change previews."""
    if selected_choices and not blocked_choices:
        return message_payload(
            "tool-message-staged-change-confirm-success",
            selected=len(selected_choices),
        )
    if selected_choices:
        return message_payload(
            "tool-message-staged-change-confirm-partial",
            selected=len(selected_choices),
            blocked=len(blocked_choices),
        )
    if blocked_choices:
        return message_payload(
            "tool-message-staged-change-confirm-blocked",
            blocked=len(blocked_choices),
        )
    return message_payload("tool-message-staged-change-confirm-none")


def staged_rollback_confirmation_message_payload(
    selected_choices: list[StationaryEnergyAgentReviewChoice],
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
    pending_required_count: int,
) -> dict[str, Any]:
    """Build localized-message metadata for staged-source rollback previews."""
    if selected_choices and not blocked_choices:
        return message_payload(
            "tool-message-staged-rollback-confirm-success",
            selected=len(selected_choices),
            pending=pending_required_count,
        )
    if selected_choices:
        return message_payload(
            "tool-message-staged-rollback-confirm-partial",
            selected=len(selected_choices),
            blocked=len(blocked_choices),
        )
    if blocked_choices:
        return message_payload(
            "tool-message-staged-rollback-confirm-blocked",
            blocked=len(blocked_choices),
        )
    return message_payload("tool-message-staged-rollback-confirm-none")


def staged_rollback_result_message_payload(
    selected_choices: list[StationaryEnergyAgentReviewChoice],
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
    pending_required_count: int,
) -> dict[str, Any]:
    """Build localized-message metadata after rolling back staged choices."""
    # Select a stable localization key based on rollback success shape.
    if selected_choices and not blocked_choices:
        return message_payload(
            "tool-message-staged-rollback-success",
            selected=len(selected_choices),
            pending=pending_required_count,
        )
    if selected_choices:
        return message_payload(
            "tool-message-staged-rollback-partial",
            selected=len(selected_choices),
            blocked=len(blocked_choices),
            pending=pending_required_count,
        )
    if blocked_choices:
        return message_payload(
            "tool-message-staged-rollback-blocked",
            blocked=len(blocked_choices),
        )
    return message_payload("tool-message-staged-rollback-none")
