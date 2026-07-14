"""Stationary Energy review service orchestration."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftRun,
    StationaryEnergyStagedReviewSelection,
)
from app.models.stationary_energy_drafts import ReviewStationaryEnergyDraftRequest
from app.services.citycatalyst_client import CityCatalystClient
from app.services.stationary_energy.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.services.stationary_energy.stationary_energy_draft_review import (
    latest_review_decisions,
    notation_target_id,
)
from app.services.stationary_energy.stationary_energy_draft_auth import (
    extract_bearer_token,
    require_bearer_token,
)
from app.services.stationary_energy.stationary_energy_draft_service import (
    StationaryEnergyDraftService,
)
from app.services.stationary_energy.stationary_energy_review_messages import (
    bulk_confirmation_message_payload,
    message_payload,
    notation_bulk_confirmation_message_payload,
    notation_rollback_result_message_payload,
    notation_stage_message_payload,
    stage_message_payload,
    staged_change_confirmation_message_payload,
    staged_rollback_confirmation_message_payload,
    staged_rollback_result_message_payload,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewBlockedChoice,
    StationaryEnergyAgentReviewChoice,
    StationaryEnergyAgentReviewChoiceInput,
    StationaryEnergyAgentReviewToolResult,
    StationaryEnergyBulkReviewConfirmationToolResult,
    StationaryEnergyNotationKeyChoiceInput,
    StationaryEnergyNotationKeyListToolResult,
    StationaryEnergyStagedReviewUpdateConfirmationToolResult,
)
from app.services.stationary_energy.stationary_energy_review_resolver import (
    StationaryEnergyReviewChoiceResolver,
)

logger = logging.getLogger(__name__)

TERMINAL_DRAFT_STATUSES = {
    "saved",
    "partially_saved",
    "no_changes",
    "failed",
}


class StationaryEnergyAgentReviewService:
    """CA-owned tool backing service for Stationary Energy draft review staging."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        cc_client: CityCatalystClient | None = None,
    ) -> None:
        """Initialize review staging against one database session."""
        self.session = session
        self.repository = StationaryEnergyDraftRepository(session)
        self.cc_client = cc_client or CityCatalystClient()

    async def list_review_options(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Return selected and pending source-review choices for a draft."""
        # Load the authoritative CA-owned draft review state.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)

        # Split active staged choices from proposals that still need review.
        selected = [
            resolver.choice_from_staged(selection)
            for selection in staged
            if selection.status == "active"
        ]
        pending = resolver.pending_required_proposals(staged=staged)
        result = StationaryEnergyAgentReviewToolResult(
            success=True,
            action="stationary_energy_list_review_options",
            ui_event=None,
            draft_run_id=draft_run_id,
            selected_choices=selected,
            blocked_choices=[
                StationaryEnergyAgentReviewBlockedChoice(
                    proposal_id=proposal.proposal_id,
                    reason="pending",
                    available_options=resolver.available_options(proposal),
                )
                for proposal in pending
            ],
            pending_required_count=len(pending),
            **message_payload(
                "tool-message-review-options-loaded",
                selected=len(selected),
                pending=len(pending),
            ),
        )
        logger.info(
            "Loaded Stationary Energy review options draft_run_id=%s selected=%s pending=%s",
            draft_run_id,
            len(selected),
            len(pending),
        )
        return result

    async def list_notation_keys(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        authorization: str | None,
    ) -> StationaryEnergyNotationKeyListToolResult:
        """Return eligible Stationary Energy notation-key targets."""
        token = require_bearer_token(extract_bearer_token(authorization))
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        targets_payload = await self._load_notation_targets_payload(
            draft_run=draft_run,
            user_id=user_id,
            token=token,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        targets = resolver.notation_targets(targets_payload, staged=staged)
        allowed_notation_keys = targets_payload.get("allowed_notation_keys")
        result = StationaryEnergyNotationKeyListToolResult(
            success=True,
            draft_run_id=draft_run_id,
            allowed_notation_keys=(
                allowed_notation_keys
                if isinstance(allowed_notation_keys, list)
                else []
            ),
            targets=targets,
            **message_payload(
                "tool-message-notation-options-loaded",
                targets=len(targets),
            ),
        )
        logger.info(
            "Loaded Stationary Energy notation-key targets draft_run_id=%s targets=%s",
            draft_run_id,
            len(targets),
        )
        return result

    async def stage_notation_key(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        choice: StationaryEnergyNotationKeyChoiceInput,
        authorization: str | None,
        tool_call_id: str | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Stage one notation-key choice for the active review draft."""
        return await self.apply_notation_choices(
            draft_run_id=draft_run_id,
            user_id=user_id,
            choices=[choice],
            authorization=authorization,
            tool_call_id=tool_call_id,
            action_name="stationary_energy_stage_notation_key",
        )

    async def preview_notation_choices(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        choices: list[StationaryEnergyNotationKeyChoiceInput],
        authorization: str | None,
    ) -> StationaryEnergyBulkReviewConfirmationToolResult:
        """Validate notation-key choices without staging them."""
        token = require_bearer_token(extract_bearer_token(authorization))
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        targets_payload = await self._load_notation_targets_payload(
            draft_run=draft_run,
            user_id=user_id,
            token=token,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        selected_choices, blocked_choices = resolver.resolve_notation_choice_inputs(
            choices,
            targets_payload,
        )
        pending = resolver.pending_required_proposals(
            staged=staged,
            extra_resolved_ids={choice.proposal_id for choice in selected_choices},
        )
        result = StationaryEnergyBulkReviewConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_request_bulk_notation_confirmation",
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            **notation_bulk_confirmation_message_payload(
                selected_choices,
                blocked_choices,
            ),
        )
        logger.info(
            "Prepared Stationary Energy notation-key preview draft_run_id=%s selected=%s blocked=%s",
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
        )
        return result

    async def apply_notation_choices(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        choices: list[StationaryEnergyNotationKeyChoiceInput],
        authorization: str | None,
        tool_call_id: str | None = None,
        action_name: str = "stationary_energy_apply_bulk_notation_choices",
    ) -> StationaryEnergyAgentReviewToolResult:
        """Stage validated notation-key choices in CA-owned review state."""
        token = require_bearer_token(extract_bearer_token(authorization))
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        targets_payload = await self._load_notation_targets_payload(
            draft_run=draft_run,
            user_id=user_id,
            token=token,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        selected_choices, blocked_choices = resolver.resolve_notation_choice_inputs(
            choices,
            targets_payload,
        )
        selections = self._selections_from_choices(
            draft_run=draft_run,
            user_id=user_id,
            selected_choices=selected_choices,
            tool_call_id=tool_call_id,
        )
        if selections:
            await self.repository.upsert_staged_review_selections(selections)
            await self._mark_review_step(draft_run)

        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending = resolver.pending_required_proposals(staged=staged)
        result = StationaryEnergyAgentReviewToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action=action_name,
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            **notation_stage_message_payload(selected_choices, blocked_choices),
        )
        logger.info(
            "Staged Stationary Energy notation-key choices action=%s draft_run_id=%s selected=%s blocked=%s",
            action_name,
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
        )
        return result

    async def rollback_staged_notation_keys(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: list[UUID] | None = None,
        target_ids: list[str] | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Remove one or more active staged notation-key choices."""
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        resolved_proposal_ids = self._notation_rollback_proposal_ids(
            draft_run=draft_run,
            proposal_ids=proposal_ids,
            target_ids=target_ids,
        )
        targeted, blocked_choices = resolver.target_active_staged_notation_selections(
            staged=staged,
            proposal_ids=resolved_proposal_ids,
        )
        selected_choices = [
            resolver.rollback_choice_from_staged(selection)
            for selection in targeted
        ]
        if targeted:
            await self.repository.mark_staged_review_selections_rolled_back(
                draft_run_id=draft_run_id,
                user_id=user_id,
                proposal_ids={selection.proposal_id for selection in targeted},
            )
            await self._mark_review_step(draft_run)

        staged_after = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending = resolver.pending_required_proposals(staged=staged_after)
        result = StationaryEnergyAgentReviewToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_rollback_staged_notation_keys",
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            **notation_rollback_result_message_payload(
                selected_choices,
                blocked_choices,
            ),
        )
        logger.info(
            "Rolled back Stationary Energy staged notation keys draft_run_id=%s selected=%s blocked=%s",
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
        )
        return result

    async def accept_one(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        choice: StationaryEnergyAgentReviewChoiceInput,
        tool_call_id: str | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Stage one validated source-review choice."""
        return await self.accept_multiple(
            draft_run_id=draft_run_id,
            user_id=user_id,
            choices=[choice],
            tool_call_id=tool_call_id,
            action_name="stationary_energy_accept_one",
        )

    async def accept_multiple(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        choices: list[StationaryEnergyAgentReviewChoiceInput],
        tool_call_id: str | None = None,
        action_name: str = "stationary_energy_accept_multiple",
    ) -> StationaryEnergyAgentReviewToolResult:
        """Stage several validated source-review choices in one transaction."""
        # Validate every requested choice against the persisted draft snapshot.
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        selected_choices, blocked_choices = resolver.resolve_choice_inputs(choices)

        # Persist only resolved choices; blocked choices are reported, not applied.
        selections = self._selections_from_choices(
            draft_run=draft_run,
            user_id=user_id,
            selected_choices=selected_choices,
            tool_call_id=tool_call_id,
        )
        if selections:
            await self.repository.upsert_staged_review_selections(selections)
            await self._mark_review_step(draft_run)

        # Re-read staged rows so pending counts reflect the committed in-memory state.
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending = resolver.pending_required_proposals(staged=staged)
        result = StationaryEnergyAgentReviewToolResult(
            success=not blocked_choices,
            action=action_name,
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            **stage_message_payload(
                selected_choices,
                blocked_choices,
                len(pending),
            ),
        )
        logger.info(
            "Staged Stationary Energy review choices action=%s draft_run_id=%s selected=%s blocked=%s pending=%s",
            action_name,
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
            len(pending),
        )
        return result

    async def accept_all_recommended(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        rationale: str | None = None,
        tool_call_id: str | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Stage recommended choices for unresolved source-backed proposals."""
        # Load current review state so only unresolved recommendations are staged.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        choices = [
            StationaryEnergyAgentReviewChoiceInput(
                proposal_id=proposal.proposal_id,
                action="accept",
                rationale=rationale,
            )
            for proposal in resolver.pending_required_proposals(staged=staged)
            if proposal.recommended_candidate_id is not None
        ]
        return await self.accept_multiple(
            draft_run_id=draft_run_id,
            user_id=user_id,
            choices=choices,
            tool_call_id=tool_call_id,
            action_name="stationary_energy_accept_all_recommended",
        )

    async def preview_multiple(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        choices: list[StationaryEnergyAgentReviewChoiceInput],
        action_name: str = "stationary_energy_request_bulk_review_confirmation",
    ) -> StationaryEnergyBulkReviewConfirmationToolResult:
        """Validate several choices without persisting them."""
        # Resolve requested choices without mutating the staged selection table.
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        selected_choices, blocked_choices = resolver.resolve_choice_inputs(choices)

        # Count what would remain if the previewed choices were confirmed.
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending_after_preview = resolver.pending_required_proposals(
            staged=staged,
            extra_resolved_ids={choice.proposal_id for choice in selected_choices},
        )
        result = StationaryEnergyBulkReviewConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action=action_name,
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending_after_preview),
            **bulk_confirmation_message_payload(
                selected_choices,
                blocked_choices,
                len(pending_after_preview),
            ),
        )
        logger.info(
            "Prepared Stationary Energy review preview action=%s draft_run_id=%s selected=%s blocked=%s pending_after_preview=%s",
            action_name,
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
            len(pending_after_preview),
        )
        return result

    async def preview_all_recommended(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        rationale: str | None = None,
    ) -> StationaryEnergyBulkReviewConfirmationToolResult:
        """Validate the current unresolved recommended choices without staging."""
        # Build the preview from unresolved recommended candidates only.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        choices = [
            StationaryEnergyAgentReviewChoiceInput(
                proposal_id=proposal.proposal_id,
                action="accept",
                rationale=rationale,
            )
            for proposal in resolver.pending_required_proposals(staged=staged)
            if proposal.recommended_candidate_id is not None
        ]
        return await self.preview_multiple(
            draft_run_id=draft_run_id,
            user_id=user_id,
            choices=choices,
            action_name="stationary_energy_request_all_recommended_confirmation",
        )

    async def preview_staged_source_changes(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: list[UUID] | None = None,
    ) -> StationaryEnergyStagedReviewUpdateConfirmationToolResult:
        """Validate automatic replacements for active staged source choices."""
        # Find the exact active staged selections that the user wants to change.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        targeted, blocked_choices = resolver.target_active_staged_selections(
            staged=staged,
            proposal_ids=proposal_ids,
        )

        # Propose the next available source, or an empty row if no alternative exists.
        selected_choices: list[StationaryEnergyAgentReviewChoice] = []
        for selection in targeted:
            resolved = resolver.change_choice_for_staged_selection(selection)
            if isinstance(resolved, StationaryEnergyAgentReviewBlockedChoice):
                blocked_choices.append(resolved)
                continue
            selected_choices.append(resolved)

        # Return a confirmation payload without changing staged review state.
        pending = resolver.pending_required_proposals(staged=staged)
        result = StationaryEnergyStagedReviewUpdateConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_request_staged_source_change_confirmation",
            ui_event="stationary_energy_review_change_confirmation_requested",
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            **staged_change_confirmation_message_payload(
                selected_choices,
                blocked_choices,
            ),
        )
        logger.info(
            "Prepared Stationary Energy staged-source change preview draft_run_id=%s selected=%s blocked=%s pending=%s",
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
            len(pending),
        )
        return result

    async def preview_staged_sources_rollback(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: list[UUID] | None = None,
    ) -> StationaryEnergyStagedReviewUpdateConfirmationToolResult:
        """Validate active staged selections that would be rolled back."""
        # Find active staged choices that would be removed by the rollback.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        targeted, blocked_choices = resolver.target_active_staged_selections(
            staged=staged,
            proposal_ids=proposal_ids,
        )
        selected_choices = [
            resolver.rollback_choice_from_staged(selection)
            for selection in targeted
        ]

        # Compute pending count as if the rollback were confirmed.
        staged_after_preview = [
            selection
            for selection in staged
            if selection.proposal_id
            not in {choice.proposal_id for choice in selected_choices}
        ]
        pending_after_preview = resolver.pending_required_proposals(
            staged=staged_after_preview,
        )
        result = StationaryEnergyStagedReviewUpdateConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_request_staged_sources_rollback_confirmation",
            ui_event="stationary_energy_review_rollback_confirmation_requested",
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending_after_preview),
            **staged_rollback_confirmation_message_payload(
                selected_choices,
                blocked_choices,
                len(pending_after_preview),
            ),
        )
        logger.info(
            "Prepared Stationary Energy staged-source rollback preview draft_run_id=%s selected=%s blocked=%s pending_after_preview=%s",
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
            len(pending_after_preview),
        )
        return result

    async def rollback_staged_sources(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: list[UUID] | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Roll back active staged selections after UI confirmation."""
        # Resolve the confirmed rollback targets against active staged rows.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        targeted, blocked_choices = resolver.target_active_staged_selections(
            staged=staged,
            proposal_ids=proposal_ids,
        )
        selected_choices = [
            resolver.rollback_choice_from_staged(selection)
            for selection in targeted
        ]

        # Mutate only the active selections that were confirmed by the UI card.
        if targeted:
            await self.repository.mark_staged_review_selections_rolled_back(
                draft_run_id=draft_run_id,
                user_id=user_id,
                proposal_ids={selection.proposal_id for selection in targeted},
            )
            await self._mark_review_step(draft_run)

        # Recalculate pending review work after rollback.
        staged_after = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending = resolver.pending_required_proposals(staged=staged_after)
        result = StationaryEnergyAgentReviewToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_rollback_staged_sources",
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            **staged_rollback_result_message_payload(
                selected_choices,
                blocked_choices,
                len(pending),
            ),
        )
        logger.info(
            "Rolled back Stationary Energy staged selections draft_run_id=%s selected=%s blocked=%s pending=%s",
            draft_run_id,
            len(selected_choices),
            len(blocked_choices),
            len(pending),
        )
        return result

    async def save_review_draft(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        authorization: str | None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Persist complete staged review choices through the draft service."""
        # Convert active staged selections into the existing durable review contract.
        draft_run, staged = await self._load_draft_with_staged(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        resolver = StationaryEnergyReviewChoiceResolver(draft_run)
        decisions, blockers = resolver.build_complete_decision_inputs(staged=staged)
        if blockers:
            result = StationaryEnergyAgentReviewToolResult(
                success=False,
                action="stationary_energy_save_review_draft",
                draft_run_id=draft_run_id,
                blocked_choices=blockers,
                pending_required_count=len(blockers),
                **message_payload(
                    "tool-message-review-save-blocked",
                    blocked=len(blockers),
                ),
            )
            logger.info(
                "Blocked Stationary Energy review draft save draft_run_id=%s blockers=%s",
                draft_run_id,
                len(blockers),
            )
            return result

        # Save through the draft service so existing review validation stays authoritative.
        draft_service = StationaryEnergyDraftService(self.session)
        response = await draft_service.review_draft(
            draft_run_id=draft_run_id,
            payload=ReviewStationaryEnergyDraftRequest(
                user_id=user_id,
                decisions=decisions,
            ),
            authorization=authorization,
        )

        # Return a tool-facing summary for the rows saved in Clima.
        selected_choices = [
            resolver.choice_from_review_input(decision)
            for decision in decisions
            if decision.action != "leave_draft"
        ]
        result = StationaryEnergyAgentReviewToolResult(
            success=True,
            action="stationary_energy_save_review_draft",
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            pending_required_count=0,
            saved_decisions=response.decisions,
            **message_payload(
                "tool-message-review-save-success",
                selected=len(selected_choices),
            ),
        )
        logger.info(
            "Saved Stationary Energy review draft draft_run_id=%s decisions=%s selected=%s",
            draft_run_id,
            len(response.decisions),
            len(selected_choices),
        )
        return result

    async def inventory_save_confirmation_summary(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> dict[str, int]:
        """Count saved review decisions that are ready for inventory confirmation."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        latest_decisions = latest_review_decisions(draft_run.review_decisions)
        active_staged = {
            selection.proposal_id: selection
            for selection in draft_run.staged_review_selections
            if selection.status == "active"
        }
        ready_actions: dict[UUID, str] = {}
        for decision in latest_decisions.values():
            if decision.commit_status in {"pending_cc_commit", "staged_manual"}:
                ready_actions[decision.proposal_id] = decision.action
        for selection in active_staged.values():
            ready_actions[selection.proposal_id] = selection.action

        notation_count = sum(
            1 for action in ready_actions.values() if action == "set_notation_key"
        )
        return {
            "ready": len(ready_actions),
            "notation": notation_count,
            "source": len(ready_actions) - notation_count,
        }

    async def _load_draft_with_staged(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> tuple[
        StationaryEnergyDraftRun, list[StationaryEnergyStagedReviewSelection]
    ]:
        """Load a mutable draft and its staged selections for the user."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        return draft_run, staged

    async def _mark_review_step(self, draft_run: StationaryEnergyDraftRun) -> None:
        """Mark the draft as being actively reviewed and flush the session."""
        draft_run.workflow_step = "review"
        draft_run.updated_at = datetime.now(timezone.utc)
        await self.session.flush()

    @staticmethod
    def _selections_from_choices(
        *,
        draft_run: StationaryEnergyDraftRun,
        user_id: str,
        selected_choices: list[StationaryEnergyAgentReviewChoice],
        tool_call_id: str | None,
    ) -> list[StationaryEnergyStagedReviewSelection]:
        """Convert resolved choices into staged selection rows."""
        return [
            StationaryEnergyStagedReviewSelection(
                draft_run_id=draft_run.draft_run_id,
                proposal_id=choice.proposal_id,
                user_id=user_id,
                action=choice.action,
                selected_source_id=choice.selected_source_id,
                selected_candidate_id=choice.selected_candidate_id,
                notation_key=choice.notation_key,
                unavailable_reason=choice.unavailable_reason,
                unavailable_explanation=choice.unavailable_explanation,
                rationale=choice.rationale,
                tool_call_id=tool_call_id,
                status="active",
            )
            for choice in selected_choices
        ]

    async def _load_owned_reviewable_draft(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> StationaryEnergyDraftRun:
        """Load a draft and verify user ownership plus mutable status."""
        draft_run = await self.repository.get_draft_run(draft_run_id)
        if draft_run is None:
            raise HTTPException(
                status_code=404, detail="Stationary Energy draft not found"
            )
        if draft_run.user_id != user_id:
            raise HTTPException(
                status_code=403, detail="Draft run does not belong to user"
            )
        if draft_run.status in TERMINAL_DRAFT_STATUSES:
            raise HTTPException(
                status_code=409,
                detail=f"Draft status {draft_run.status} cannot be modified by review tools",
            )
        if draft_run.status not in {"ready", "reviewed"}:
            raise HTTPException(
                status_code=409,
                detail="Stationary Energy draft generation is not complete",
            )
        return draft_run

    async def _load_notation_targets_payload(
        self,
        *,
        draft_run: StationaryEnergyDraftRun,
        user_id: str,
        token: str,
    ) -> dict[str, object]:
        """Load CC-authoritative notation-key targets for the draft scope."""
        return await self.cc_client.list_stationary_energy_notation_keys(
            request_payload={
                "draft_run_id": str(draft_run.draft_run_id),
                "user_id": user_id,
                "city_id": draft_run.city_id,
                "inventory_id": draft_run.inventory_id,
                "sector_code": "stationary_energy",
            },
            token=token,
        )

    @staticmethod
    def _notation_rollback_proposal_ids(
        *,
        draft_run: StationaryEnergyDraftRun,
        proposal_ids: list[UUID] | None,
        target_ids: list[str] | None,
    ) -> list[UUID] | None:
        """Resolve optional notation rollback target ids into proposal ids."""
        if proposal_ids is None and target_ids is None:
            return None

        resolved: list[UUID] = []
        seen: set[UUID] = set()
        for proposal_id in proposal_ids or []:
            if proposal_id not in seen:
                seen.add(proposal_id)
                resolved.append(proposal_id)

        if target_ids:
            target_set = {target_id for target_id in target_ids if target_id}
            for proposal in draft_run.proposals:
                target_id = notation_target_id(proposal.target_ref or {})
                if target_id in target_set and proposal.proposal_id not in seen:
                    seen.add(proposal.proposal_id)
                    resolved.append(proposal.proposal_id)

        return resolved
