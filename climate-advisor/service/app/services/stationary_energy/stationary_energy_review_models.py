"""Shared Stationary Energy review request and response models."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.stationary_energy_drafts import ReviewDecisionResponse

MessageParamValue = str | int | float | bool


class StationaryEnergyAgentReviewChoiceInput(BaseModel):
    """User or model-selected source choice for one draft proposal."""

    proposal_id: UUID
    candidate_id: UUID | None = None
    selected_source_id: str | None = None
    action: Literal["accept", "override_source", "leave_draft"] | None = None
    rationale: str | None = None


AgentReviewChoiceAction = Literal[
    "accept",
    "override_source",
    "override_manual",
    "leave_draft",
    "rollback_staged",
]


class StationaryEnergyAgentReviewChoice(BaseModel):
    """Resolved and validated review choice ready for staging or display."""

    proposal_id: UUID
    action: AgentReviewChoiceAction
    selected_source_id: str | None = None
    selected_candidate_id: UUID | None = None
    source_label: str | None = None
    target_label: str
    rationale: str | None = None


class StationaryEnergyAgentReviewBlockedChoice(BaseModel):
    """Choice that cannot be staged plus the valid alternatives."""

    proposal_id: UUID | None = None
    reason: str
    available_options: list[dict[str, object]] = Field(default_factory=list)


class StationaryEnergyAgentReviewToolResult(BaseModel):
    """Tool response for staged selections and save outcomes."""

    success: bool
    action: str
    ui_event: Literal["stationary_energy_review_state_changed"] | None = (
        "stationary_energy_review_state_changed"
    )
    draft_run_id: UUID
    selected_choices: list[StationaryEnergyAgentReviewChoice] = Field(
        default_factory=list
    )
    skipped_choices: list[StationaryEnergyAgentReviewBlockedChoice] = Field(
        default_factory=list
    )
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = Field(
        default_factory=list
    )
    pending_required_count: int = 0
    message_key: str | None = None
    message_params: dict[str, MessageParamValue] = Field(default_factory=dict)
    saved_decisions: list[ReviewDecisionResponse] = Field(default_factory=list)


class StationaryEnergyBulkReviewConfirmationToolResult(BaseModel):
    """Tool response that asks the UI to confirm bulk review choices."""

    success: bool
    action: str = "stationary_energy_request_bulk_review_confirmation"
    ui_event: Literal["stationary_energy_review_bulk_confirmation_requested"] = (
        "stationary_energy_review_bulk_confirmation_requested"
    )
    draft_run_id: UUID
    pending_choices: list[StationaryEnergyAgentReviewChoice] = Field(
        default_factory=list
    )
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = Field(
        default_factory=list
    )
    pending_required_count: int = 0
    message_key: str | None = None
    message_params: dict[str, MessageParamValue] = Field(default_factory=dict)


class StationaryEnergyStagedReviewUpdateConfirmationToolResult(BaseModel):
    """Tool response that asks the UI to confirm staged-review updates."""

    success: bool
    action: str
    ui_event: Literal[
        "stationary_energy_review_change_confirmation_requested",
        "stationary_energy_review_rollback_confirmation_requested",
    ]
    draft_run_id: UUID
    pending_choices: list[StationaryEnergyAgentReviewChoice] = Field(
        default_factory=list
    )
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = Field(
        default_factory=list
    )
    pending_required_count: int = 0
    message_key: str | None = None
    message_params: dict[str, MessageParamValue] = Field(default_factory=dict)
