"""Shared Stationary Energy review request and response models."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.stationary_energy_drafts import ReviewDecisionResponse

MessageParamValue = str | int | float | bool


class StationaryEnergyAgentReviewChoiceInput(BaseModel):
    """User or model-selected source choice for one draft proposal."""

    proposal_id: UUID
    candidate_id: UUID | None = None
    selected_source_id: str | None = None
    action: Literal["accept", "override_source", "leave_draft"] | None = None
    rationale: str | None = None


AllowedStationaryEnergyNotationKey = Literal["NO", "NE", "IE", "C"]


class StationaryEnergyNotationKeyChoiceInput(BaseModel):
    """User or model-selected notation key for one draft proposal."""

    proposal_id: UUID | None = None
    target_id: str | None = None
    notation_key: AllowedStationaryEnergyNotationKey
    unavailable_explanation: str
    rationale: str | None = None

    @model_validator(mode="after")
    def validate_target_reference(self) -> "StationaryEnergyNotationKeyChoiceInput":
        """Require a proposal id or CC notation target id."""
        if self.proposal_id is None and not self.target_id:
            raise ValueError("proposal_id or target_id is required")
        return self


AgentReviewChoiceAction = Literal[
    "accept",
    "override_source",
    "override_manual",
    "set_notation_key",
    "leave_draft",
    "rollback_staged",
]


class StationaryEnergyAgentReviewChoice(BaseModel):
    """Resolved and validated review choice ready for staging or display."""

    proposal_id: UUID
    action: AgentReviewChoiceAction
    selected_source_id: str | None = None
    selected_candidate_id: UUID | None = None
    target_id: str | None = None
    source_label: str | None = None
    source_short_label: str | None = None
    source_meta: str | None = None
    value: str | None = None
    target_label: str
    notation_key: str | None = None
    unavailable_reason: str | None = None
    unavailable_explanation: str | None = None
    rationale: str | None = None


class StationaryEnergyNotationKeyTarget(BaseModel):
    """Notation-key target available to the active Stationary Energy review."""

    proposal_id: UUID | None = None
    target_id: str
    target_label: str
    target_ref: dict[str, object] = Field(default_factory=dict)
    current_notation_key: dict[str, object] | None = None
    staged_choice: StationaryEnergyAgentReviewChoice | None = None
    saved_choice: StationaryEnergyAgentReviewChoice | None = None


class StationaryEnergyNotationKeyListToolResult(BaseModel):
    """Tool response listing notation-key options and eligible targets."""

    success: bool
    action: str = "stationary_energy_list_notation_keys"
    ui_event: None = None
    draft_run_id: UUID
    allowed_notation_keys: list[dict[str, object]] = Field(default_factory=list)
    targets: list[StationaryEnergyNotationKeyTarget] = Field(default_factory=list)
    blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = Field(
        default_factory=list
    )
    message_key: str | None = None
    message_params: dict[str, MessageParamValue] = Field(default_factory=dict)


class StationaryEnergyAgentReviewBlockedChoice(BaseModel):
    """Choice that cannot be staged plus the valid alternatives."""

    proposal_id: UUID | None = None
    target_id: str | None = None
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
