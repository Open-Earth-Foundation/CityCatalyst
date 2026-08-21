from __future__ import annotations

from typing import Any
from uuid import UUID

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyReviewDecision,
    StationaryEnergyStagedReviewSelection,
)
from app.models.stationary_energy_drafts import (
    DraftStatusSourceCandidate,
    DraftProposal,
    DraftStalenessResponse,
    ReviewDecisionResponse,
    SaveStationaryEnergyDraftResponse,
    StartStationaryEnergyDraftResponse,
    StagedReviewSelectionResponse,
    StationaryEnergyDraftListItemResponse,
    StationaryEnergyDraftStatusResponse,
    StoredSourceScope,
)
from app.services.stationary_energy.stationary_energy_draft_review import (
    latest_review_decisions,
)


def review_decision_sort_key(
    decision: StationaryEnergyReviewDecision,
) -> tuple[str, int, str]:
    """Return a stable sort key for review decision history ordering."""
    return (
        str(decision.proposal_id),
        decision.decision_version,
        str(decision.decision_id),
    )


def error_summary(draft_run: StationaryEnergyDraftRun) -> dict[str, Any] | None:
    """Return the stored error summary fragment from a draft context summary."""
    if not isinstance(draft_run.context_summary, dict):
        return None

    summary = draft_run.context_summary.get("error_summary")
    return summary if isinstance(summary, dict) else None


def to_draft_proposal(proposal: StationaryEnergyDraftProposal) -> DraftProposal:
    """Serialize a persisted draft proposal into the API response contract."""
    return DraftProposal(
        proposal_id=proposal.proposal_id,
        draft_run_id=proposal.draft_run_id,
        target_ref=proposal.target_ref or {},
        current_value=proposal.current_value,
        recommended_candidate_id=proposal.recommended_candidate_id,
        recommended_datasource_id=proposal.recommended_datasource_id,
        alternative_candidate_ids=proposal.alternative_candidate_ids or [],
        proposed_value=proposal.proposed_value,
        rationale=proposal.rationale,
        status=proposal.status,  # type: ignore[arg-type]
        confidence_score=proposal.confidence_score,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
    )


def to_status_source_candidate(
    candidate: StationaryEnergyDraftSourceCandidate,
) -> DraftStatusSourceCandidate:
    """Serialize only the source-candidate fields used by the review frontend."""
    source_data = candidate.source_data or {}
    return DraftStatusSourceCandidate(
        candidate_id=candidate.candidate_id,
        datasource_id=candidate.datasource_id,
        details_datasource_id=source_data.get("details_datasource_id"),
        name=candidate.name,
        publisher_name=candidate.publisher_name,
        dataset_name=candidate.dataset_name,
        dataset_year=candidate.dataset_year,
        geography_match=candidate.geography_match,  # type: ignore[arg-type]
        source_scope=StoredSourceScope.model_validate(candidate.source_scope or {}),
        normalized_rows=candidate.normalized_rows or [],
        applicability_status=candidate.applicability_status,  # type: ignore[arg-type]
        applicability_issues=candidate.applicability_issues or [],
        failure_reason=candidate.failure_reason,
    )


def to_review_decision_response(
    decision: StationaryEnergyReviewDecision,
) -> ReviewDecisionResponse:
    """Serialize a persisted review decision into the API response contract."""
    return ReviewDecisionResponse(
        decision_id=decision.decision_id,
        draft_run_id=decision.draft_run_id,
        proposal_id=decision.proposal_id,
        decision_version=decision.decision_version,
        user_id=decision.user_id,
        action=decision.action,
        selected_source_id=decision.selected_source_id,
        selected_candidate_id=decision.selected_candidate_id,
        manual_value=decision.manual_value,
        manual_unit=decision.manual_unit,
        notation_key=decision.notation_key,
        unavailable_reason=decision.unavailable_reason,
        unavailable_explanation=decision.unavailable_explanation,
        note=decision.note,
        commit_status=decision.commit_status,
        commit_response=decision.commit_response,
        created_at=decision.created_at,
        updated_at=decision.updated_at,
    )


def staged_selection_sort_key(
    selection: StationaryEnergyStagedReviewSelection,
) -> tuple[str, str]:
    """Return a stable sort key for staged selections."""
    return (str(selection.proposal_id), str(selection.selection_id))


def to_staged_review_selection_response(
    selection: StationaryEnergyStagedReviewSelection,
) -> StagedReviewSelectionResponse:
    """Serialize a staged tool selection into the API response contract."""
    return StagedReviewSelectionResponse(
        selection_id=selection.selection_id,
        draft_run_id=selection.draft_run_id,
        proposal_id=selection.proposal_id,
        user_id=selection.user_id,
        action=selection.action,
        selected_source_id=selection.selected_source_id,
        selected_candidate_id=selection.selected_candidate_id,
        notation_key=selection.notation_key,
        unavailable_reason=selection.unavailable_reason,
        unavailable_explanation=selection.unavailable_explanation,
        rationale=selection.rationale,
        tool_call_id=selection.tool_call_id,
        status=selection.status,
        created_at=selection.created_at,
        updated_at=selection.updated_at,
    )


def to_start_response(
    draft_run: StationaryEnergyDraftRun,
    *,
    status_override: str | None = None,
    proposals_override: list[StationaryEnergyDraftProposal] | None = None,
) -> StartStationaryEnergyDraftResponse:
    """Serialize a draft run into the start/retry response contract."""
    status = status_override or draft_run.status
    if status not in {"resolving_scope", "loading_context", "generating", "ready", "failed"}:
        status = "ready"

    proposals = (
        proposals_override if proposals_override is not None else draft_run.proposals
    )
    return StartStationaryEnergyDraftResponse(
        draft_run_id=draft_run.draft_run_id,
        thread_id=draft_run.thread_id,
        user_id=draft_run.user_id,
        city_id=draft_run.city_id,
        inventory_id=draft_run.inventory_id,
        sector_code="stationary_energy",
        status=status,  # type: ignore[arg-type]
        proposals=[
            to_draft_proposal(proposal)
            for proposal in sorted(proposals, key=lambda item: str(item.proposal_id))
        ],
        trace_id=draft_run.trace_id,
        error_summary=error_summary(draft_run),
    )


def to_status_response(
    draft_run: StationaryEnergyDraftRun,
    *,
    staleness: DraftStalenessResponse | None = None,
) -> StationaryEnergyDraftStatusResponse:
    """Serialize a draft run into the status response contract."""
    # Sort child collections for stable API payloads and deterministic tests.
    return StationaryEnergyDraftStatusResponse(
        draft_run_id=draft_run.draft_run_id,
        thread_id=draft_run.thread_id,
        user_id=draft_run.user_id,
        city_id=draft_run.city_id,
        inventory_id=draft_run.inventory_id,
        sector_code="stationary_energy",
        status=draft_run.status,
        workflow_step=draft_run.workflow_step,
        proposals=[
            to_draft_proposal(proposal)
            for proposal in sorted(
                draft_run.proposals,
                key=lambda item: str(item.proposal_id),
            )
        ],
        review_decisions=[
            to_review_decision_response(decision)
            for decision in sorted(
                draft_run.review_decisions,
                key=review_decision_sort_key,
            )
        ],
        staged_review_selections=[
            to_staged_review_selection_response(selection)
            for selection in sorted(
                draft_run.staged_review_selections,
                key=staged_selection_sort_key,
            )
            if selection.status == "active"
        ],
        source_candidates=[
            to_status_source_candidate(candidate)
            for candidate in sorted(
                draft_run.source_candidates,
                key=lambda item: str(item.candidate_id),
            )
        ],
        trace_id=draft_run.trace_id,
        error_summary=error_summary(draft_run),
        staleness=staleness,
        created_at=draft_run.created_at,
        updated_at=draft_run.updated_at,
    )


def to_list_item_response(
    draft_run: StationaryEnergyDraftRun,
) -> StationaryEnergyDraftListItemResponse:
    """Serialize a draft run into the scoped draft picker list shape."""
    # Count only source-backed proposals as reviewable work for the picker.
    reviewable_proposal_ids = {
        proposal.proposal_id
        for proposal in draft_run.proposals
        if proposal.recommended_candidate_id is not None
        or bool(proposal.alternative_candidate_ids)
    }
    # Treat active staged selections as resolved because they represent pending intent.
    decisions = latest_review_decisions(draft_run.review_decisions)
    staged_selection_ids = {
        selection.proposal_id
        for selection in draft_run.staged_review_selections
        if selection.status == "active"
    }
    resolved_review_count = sum(
        1
        for proposal_id in reviewable_proposal_ids
        if proposal_id in decisions or proposal_id in staged_selection_ids
    )
    # Count only decisions that still need the CityCatalyst commit step.
    staged_commit_count = sum(
        1
        for decision in decisions.values()
        if decision.commit_status in {"pending_cc_commit", "staged_manual"}
    )
    return StationaryEnergyDraftListItemResponse(
        draft_run_id=draft_run.draft_run_id,
        thread_id=draft_run.thread_id,
        status=draft_run.status,
        workflow_step=draft_run.workflow_step,
        reviewable_proposal_count=len(reviewable_proposal_ids),
        resolved_review_count=resolved_review_count,
        staged_commit_count=staged_commit_count,
        created_at=draft_run.created_at,
        updated_at=draft_run.updated_at,
    )


def to_save_response(
    draft_run: StationaryEnergyDraftRun,
    *,
    status_override: str | None = None,
) -> SaveStationaryEnergyDraftResponse:
    """Serialize a draft run into the save response contract."""
    status = status_override or draft_run.status
    if status not in {"saved", "partially_saved", "failed", "no_changes"}:
        status = "failed"

    return SaveStationaryEnergyDraftResponse(
        draft_run_id=draft_run.draft_run_id,
        user_id=draft_run.user_id,
        status=status,  # type: ignore[arg-type]
        decisions=[
            to_review_decision_response(decision)
            for decision in sorted(
                draft_run.review_decisions,
                key=review_decision_sort_key,
            )
        ],
    )
