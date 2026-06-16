from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyStagedReviewSelection,
)
from app.models.stationary_energy_drafts import (
    ReviewDecisionInput,
    ReviewDecisionResponse,
    ReviewStationaryEnergyDraftRequest,
)
from app.services.stationary_energy.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.services.stationary_energy.stationary_energy_draft_review import (
    latest_review_decisions,
)
from app.services.stationary_energy.stationary_energy_draft_service import (
    StationaryEnergyDraftService,
)


SOURCE_BACKED_STATUSES = {
    "ready",
    "needs_review",
    "conflict",
    "gap",
    "accepted",
    "overridden",
}
TERMINAL_DRAFT_STATUSES = {
    "saved",
    "partially_saved",
    "no_changes",
    "failed",
}


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
    available_options: list[dict[str, Any]] = Field(default_factory=list)


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
    message: str | None = None
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
    message: str | None = None


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
    message: str | None = None


def _source_label(candidate: StationaryEnergyDraftSourceCandidate) -> str:
    """Return a concise display label for a source candidate."""
    return candidate.name or candidate.publisher_name or candidate.datasource_id


def _target_label(proposal: StationaryEnergyDraftProposal) -> str:
    """Return a readable GPC target label for a draft proposal."""
    target = proposal.target_ref or {}
    parts = [
        target.get("subsector_name"),
        target.get("subcategory_name"),
        target.get("scope_name") or target.get("scope_id"),
    ]
    label = " / ".join(str(part) for part in parts if part)
    return label or "Stationary Energy row"


def _details_datasource_id(candidate: StationaryEnergyDraftSourceCandidate) -> str:
    """Return the source id expected by existing review-save contracts."""
    source_data = candidate.source_data or {}
    value = source_data.get("details_datasource_id")
    if isinstance(value, str) and value.strip():
        return value
    return candidate.datasource_id


def _is_source_backed(proposal: StationaryEnergyDraftProposal) -> bool:
    """Return whether a proposal requires an explicit source review choice."""
    return bool(proposal.recommended_candidate_id or proposal.alternative_candidate_ids)


class StationaryEnergyAgentReviewService:
    """CA-owned tool backing service for Stationary Energy draft review staging."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize review staging against one database session."""
        self.session = session
        self.repository = StationaryEnergyDraftRepository(session)

    async def list_review_options(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Return selected and pending source-review choices for a draft."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        selected = [
            self._choice_from_staged(selection, draft_run)
            for selection in staged
            if selection.status == "active"
        ]
        pending = self._pending_required_proposals(
            draft_run=draft_run,
            staged=staged,
        )
        return StationaryEnergyAgentReviewToolResult(
            success=True,
            action="stationary_energy_list_review_options",
            ui_event=None,
            draft_run_id=draft_run_id,
            selected_choices=selected,
            blocked_choices=[
                StationaryEnergyAgentReviewBlockedChoice(
                    proposal_id=proposal.proposal_id,
                    reason="pending",
                    available_options=self._available_options(proposal, draft_run),
                )
                for proposal in pending
            ],
            pending_required_count=len(pending),
            message="Loaded Stationary Energy review options.",
        )

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
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        selected_choices, blocked_choices = self._resolve_choice_inputs(
            draft_run=draft_run,
            choices=choices,
        )

        selections: list[StationaryEnergyStagedReviewSelection] = []
        for resolved in selected_choices:
            selection = StationaryEnergyStagedReviewSelection(
                draft_run_id=draft_run.draft_run_id,
                proposal_id=resolved.proposal_id,
                user_id=user_id,
                action=resolved.action,
                selected_source_id=resolved.selected_source_id,
                selected_candidate_id=resolved.selected_candidate_id,
                rationale=resolved.rationale,
                tool_call_id=tool_call_id,
                status="active",
            )
            selections.append(selection)

        if selections:
            await self.repository.upsert_staged_review_selections(selections)
            draft_run.workflow_step = "review"
            draft_run.updated_at = datetime.now(timezone.utc)
            await self.session.flush()

        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending = self._pending_required_proposals(
            draft_run=draft_run,
            staged=staged,
        )
        return StationaryEnergyAgentReviewToolResult(
            success=not blocked_choices,
            action=action_name,
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            message=self._stage_message(
                selected_choices, blocked_choices, len(pending)
            ),
        )

    async def accept_all_recommended(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        rationale: str | None = None,
        tool_call_id: str | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Stage recommended choices for unresolved source-backed proposals."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        choices = [
            StationaryEnergyAgentReviewChoiceInput(
                proposal_id=proposal.proposal_id,
                action="accept",
                rationale=rationale,
            )
            for proposal in self._pending_required_proposals(
                draft_run=draft_run,
                staged=staged,
            )
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
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        selected_choices, blocked_choices = self._resolve_choice_inputs(
            draft_run=draft_run,
            choices=choices,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending_after_preview = self._pending_required_proposals(
            draft_run=draft_run,
            staged=staged,
            extra_resolved_ids={choice.proposal_id for choice in selected_choices},
        )
        return StationaryEnergyBulkReviewConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action=action_name,
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending_after_preview),
            message=self._bulk_confirmation_message(
                selected_choices,
                blocked_choices,
                len(pending_after_preview),
            ),
        )

    async def preview_all_recommended(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        rationale: str | None = None,
    ) -> StationaryEnergyBulkReviewConfirmationToolResult:
        """Validate the current unresolved recommended choices without staging."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        choices = [
            StationaryEnergyAgentReviewChoiceInput(
                proposal_id=proposal.proposal_id,
                action="accept",
                rationale=rationale,
            )
            for proposal in self._pending_required_proposals(
                draft_run=draft_run,
                staged=staged,
            )
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
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        targeted, blocked_choices = self._target_active_staged_selections(
            draft_run=draft_run,
            staged=staged,
            proposal_ids=proposal_ids,
        )
        selected_choices: list[StationaryEnergyAgentReviewChoice] = []
        for selection in targeted:
            resolved = self._change_choice_for_staged_selection(
                selection=selection,
                draft_run=draft_run,
            )
            if isinstance(resolved, StationaryEnergyAgentReviewBlockedChoice):
                blocked_choices.append(resolved)
                continue
            selected_choices.append(resolved)

        pending = self._pending_required_proposals(
            draft_run=draft_run,
            staged=staged,
        )
        return StationaryEnergyStagedReviewUpdateConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_request_staged_source_change_confirmation",
            ui_event="stationary_energy_review_change_confirmation_requested",
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            message=self._staged_change_confirmation_message(
                selected_choices,
                blocked_choices,
            ),
        )

    async def preview_staged_sources_rollback(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: list[UUID] | None = None,
    ) -> StationaryEnergyStagedReviewUpdateConfirmationToolResult:
        """Validate active staged selections that would be rolled back."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        targeted, blocked_choices = self._target_active_staged_selections(
            draft_run=draft_run,
            staged=staged,
            proposal_ids=proposal_ids,
        )
        selected_choices = [
            self._rollback_choice_from_staged(selection, draft_run)
            for selection in targeted
        ]
        staged_after_preview = [
            selection
            for selection in staged
            if selection.proposal_id
            not in {choice.proposal_id for choice in selected_choices}
        ]
        pending_after_preview = self._pending_required_proposals(
            draft_run=draft_run,
            staged=staged_after_preview,
        )
        return StationaryEnergyStagedReviewUpdateConfirmationToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_request_staged_sources_rollback_confirmation",
            ui_event="stationary_energy_review_rollback_confirmation_requested",
            draft_run_id=draft_run_id,
            pending_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending_after_preview),
            message=self._staged_rollback_confirmation_message(
                selected_choices,
                blocked_choices,
                len(pending_after_preview),
            ),
        )

    async def rollback_staged_sources(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        proposal_ids: list[UUID] | None = None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Roll back active staged selections after UI confirmation."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        targeted, blocked_choices = self._target_active_staged_selections(
            draft_run=draft_run,
            staged=staged,
            proposal_ids=proposal_ids,
        )
        selected_choices = [
            self._rollback_choice_from_staged(selection, draft_run)
            for selection in targeted
        ]

        if targeted:
            await self.repository.mark_staged_review_selections_rolled_back(
                draft_run_id=draft_run_id,
                user_id=user_id,
                proposal_ids={selection.proposal_id for selection in targeted},
            )
            draft_run.workflow_step = "review"
            draft_run.updated_at = datetime.now(timezone.utc)
            await self.session.flush()

        staged_after = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        pending = self._pending_required_proposals(
            draft_run=draft_run,
            staged=staged_after,
        )
        return StationaryEnergyAgentReviewToolResult(
            success=bool(selected_choices) and not blocked_choices,
            action="stationary_energy_rollback_staged_sources",
            draft_run_id=draft_run_id,
            selected_choices=selected_choices,
            blocked_choices=blocked_choices,
            pending_required_count=len(pending),
            message=self._staged_rollback_result_message(
                selected_choices,
                blocked_choices,
                len(pending),
            ),
        )

    async def save_review_draft(
        self,
        *,
        draft_run_id: UUID,
        user_id: str,
        authorization: str | None,
    ) -> StationaryEnergyAgentReviewToolResult:
        """Persist complete staged review choices through the draft service."""
        draft_run = await self._load_owned_reviewable_draft(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        staged = await self.repository.get_staged_review_selections(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        decisions, blockers = self._build_complete_decision_inputs(
            draft_run=draft_run,
            staged=staged,
        )
        if blockers:
            return StationaryEnergyAgentReviewToolResult(
                success=False,
                action="stationary_energy_save_review_draft",
                draft_run_id=draft_run_id,
                blocked_choices=blockers,
                pending_required_count=len(blockers),
                message="Draft review cannot be saved until every source-backed proposal is staged.",
            )

        draft_service = StationaryEnergyDraftService(self.session)
        response = await draft_service.review_draft(
            draft_run_id=draft_run_id,
            payload=ReviewStationaryEnergyDraftRequest(
                user_id=user_id,
                decisions=decisions,
            ),
            authorization=authorization,
        )
        await self.repository.mark_staged_review_selections_saved(
            draft_run_id=draft_run_id,
            user_id=user_id,
        )
        return StationaryEnergyAgentReviewToolResult(
            success=True,
            action="stationary_energy_save_review_draft",
            draft_run_id=draft_run_id,
            selected_choices=[
                self._choice_from_review_input(decision, draft_run)
                for decision in decisions
                if decision.action != "leave_draft"
            ],
            pending_required_count=0,
            saved_decisions=response.decisions,
            message="Draft review decisions were saved in Clima.",
        )

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

    def _candidate_by_id(
        self,
        draft_run: StationaryEnergyDraftRun,
    ) -> dict[str, StationaryEnergyDraftSourceCandidate]:
        """Index source candidates by candidate id."""
        return {
            str(candidate.candidate_id): candidate
            for candidate in draft_run.source_candidates
        }

    def _candidate_by_source_id(
        self,
        draft_run: StationaryEnergyDraftRun,
    ) -> dict[str, StationaryEnergyDraftSourceCandidate]:
        """Index source candidates by public datasource identifiers."""
        by_source: dict[str, StationaryEnergyDraftSourceCandidate] = {}
        for candidate in draft_run.source_candidates:
            by_source[candidate.datasource_id] = candidate
            by_source[_details_datasource_id(candidate)] = candidate
        return by_source

    def _available_candidates(
        self,
        proposal: StationaryEnergyDraftProposal,
        draft_run: StationaryEnergyDraftRun,
    ) -> list[StationaryEnergyDraftSourceCandidate]:
        """Return applicable candidates the user can choose for a proposal."""
        candidate_by_id = self._candidate_by_id(draft_run)
        ids = [
            (
                str(proposal.recommended_candidate_id)
                if proposal.recommended_candidate_id
                else None
            ),
            *[
                str(candidate_id)
                for candidate_id in proposal.alternative_candidate_ids or []
            ],
        ]
        candidates: list[StationaryEnergyDraftSourceCandidate] = []
        seen: set[str] = set()
        for candidate_id in ids:
            if not candidate_id or candidate_id in seen:
                continue
            candidate = candidate_by_id.get(candidate_id)
            if candidate is None or candidate.applicability_status != "applicable":
                continue
            seen.add(candidate_id)
            candidates.append(candidate)
        return candidates

    def _available_options(
        self,
        proposal: StationaryEnergyDraftProposal,
        draft_run: StationaryEnergyDraftRun,
    ) -> list[dict[str, Any]]:
        """Build UI/model options for one proposal."""
        options = []
        for candidate in self._available_candidates(proposal, draft_run):
            is_recommended = candidate.candidate_id == proposal.recommended_candidate_id
            options.append(
                {
                    "candidate_id": str(candidate.candidate_id),
                    "datasource_id": candidate.datasource_id,
                    "selected_source_id": _details_datasource_id(candidate),
                    "source_label": _source_label(candidate),
                    "recommended": is_recommended,
                    "action": "accept" if is_recommended else "override_source",
                }
            )
        options.append(
            {
                "candidate_id": None,
                "datasource_id": None,
                "selected_source_id": None,
                "source_label": "Leave empty",
                "recommended": False,
                "action": "leave_draft",
            }
        )
        return options

    def _resolve_choice(
        self,
        *,
        proposal: StationaryEnergyDraftProposal,
        draft_run: StationaryEnergyDraftRun,
        choice: StationaryEnergyAgentReviewChoiceInput,
    ) -> StationaryEnergyAgentReviewChoice | StationaryEnergyAgentReviewBlockedChoice:
        """Resolve a requested choice to a valid candidate or blocker."""
        if choice.action == "leave_draft":
            return StationaryEnergyAgentReviewChoice(
                proposal_id=proposal.proposal_id,
                action="leave_draft",
                selected_source_id=None,
                selected_candidate_id=None,
                source_label="Leave empty",
                target_label=_target_label(proposal),
                rationale=choice.rationale,
            )

        candidate = None
        if choice.candidate_id:
            candidate = self._candidate_by_id(draft_run).get(str(choice.candidate_id))
        elif choice.selected_source_id:
            candidate = self._candidate_by_source_id(draft_run).get(
                choice.selected_source_id
            )
        elif proposal.recommended_candidate_id:
            candidate = self._candidate_by_id(draft_run).get(
                str(proposal.recommended_candidate_id)
            )

        available = self._available_candidates(proposal, draft_run)
        available_ids = {candidate.candidate_id for candidate in available}
        if candidate is None or candidate.candidate_id not in available_ids:
            return StationaryEnergyAgentReviewBlockedChoice(
                proposal_id=proposal.proposal_id,
                reason="Selected source is not an available option for this proposal",
                available_options=self._available_options(proposal, draft_run),
            )

        action: Literal["accept", "override_source"]
        if candidate.candidate_id == proposal.recommended_candidate_id:
            action = "accept"
        else:
            action = "override_source"

        if choice.action in {"accept", "override_source"} and choice.action != action:
            return StationaryEnergyAgentReviewBlockedChoice(
                proposal_id=proposal.proposal_id,
                reason=f"Action {choice.action} is not valid for the selected source",
                available_options=self._available_options(proposal, draft_run),
            )

        return StationaryEnergyAgentReviewChoice(
            proposal_id=proposal.proposal_id,
            action=action,
            selected_source_id=_details_datasource_id(candidate),
            selected_candidate_id=candidate.candidate_id,
            source_label=_source_label(candidate),
            target_label=_target_label(proposal),
            rationale=choice.rationale,
        )

    def _resolve_choice_inputs(
        self,
        *,
        draft_run: StationaryEnergyDraftRun,
        choices: list[StationaryEnergyAgentReviewChoiceInput],
    ) -> tuple[
        list[StationaryEnergyAgentReviewChoice],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Validate a batch of requested choices against the draft snapshot."""
        selected_choices: list[StationaryEnergyAgentReviewChoice] = []
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = []

        proposal_by_id = {
            proposal.proposal_id: proposal for proposal in draft_run.proposals
        }
        for choice in choices:
            proposal = proposal_by_id.get(choice.proposal_id)
            if proposal is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=choice.proposal_id,
                        reason="proposal_id does not belong to this draft",
                    )
                )
                continue

            resolved = self._resolve_choice(
                proposal=proposal,
                draft_run=draft_run,
                choice=choice,
            )
            if isinstance(resolved, StationaryEnergyAgentReviewBlockedChoice):
                blocked_choices.append(resolved)
                continue

            selected_choices.append(
                resolved.model_copy(
                    update={"rationale": choice.rationale or resolved.rationale}
                )
            )

        return selected_choices, blocked_choices

    def _target_active_staged_selections(
        self,
        *,
        draft_run: StationaryEnergyDraftRun,
        staged: list[StationaryEnergyStagedReviewSelection],
        proposal_ids: list[UUID] | None,
    ) -> tuple[
        list[StationaryEnergyStagedReviewSelection],
        list[StationaryEnergyAgentReviewBlockedChoice],
    ]:
        """Return requested active staged selections plus row-level blockers."""
        proposal_by_id = {
            proposal.proposal_id: proposal for proposal in draft_run.proposals
        }
        staged_by_proposal = {
            selection.proposal_id: selection
            for selection in staged
            if selection.status == "active"
        }
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice] = []

        if proposal_ids is None:
            return list(staged_by_proposal.values()), blocked_choices

        targeted: list[StationaryEnergyStagedReviewSelection] = []
        seen: set[UUID] = set()
        for proposal_id in proposal_ids:
            if proposal_id in seen:
                continue
            seen.add(proposal_id)
            proposal = proposal_by_id.get(proposal_id)
            if proposal is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal_id,
                        reason="proposal_id does not belong to this draft",
                    )
                )
                continue
            selection = staged_by_proposal.get(proposal_id)
            if selection is None:
                blocked_choices.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal_id,
                        reason="No active staged source selection exists for this proposal",
                        available_options=self._available_options(proposal, draft_run),
                    )
                )
                continue
            targeted.append(selection)

        return targeted, blocked_choices

    def _change_choice_for_staged_selection(
        self,
        *,
        selection: StationaryEnergyStagedReviewSelection,
        draft_run: StationaryEnergyDraftRun,
    ) -> StationaryEnergyAgentReviewChoice | StationaryEnergyAgentReviewBlockedChoice:
        """Choose a different available source, or empty if none exists."""
        proposal = next(
            proposal
            for proposal in draft_run.proposals
            if proposal.proposal_id == selection.proposal_id
        )
        current_source_ids = {
            source_id
            for source_id in [
                selection.selected_source_id,
                (
                    str(selection.selected_candidate_id)
                    if selection.selected_candidate_id
                    else None
                ),
            ]
            if source_id
        }
        for candidate in self._available_candidates(proposal, draft_run):
            candidate_ids = {
                str(candidate.candidate_id),
                candidate.datasource_id,
                _details_datasource_id(candidate),
            }
            if candidate_ids.isdisjoint(current_source_ids):
                return self._resolve_choice(
                    proposal=proposal,
                    draft_run=draft_run,
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=proposal.proposal_id,
                        candidate_id=candidate.candidate_id,
                        rationale="User asked to change the staged source.",
                    ),
                )

        if selection.action != "leave_draft":
            return self._resolve_choice(
                proposal=proposal,
                draft_run=draft_run,
                choice=StationaryEnergyAgentReviewChoiceInput(
                    proposal_id=proposal.proposal_id,
                    action="leave_draft",
                    rationale=(
                        "User asked to change the staged source; no different "
                        "source is available for this row."
                    ),
                ),
            )

        return StationaryEnergyAgentReviewBlockedChoice(
            proposal_id=proposal.proposal_id,
            reason="No different source or empty-state change is available for this staged selection",
            available_options=self._available_options(proposal, draft_run),
        )

    def _rollback_choice_from_staged(
        self,
        selection: StationaryEnergyStagedReviewSelection,
        draft_run: StationaryEnergyDraftRun,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize an active staged selection as a rollback choice."""
        staged_choice = self._choice_from_staged(selection, draft_run)
        return staged_choice.model_copy(
            update={
                "action": "rollback_staged",
                "rationale": "This staged source choice will be removed.",
            }
        )

    def _pending_required_proposals(
        self,
        *,
        draft_run: StationaryEnergyDraftRun,
        staged: list[StationaryEnergyStagedReviewSelection],
        extra_resolved_ids: set[UUID] | None = None,
    ) -> list[StationaryEnergyDraftProposal]:
        """Return source-backed proposals still requiring user review."""
        staged_ids = {
            selection.proposal_id
            for selection in staged
            if selection.status == "active"
        }
        extra_resolved_ids = extra_resolved_ids or set()
        final_decision_ids = set(latest_review_decisions(draft_run.review_decisions))
        pending = []
        for proposal in draft_run.proposals:
            if not _is_source_backed(proposal):
                continue
            if (
                proposal.proposal_id in staged_ids
                or proposal.proposal_id in final_decision_ids
                or proposal.proposal_id in extra_resolved_ids
            ):
                continue
            if proposal.status not in SOURCE_BACKED_STATUSES:
                continue
            pending.append(proposal)
        return pending

    def _build_complete_decision_inputs(
        self,
        *,
        draft_run: StationaryEnergyDraftRun,
        staged: list[StationaryEnergyStagedReviewSelection],
    ) -> tuple[
        list[ReviewDecisionInput], list[StationaryEnergyAgentReviewBlockedChoice]
    ]:
        """Convert staged selections into complete draft review decisions."""
        staged_by_proposal = {
            selection.proposal_id: selection
            for selection in staged
            if selection.status == "active"
        }
        latest_decisions = latest_review_decisions(draft_run.review_decisions)
        decisions: list[ReviewDecisionInput] = []
        blockers: list[StationaryEnergyAgentReviewBlockedChoice] = []

        for proposal in draft_run.proposals:
            staged_selection = staged_by_proposal.get(proposal.proposal_id)
            if staged_selection is not None:
                decisions.append(self._review_input_from_staged(staged_selection))
                continue

            latest = latest_decisions.get(proposal.proposal_id)
            if latest is not None:
                decisions.append(
                    ReviewDecisionInput(
                        proposal_id=proposal.proposal_id,
                        action=latest.action,  # type: ignore[arg-type]
                        selected_source_id=(
                            str(latest.selected_candidate_id)
                            if latest.action == "override_source"
                            and latest.selected_candidate_id
                            else latest.selected_source_id
                        ),
                        manual_value=latest.manual_value,
                        manual_unit=latest.manual_unit,
                        note=latest.note,
                    )
                )
                continue

            if _is_source_backed(proposal):
                blockers.append(
                    StationaryEnergyAgentReviewBlockedChoice(
                        proposal_id=proposal.proposal_id,
                        reason="Source-backed proposal has no staged review selection",
                        available_options=self._available_options(proposal, draft_run),
                    )
                )
                continue

            decisions.append(
                ReviewDecisionInput(
                    proposal_id=proposal.proposal_id,
                    action="leave_draft",
                )
            )

        return decisions, blockers

    @staticmethod
    def _review_input_from_staged(
        selection: StationaryEnergyStagedReviewSelection,
    ) -> ReviewDecisionInput:
        """Convert one staged selection into the review API input shape."""
        return ReviewDecisionInput(
            proposal_id=selection.proposal_id,
            action=selection.action,  # type: ignore[arg-type]
            selected_source_id=(
                str(selection.selected_candidate_id)
                if selection.action == "override_source"
                and selection.selected_candidate_id
                else selection.selected_source_id
            ),
            note=selection.rationale,
        )

    def _choice_from_staged(
        self,
        selection: StationaryEnergyStagedReviewSelection,
        draft_run: StationaryEnergyDraftRun,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize a staged selection into a tool choice summary."""
        proposal = next(
            proposal
            for proposal in draft_run.proposals
            if proposal.proposal_id == selection.proposal_id
        )
        candidate = (
            self._candidate_by_id(draft_run).get(str(selection.selected_candidate_id))
            if selection.selected_candidate_id
            else None
        )
        return StationaryEnergyAgentReviewChoice(
            proposal_id=selection.proposal_id,
            action=selection.action,  # type: ignore[arg-type]
            selected_source_id=selection.selected_source_id,
            selected_candidate_id=selection.selected_candidate_id,
            source_label=_source_label(candidate) if candidate else "Leave empty",
            target_label=_target_label(proposal),
            rationale=selection.rationale,
        )

    def _choice_from_review_input(
        self,
        decision: ReviewDecisionInput,
        draft_run: StationaryEnergyDraftRun,
    ) -> StationaryEnergyAgentReviewChoice:
        """Serialize a review input into a tool choice summary."""
        proposal = next(
            proposal
            for proposal in draft_run.proposals
            if proposal.proposal_id == decision.proposal_id
        )
        if decision.action == "accept":
            candidate = self._candidate_by_id(draft_run).get(
                str(proposal.recommended_candidate_id)
            )
        elif decision.action == "override_source" and decision.selected_source_id:
            candidate = self._candidate_by_id(draft_run).get(
                decision.selected_source_id
            ) or self._candidate_by_source_id(draft_run).get(
                decision.selected_source_id
            )
        else:
            candidate = None
        return StationaryEnergyAgentReviewChoice(
            proposal_id=decision.proposal_id,
            action=decision.action,  # type: ignore[arg-type]
            selected_source_id=(
                _details_datasource_id(candidate)
                if candidate is not None
                else decision.selected_source_id
            ),
            selected_candidate_id=candidate.candidate_id if candidate else None,
            source_label=_source_label(candidate) if candidate else None,
            target_label=_target_label(proposal),
            rationale=decision.note,
        )

    @staticmethod
    def _stage_message(
        selected_choices: list[StationaryEnergyAgentReviewChoice],
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
        pending_required_count: int,
    ) -> str:
        """Build a concise status message after staging choices."""
        if selected_choices and not blocked_choices:
            return (
                f"Staged {len(selected_choices)} Stationary Energy review choices. "
                f"{pending_required_count} required choices remain."
            )
        if selected_choices:
            return (
                f"Staged {len(selected_choices)} choices and blocked "
                f"{len(blocked_choices)} invalid choices. "
                f"{pending_required_count} required choices remain."
            )
        if blocked_choices:
            return (
                "No choices were staged because the requested selections were invalid."
            )
        return "No unresolved recommended Stationary Energy choices were available."

    @staticmethod
    def _bulk_confirmation_message(
        selected_choices: list[StationaryEnergyAgentReviewChoice],
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
        pending_required_count: int,
    ) -> str:
        """Build a concise status message for bulk confirmation previews."""
        if selected_choices and not blocked_choices:
            return (
                f"Please confirm applying {len(selected_choices)} Stationary Energy "
                f"review choices. {pending_required_count} required choices would remain."
            )
        if selected_choices:
            return (
                f"Please confirm applying {len(selected_choices)} valid choices. "
                f"{len(blocked_choices)} requested choices need clarification first."
            )
        if blocked_choices:
            return "I could not prepare those choices. Please clarify the rows and sources."
        return "No unresolved recommended Stationary Energy choices are available."

    @staticmethod
    def _staged_change_confirmation_message(
        selected_choices: list[StationaryEnergyAgentReviewChoice],
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
    ) -> str:
        """Build a concise status message for staged-source change previews."""
        if selected_choices and not blocked_choices:
            return (
                f"Please confirm changing {len(selected_choices)} staged "
                "Stationary Energy source choices."
            )
        if selected_choices:
            return (
                f"Please confirm changing {len(selected_choices)} valid staged "
                f"choices. {len(blocked_choices)} choices need clarification first."
            )
        if blocked_choices:
            return "I could not prepare staged source changes for those rows."
        return (
            "No active staged Stationary Energy source choices are available to change."
        )

    @staticmethod
    def _staged_rollback_confirmation_message(
        selected_choices: list[StationaryEnergyAgentReviewChoice],
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
        pending_required_count: int,
    ) -> str:
        """Build a concise status message for staged-source rollback previews."""
        if selected_choices and not blocked_choices:
            return (
                f"Please confirm rolling back {len(selected_choices)} staged "
                f"Stationary Energy source choices. {pending_required_count} "
                "required choices would remain."
            )
        if selected_choices:
            return (
                f"Please confirm rolling back {len(selected_choices)} valid staged "
                f"choices. {len(blocked_choices)} choices need clarification first."
            )
        if blocked_choices:
            return "I could not prepare staged source rollbacks for those rows."
        return "No active staged Stationary Energy source choices are available to roll back."

    @staticmethod
    def _staged_rollback_result_message(
        selected_choices: list[StationaryEnergyAgentReviewChoice],
        blocked_choices: list[StationaryEnergyAgentReviewBlockedChoice],
        pending_required_count: int,
    ) -> str:
        """Build a concise status message after rolling back staged choices."""
        if selected_choices and not blocked_choices:
            return (
                f"Rolled back {len(selected_choices)} staged Stationary Energy "
                f"source choices. {pending_required_count} required choices remain."
            )
        if selected_choices:
            return (
                f"Rolled back {len(selected_choices)} staged choices and blocked "
                f"{len(blocked_choices)} invalid choices. "
                f"{pending_required_count} required choices remain."
            )
        if blocked_choices:
            return "No staged choices were rolled back because the requested rows were invalid."
        return "No active staged Stationary Energy source choices were available to roll back."
