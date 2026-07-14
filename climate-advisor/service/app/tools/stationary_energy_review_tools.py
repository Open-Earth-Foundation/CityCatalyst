from __future__ import annotations

import json
import logging
from typing import Awaitable, Callable, Dict, Optional, Sequence
from uuid import UUID

from agents import function_tool
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    MessageParamValue,
    StationaryEnergyAgentReviewChoiceInput,
    StationaryEnergyAgentReviewToolResult,
    StationaryEnergyNotationKeyChoiceInput,
)
from app.tools.inventory_context_tools import build_inventory_context_tools

logger = logging.getLogger(__name__)


class StationaryEnergyInventoryConfirmationToolResult(BaseModel):
    """Tool response that asks the UI to confirm inventory writes."""

    success: bool
    action: str = "stationary_energy_request_inventory_save_confirmation"
    ui_event: str = "stationary_energy_inventory_save_confirmation_requested"
    draft_run_id: UUID
    message_key: str | None = None
    message_params: dict[str, MessageParamValue] = Field(default_factory=dict)
    error_code: str | None = None


def build_stationary_energy_review_tools(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    draft_run_id: str | UUID,
    user_id: str,
    token_ref: Dict[str, Optional[str]],
) -> Sequence[object]:
    """Create scoped Stationary Energy review tools for one draft run."""
    draft_uuid = UUID(str(draft_run_id))

    async def _resolve_inventory_scope() -> tuple[str, str]:
        """Resolve the CityCatalyst inventory scope owned by this draft run."""
        # Load the CA-owned draft row so the LLM never supplies scope ids.
        async with session_factory() as session:
            service = StationaryEnergyAgentReviewService(session)
            draft_run = await service.repository.get_draft_run_for_user(
                draft_uuid,
                user_id,
            )
            if draft_run is None:
                raise HTTPException(
                    status_code=404,
                    detail="Stationary Energy draft run not found",
                )
            return draft_run.city_id, draft_run.inventory_id

    async def _run_tool(
        action: str,
        operation: Callable[[StationaryEnergyAgentReviewService], Awaitable[BaseModel]],
    ) -> str:
        """Run a review operation inside a committed database session."""
        try:
            # Execute each tool in a short-lived session so DB writes are atomic.
            async with session_factory() as session:
                result = await operation(StationaryEnergyAgentReviewService(session))
                await session.commit()
                logger.info(
                    "Stationary Energy review tool completed action=%s draft_run_id=%s success=%s",
                    action,
                    draft_uuid,
                    getattr(result, "success", None),
                )
                return result.model_dump_json()
        except HTTPException as exc:
            logger.info(
                "Stationary Energy review tool rejected action=%s draft_run_id=%s status=%s detail=%s",
                action,
                draft_uuid,
                exc.status_code,
                exc.detail,
            )
            return _error_payload(
                action=action,
                draft_run_id=draft_uuid,
                message_key="tool-error-http",
                message_params={"status": exc.status_code},
                error_code=f"http_{exc.status_code}",
            )
        except Exception as exc:
            logger.exception(
                "Stationary Energy review tool failed action=%s draft_run_id=%s",
                action,
                draft_uuid,
            )
            return _error_payload(
                action=action,
                draft_run_id=draft_uuid,
                message_key="tool-error-generic",
                error_code="tool_error",
            )

    @function_tool
    async def stationary_energy_list_review_options() -> str:
        """List source-backed Stationary Energy draft proposals and exact selectable source options.

        Use this before choosing sources when the user asks which Stationary Energy
        decisions remain, asks what sources are available, or gives a short reply
        that needs the currently staged and pending review state. Only choose
        proposal/source ids returned by this tool or present in the authoritative
        Stationary Energy draft context.
        """

        return await _run_tool(
            "stationary_energy_list_review_options",
            lambda service: service.list_review_options(
                draft_run_id=draft_uuid,
                user_id=user_id,
            ),
        )

    @function_tool
    async def stationary_energy_list_notation_keys() -> str:
        """List eligible Stationary Energy notation-key rows and allowed notation keys.

        Use this before setting notation keys. It returns current notation-key
        state plus the exact allowed_notation_keys list. Only choose notation
        keys from that returned list: NO, NE, IE, or C. NA is display-only and
        must not be staged by the agent.
        """

        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action="stationary_energy_list_notation_keys",
                draft_run_id=draft_uuid,
                message_key="tool-error-missing-token",
                error_code="missing_token",
            )

        return await _run_tool(
            "stationary_energy_list_notation_keys",
            lambda service: service.list_notation_keys(
                draft_run_id=draft_uuid,
                user_id=user_id,
                authorization=f"Bearer {token}",
            ),
        )

    @function_tool
    async def stationary_energy_accept_one(
        proposal_id: str,
        candidate_id: Optional[str] = None,
        selected_source_id: Optional[str] = None,
        action: Optional[str] = None,
        rationale: Optional[str] = None,
    ) -> str:
        """Stage one Stationary Energy review choice for the active draft.

        Args:
            proposal_id: Exact proposal id to stage.
            candidate_id: Exact stored candidate id to select. Omit it to choose
                the proposal's recommended candidate.
            selected_source_id: Exact datasource/details id to select if candidate_id
                is not available.
            action: Optional explicit action: accept, override_source, or leave_draft.
            rationale: Short reason for the staged choice, shown in audit/UI output.

        The tool validates that the candidate belongs to the proposal's available
        options. It never invents rows, sources, values, or units.
        """

        # Parse model-supplied identifiers before opening a database transaction.
        try:
            choice = StationaryEnergyAgentReviewChoiceInput(
                proposal_id=UUID(str(proposal_id)),
                candidate_id=UUID(str(candidate_id)) if candidate_id else None,
                selected_source_id=selected_source_id,
                action=action,  # type: ignore[arg-type]
                rationale=rationale,
            )
        except (ValueError, ValidationError) as exc:
            return _error_payload(
                action="stationary_energy_accept_one",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-review-choice",
                error_code="invalid_arguments",
            )

        # Stage the single validated choice through the scoped service operation.
        return await _run_tool(
            "stationary_energy_accept_one",
            lambda service: service.accept_one(
                draft_run_id=draft_uuid,
                user_id=user_id,
                choice=choice,
            ),
        )

    @function_tool
    async def stationary_energy_stage_notation_key(
        notation_key: str,
        unavailable_explanation: str,
        proposal_id: Optional[str] = None,
        target_id: Optional[str] = None,
        rationale: Optional[str] = None,
    ) -> str:
        """Stage one notation-key choice for one eligible Stationary Energy row.

        Args:
            notation_key: One of the allowed notation keys from
                stationary_energy_list_notation_keys: NO, NE, IE, or C.
            unavailable_explanation: Short explanation for why the row is
                unavailable or outside scope.
            proposal_id: Optional exact proposal id from the active draft.
            target_id: Optional exact notation target id returned by
                stationary_energy_list_notation_keys.
            rationale: Optional reason shown in audit/UI output.

        This writes only CA staged review state and replaces any active staged
        notation-key choice for the same target/proposal.
        """

        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action="stationary_energy_stage_notation_key",
                draft_run_id=draft_uuid,
                message_key="tool-error-missing-token",
                error_code="missing_token",
            )
        try:
            choice = StationaryEnergyNotationKeyChoiceInput(
                proposal_id=UUID(str(proposal_id)) if proposal_id else None,
                target_id=target_id,
                notation_key=notation_key,  # type: ignore[arg-type]
                unavailable_explanation=unavailable_explanation,
                rationale=rationale,
            )
        except (ValueError, ValidationError):
            return _error_payload(
                action="stationary_energy_stage_notation_key",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-notation-choice",
                error_code="invalid_arguments",
            )

        return await _run_tool(
            "stationary_energy_stage_notation_key",
            lambda service: service.stage_notation_key(
                draft_run_id=draft_uuid,
                user_id=user_id,
                choice=choice,
                authorization=f"Bearer {token}",
            ),
        )

    @function_tool
    async def stationary_energy_accept_multiple(
        choices: list[StationaryEnergyAgentReviewChoiceInput],
    ) -> str:
        """Stage multiple explicit Stationary Energy review choices after UI confirmation.

        Args:
            choices: A list of objects. Each object must include proposal_id and
                should include candidate_id or selected_source_id unless choosing
                the recommended source. Include rationale when useful.

        Use this only after the user has approved a prior bulk confirmation card
        and the confirmed choices are present in runtime context. Return the
        exact staged list to the user. Invalid rows are skipped and reported.
        """

        # Normalize SDK-provided objects and plain dictionaries to one input model.
        parsed_choices = [
            (
                choice
                if isinstance(choice, StationaryEnergyAgentReviewChoiceInput)
                else StationaryEnergyAgentReviewChoiceInput.model_validate(choice)
            )
            for choice in choices
        ]

        # Apply the already-confirmed batch in one committed service operation.
        return await _run_tool(
            "stationary_energy_accept_multiple",
            lambda service: service.accept_multiple(
                draft_run_id=draft_uuid,
                user_id=user_id,
                choices=parsed_choices,
            ),
        )

    @function_tool
    async def stationary_energy_accept_all_recommended(
        rationale: Optional[str] = None,
    ) -> str:
        """Stage recommended choices for every unresolved source-backed proposal after confirmation.

        Use this only after the user has approved a bulk confirmation card for
        all recommended choices. For an initial "accept all", "pick best", or
        "use the recommendations" request, call
        stationary_energy_request_all_recommended_confirmation instead.
        """

        return await _run_tool(
            "stationary_energy_accept_all_recommended",
            lambda service: service.accept_all_recommended(
                draft_run_id=draft_uuid,
                user_id=user_id,
                rationale=rationale,
            ),
        )

    @function_tool
    async def stationary_energy_request_bulk_review_confirmation(
        choices: list[StationaryEnergyAgentReviewChoiceInput],
    ) -> str:
        """Ask the UI to confirm several Stationary Energy review choices.

        Args:
            choices: A list of proposed choices. Each object must include
                proposal_id and should include candidate_id or selected_source_id
                unless choosing the recommended source.

        Use this before applying more than one review choice in a single turn.
        It validates the choices and returns a UI confirmation payload without
        staging anything. If the request is ambiguous, ask a clarification
        question instead of calling this tool.
        """

        # Validate the proposed choices before asking the UI for confirmation.
        try:
            parsed_choices = [
                (
                    choice
                    if isinstance(choice, StationaryEnergyAgentReviewChoiceInput)
                    else StationaryEnergyAgentReviewChoiceInput.model_validate(choice)
                )
                for choice in choices
            ]
        except (ValueError, ValidationError) as exc:
            return _error_payload(
                action="stationary_energy_request_bulk_review_confirmation",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-review-choices",
                error_code="invalid_arguments",
            )

        # Return a preview payload only; the confirmation card performs no writes.
        return await _run_tool(
            "stationary_energy_request_bulk_review_confirmation",
            lambda service: service.preview_multiple(
                draft_run_id=draft_uuid,
                user_id=user_id,
                choices=parsed_choices,
            ),
        )

    @function_tool
    async def stationary_energy_request_bulk_notation_confirmation(
        choices: list[StationaryEnergyNotationKeyChoiceInput],
    ) -> str:
        """Ask the UI to confirm multiple notation-key choices before staging.

        Args:
            choices: Proposed notation-key choices. Each object must include
                proposal_id or target_id, notation_key from allowed_notation_keys,
                and unavailable_explanation.

        This validates choices and returns a confirmation card payload only. It
        does not stage choices or write inventory data.
        """

        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action="stationary_energy_request_bulk_notation_confirmation",
                draft_run_id=draft_uuid,
                message_key="tool-error-missing-token",
                error_code="missing_token",
            )
        try:
            parsed_choices = [
                (
                    choice
                    if isinstance(choice, StationaryEnergyNotationKeyChoiceInput)
                    else StationaryEnergyNotationKeyChoiceInput.model_validate(choice)
                )
                for choice in choices
            ]
        except (ValueError, ValidationError):
            return _error_payload(
                action="stationary_energy_request_bulk_notation_confirmation",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-notation-choices",
                error_code="invalid_arguments",
            )

        return await _run_tool(
            "stationary_energy_request_bulk_notation_confirmation",
            lambda service: service.preview_notation_choices(
                draft_run_id=draft_uuid,
                user_id=user_id,
                choices=parsed_choices,
                authorization=f"Bearer {token}",
            ),
        )

    @function_tool
    async def stationary_energy_apply_bulk_notation_choices(
        choices: list[StationaryEnergyNotationKeyChoiceInput],
    ) -> str:
        """Stage notation-key choices after the UI confirmation card is approved.

        Use this only after the user approves the confirmation card and the
        confirmed notation choices are present in runtime context. It writes CA
        staged review state only, never committed inventory data.
        """

        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action="stationary_energy_apply_bulk_notation_choices",
                draft_run_id=draft_uuid,
                message_key="tool-error-missing-token",
                error_code="missing_token",
            )
        try:
            parsed_choices = [
                (
                    choice
                    if isinstance(choice, StationaryEnergyNotationKeyChoiceInput)
                    else StationaryEnergyNotationKeyChoiceInput.model_validate(choice)
                )
                for choice in choices
            ]
        except (ValueError, ValidationError):
            return _error_payload(
                action="stationary_energy_apply_bulk_notation_choices",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-notation-choices",
                error_code="invalid_arguments",
            )

        return await _run_tool(
            "stationary_energy_apply_bulk_notation_choices",
            lambda service: service.apply_notation_choices(
                draft_run_id=draft_uuid,
                user_id=user_id,
                choices=parsed_choices,
                authorization=f"Bearer {token}",
            ),
        )

    @function_tool
    async def stationary_energy_request_all_recommended_confirmation(
        rationale: Optional[str] = None,
    ) -> str:
        """Ask the UI to confirm accepting all unresolved recommended choices.

        Use this for clear bulk requests such as "accept all" or "pick best for
        all rows". This tool validates the pending recommended choices and
        returns a UI confirmation payload without staging anything.
        """

        return await _run_tool(
            "stationary_energy_request_all_recommended_confirmation",
            lambda service: service.preview_all_recommended(
                draft_run_id=draft_uuid,
                user_id=user_id,
                rationale=rationale,
            ),
        )

    @function_tool
    async def stationary_energy_request_staged_source_change_confirmation(
        proposal_ids: Optional[list[str]] = None,
    ) -> str:
        """Ask the UI to confirm changes to currently staged source choices.

        Args:
            proposal_ids: Optional proposal ids to change. Omit to change every
                active staged source choice.

        For each staged row, the tool proposes a different available datasource
        for that segment. If no different datasource exists, it proposes leaving
        the row empty. It validates the changes and returns a UI confirmation
        payload without staging anything.
        """

        # Convert optional proposal-id filters to UUIDs before preview validation.
        try:
            parsed_proposal_ids = _parse_optional_uuid_list(proposal_ids)
        except ValueError as exc:
            return _error_payload(
                action="stationary_energy_request_staged_source_change_confirmation",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-proposal-ids",
                error_code="invalid_arguments",
            )

        # Preview staged-source replacements without mutating active selections.
        return await _run_tool(
            "stationary_energy_request_staged_source_change_confirmation",
            lambda service: service.preview_staged_source_changes(
                draft_run_id=draft_uuid,
                user_id=user_id,
                proposal_ids=parsed_proposal_ids,
            ),
        )

    @function_tool
    async def stationary_energy_request_staged_sources_rollback_confirmation(
        proposal_ids: Optional[list[str]] = None,
    ) -> str:
        """Ask the UI to confirm rolling back currently staged source choices.

        Args:
            proposal_ids: Optional proposal ids to roll back. Omit to roll back
                every active staged source choice.

        The tool returns exactly which staged selections would be removed. It
        does not modify the draft until the user confirms the rollback card.
        """

        # Convert optional proposal-id filters to UUIDs before preview validation.
        try:
            parsed_proposal_ids = _parse_optional_uuid_list(proposal_ids)
        except ValueError as exc:
            return _error_payload(
                action="stationary_energy_request_staged_sources_rollback_confirmation",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-proposal-ids",
                error_code="invalid_arguments",
            )

        # Return the rollback preview so the browser can ask for confirmation.
        return await _run_tool(
            "stationary_energy_request_staged_sources_rollback_confirmation",
            lambda service: service.preview_staged_sources_rollback(
                draft_run_id=draft_uuid,
                user_id=user_id,
                proposal_ids=parsed_proposal_ids,
            ),
        )

    @function_tool
    async def stationary_energy_rollback_staged_sources(
        proposal_ids: Optional[list[str]] = None,
    ) -> str:
        """Roll back active staged source choices after UI confirmation.

        Args:
            proposal_ids: Proposal ids confirmed by the UI rollback card. Omit
                only when the confirmed rollback card targeted every active
                staged source choice.

        Use this only after the user approves a rollback confirmation card and
        the confirmed rollback choices are present in runtime context.
        """

        # Parse the UI-confirmed rollback target ids before modifying staged rows.
        try:
            parsed_proposal_ids = _parse_optional_uuid_list(proposal_ids)
        except ValueError as exc:
            return _error_payload(
                action="stationary_energy_rollback_staged_sources",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-proposal-ids",
                error_code="invalid_arguments",
            )

        # Remove only the active staged selections that passed confirmation.
        return await _run_tool(
            "stationary_energy_rollback_staged_sources",
            lambda service: service.rollback_staged_sources(
                draft_run_id=draft_uuid,
                user_id=user_id,
                proposal_ids=parsed_proposal_ids,
            ),
        )

    @function_tool
    async def stationary_energy_rollback_staged_notation_keys(
        proposal_ids: Optional[list[str]] = None,
        target_ids: Optional[list[str]] = None,
    ) -> str:
        """Roll back active staged notation-key choices without inventory writes.

        Args:
            proposal_ids: Optional proposal ids to roll back.
            target_ids: Optional notation target ids to roll back. Omit both
                proposal_ids and target_ids to roll back all active staged
                notation-key choices.

        This only removes active staged notation-key choices. It does not affect
        saved review decisions or committed inventory data.
        """

        try:
            parsed_proposal_ids = _parse_optional_uuid_list(proposal_ids)
        except ValueError:
            return _error_payload(
                action="stationary_energy_rollback_staged_notation_keys",
                draft_run_id=draft_uuid,
                message_key="tool-error-invalid-proposal-ids",
                error_code="invalid_arguments",
            )

        return await _run_tool(
            "stationary_energy_rollback_staged_notation_keys",
            lambda service: service.rollback_staged_notation_keys(
                draft_run_id=draft_uuid,
                user_id=user_id,
                proposal_ids=parsed_proposal_ids,
                target_ids=target_ids,
            ),
        )

    @function_tool
    async def stationary_energy_save_review_draft() -> str:
        """Persist the staged Stationary Energy review choices as a saved Clima draft.

        Use this when the user asks to save the review draft in Clima. This does
        not commit rows to the CityCatalyst inventory. If any source-backed
        proposal is unresolved, the tool returns blockers instead of saving.
        """

        # Require the current CC token because draft-save reuses the existing route.
        token = token_ref.get("value")
        if not token:
            return _error_payload(
                action="stationary_energy_save_review_draft",
                draft_run_id=draft_uuid,
                message_key="tool-error-missing-token",
                error_code="missing_token",
            )

        # Persist the reviewed draft in Clima without committing inventory rows.
        return await _run_tool(
            "stationary_energy_save_review_draft",
            lambda service: service.save_review_draft(
                draft_run_id=draft_uuid,
                user_id=user_id,
                authorization=f"Bearer {token}",
            ),
        )

    @function_tool
    async def stationary_energy_request_inventory_save_confirmation() -> str:
        """Request the UI confirmation card for saving the reviewed draft to inventory.

        This tool does not commit inventory data. Use it only after the user asks
        to save to inventory. The browser must still show the confirmation card,
        and the user must approve that card before the existing inventory save
        route can run.
        """

        # Verify the scoped draft is still accessible before showing confirmation.
        try:
            async with session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.list_review_options(
                    draft_run_id=draft_uuid,
                    user_id=user_id,
                )
                summary = await service.inventory_save_confirmation_summary(
                    draft_run_id=draft_uuid,
                    user_id=user_id,
                )
                result = StationaryEnergyInventoryConfirmationToolResult(
                    success=True,
                    draft_run_id=draft_uuid,
                    message_key=(
                        "tool-message-inventory-save-confirm-with-notation"
                        if summary["notation"] > 0
                        else "tool-message-inventory-save-confirm"
                    ),
                    message_params=summary if summary["notation"] > 0 else {},
                )
                # Return only confirmation metadata; inventory writes stay in CC.
                logger.info(
                    "Stationary Energy inventory save confirmation requested draft_run_id=%s",
                    draft_uuid,
                )
                return result.model_dump_json()
        except HTTPException as exc:
            logger.info(
                "Stationary Energy inventory save confirmation rejected draft_run_id=%s status=%s detail=%s",
                draft_uuid,
                exc.status_code,
                exc.detail,
            )
            return StationaryEnergyInventoryConfirmationToolResult(
                success=False,
                draft_run_id=draft_uuid,
                message_key="tool-error-http",
                message_params={"status": exc.status_code},
                error_code=f"http_{exc.status_code}",
            ).model_dump_json()

    inventory_context_tools = build_inventory_context_tools(
        resolve_scope=_resolve_inventory_scope,
        user_id=user_id,
        token_ref=token_ref,
    )

    return [
        *inventory_context_tools,
        stationary_energy_list_review_options,
        stationary_energy_list_notation_keys,
        stationary_energy_accept_one,
        stationary_energy_stage_notation_key,
        stationary_energy_accept_multiple,
        stationary_energy_accept_all_recommended,
        stationary_energy_request_bulk_review_confirmation,
        stationary_energy_request_bulk_notation_confirmation,
        stationary_energy_apply_bulk_notation_choices,
        stationary_energy_request_all_recommended_confirmation,
        stationary_energy_request_staged_source_change_confirmation,
        stationary_energy_request_staged_sources_rollback_confirmation,
        stationary_energy_rollback_staged_sources,
        stationary_energy_rollback_staged_notation_keys,
        stationary_energy_save_review_draft,
        stationary_energy_request_inventory_save_confirmation,
    ]


def _parse_optional_uuid_list(values: list[str] | None) -> list[UUID] | None:
    """Parse an optional list of UUID strings for tool arguments."""
    if values is None:
        return None
    return [UUID(str(value)) for value in values]


def _error_payload(
    *,
    action: str,
    draft_run_id: UUID,
    message_key: str,
    error_code: str,
    message_params: dict[str, MessageParamValue] | None = None,
) -> str:
    """Serialize a standard failed Stationary Energy review tool response."""
    result = StationaryEnergyAgentReviewToolResult(
        success=False,
        action=action,
        draft_run_id=draft_run_id,
        message_key=message_key,
        message_params=message_params or {},
    ).model_dump(mode="json")
    result["error_code"] = error_code
    return json.dumps(result)
