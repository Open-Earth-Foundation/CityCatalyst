from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyReviewDecision,
)
from app.models.stationary_energy_drafts import ReviewDecisionInput
from app.utils.stationary_energy_context import (
    stationary_energy_scope_label,
    stationary_energy_scope_matches_target,
)


def latest_review_decisions(
    decisions: list[StationaryEnergyReviewDecision],
) -> dict[UUID, StationaryEnergyReviewDecision]:
    """Return only the latest saved review decision for each proposal id."""
    latest: dict[UUID, StationaryEnergyReviewDecision] = {}
    for decision in sorted(
        decisions,
        key=lambda item: (
            str(item.proposal_id),
            item.decision_version,
            str(item.decision_id),
        ),
    ):
        latest[decision.proposal_id] = decision
    return latest


def resolve_selected_candidate(
    decision_input: ReviewDecisionInput,
    candidate_by_id: dict[str, StationaryEnergyDraftSourceCandidate],
    candidate_by_datasource: dict[str, StationaryEnergyDraftSourceCandidate],
) -> StationaryEnergyDraftSourceCandidate | None:
    """Resolve an override_source decision to the stored candidate snapshot."""
    if decision_input.action != "override_source":
        return None
    if not decision_input.selected_source_id:
        raise HTTPException(
            status_code=400,
            detail="selected_source_id is required for override_source",
        )

    selected = (
        candidate_by_id.get(decision_input.selected_source_id)
        or candidate_by_datasource.get(decision_input.selected_source_id)
    )
    if selected is None:
        raise HTTPException(
            status_code=400,
            detail="selected_source_id must match a stored candidate for this draft",
        )
    return selected


def validate_review_action(
    decision_input: ReviewDecisionInput,
    proposal: StationaryEnergyDraftProposal,
    selected_candidate: StationaryEnergyDraftSourceCandidate | None,
) -> None:
    """Validate a review decision against the stored proposal and candidate scope."""
    if decision_input.action == "accept" and proposal.recommended_candidate_id is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot accept a proposal without a recommended source candidate",
        )
    if (
        decision_input.action == "accept"
        and proposal.recommended_datasource_id is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot accept a proposal without a recommended datasource",
        )
    if decision_input.action == "override_source" and selected_candidate is None:
        raise HTTPException(
            status_code=400,
            detail="selected_source_id must match a stored candidate for this draft",
        )
    if (
        decision_input.action == "override_source"
        and selected_candidate is not None
        and selected_candidate.applicability_status != "applicable"
    ):
        raise HTTPException(
            status_code=400,
            detail="selected_source_id must match an applicable stored candidate",
        )
    if (
        decision_input.action == "override_source"
        and selected_candidate is not None
        and not stationary_energy_scope_matches_target(
            target_ref=proposal.target_ref,
            source_scope=selected_candidate.source_scope,
        )
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "selected_source_id must match the proposal target scope "
                f"({stationary_energy_scope_label(proposal.target_ref)})"
            ),
        )
    if (
        decision_input.action == "override_manual"
        and decision_input.manual_value is None
    ):
        raise HTTPException(
            status_code=400,
            detail="manual_value is required for override_manual",
        )
    if (
        decision_input.action == "override_manual"
        and not decision_input.manual_unit
    ):
        raise HTTPException(
            status_code=400,
            detail="manual_unit is required for override_manual",
        )


def validate_complete_review_decisions(
    decisions: list[ReviewDecisionInput],
    proposal_by_id: dict[UUID, StationaryEnergyDraftProposal],
) -> None:
    """Require one and only one review decision for every proposal in the draft."""
    if not proposal_by_id:
        raise HTTPException(
            status_code=400,
            detail="Draft has no proposals to review",
        )
    if not decisions:
        raise HTTPException(
            status_code=400,
            detail="Review decisions must cover every proposal",
        )

    proposal_ids = set(proposal_by_id)
    seen: set[UUID] = set()
    duplicates: set[UUID] = set()
    unknown: set[UUID] = set()
    for decision in decisions:
        if decision.proposal_id in seen:
            duplicates.add(decision.proposal_id)
        seen.add(decision.proposal_id)
        if decision.proposal_id not in proposal_ids:
            unknown.add(decision.proposal_id)

    if duplicates:
        raise HTTPException(
            status_code=400,
            detail="Each proposal can only have one review decision",
        )
    if unknown:
        raise HTTPException(
            status_code=400,
            detail="Review decision proposal_id must belong to this draft",
        )
    if seen != proposal_ids:
        raise HTTPException(
            status_code=400,
            detail="Review decisions must cover every proposal",
        )


def build_review_decisions(
    *,
    draft_run_id: UUID,
    user_id: str,
    decisions: list[ReviewDecisionInput],
    proposal_by_id: dict[UUID, StationaryEnergyDraftProposal],
    candidate_by_id: dict[str, StationaryEnergyDraftSourceCandidate],
    candidate_by_datasource: dict[str, StationaryEnergyDraftSourceCandidate],
    next_review_versions: dict[UUID, int],
) -> list[StationaryEnergyReviewDecision]:
    """Build validated persisted review decisions and update proposal statuses in place."""
    review_decisions: list[StationaryEnergyReviewDecision] = []
    for decision_input in decisions:
        proposal = proposal_by_id.get(decision_input.proposal_id)
        if proposal is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Proposal {decision_input.proposal_id} does not belong to this draft"
                ),
            )

        selected_candidate = resolve_selected_candidate(
            decision_input,
            candidate_by_id,
            candidate_by_datasource,
        )
        validate_review_action(decision_input, proposal, selected_candidate)

        review_decisions.append(
            StationaryEnergyReviewDecision(
                draft_run_id=draft_run_id,
                proposal_id=proposal.proposal_id,
                decision_version=next_review_versions.get(proposal.proposal_id, 1),
                user_id=user_id,
                action=decision_input.action,
                selected_source_id=selected_source_id_for_storage(
                    decision_input,
                    proposal,
                    selected_candidate,
                ),
                selected_candidate_id=selected_candidate_id_for_storage(
                    decision_input,
                    proposal,
                    selected_candidate,
                ),
                manual_value=decision_input.manual_value,
                manual_unit=decision_input.manual_unit,
                note=decision_input.note,
                commit_status=commit_status_for_action(decision_input.action),
                commit_response=commit_response_for_action(decision_input.action),
            )
        )
        apply_proposal_status(proposal, decision_input.action)

    return review_decisions


def commit_status_for_action(action: str) -> str:
    """Map a review action to its initial save/commit status."""
    if action in {"accept", "override_source", "override_manual"}:
        return "pending_cc_commit"
    return "not_applicable"


def commit_response_for_action(action: str) -> dict[str, Any] | None:
    """Build the initial commit response placeholder for review actions."""
    if action in {"accept", "override_source", "override_manual"}:
        return {
            "state": "pending",
            "reason": "Awaiting the CC save step for final inventory commit.",
        }
    return None


def apply_proposal_status(
    proposal: StationaryEnergyDraftProposal,
    action: str,
) -> None:
    """Update the persisted proposal status after a review decision is saved."""
    status_by_action = {
        "accept": "accepted",
        "override_source": "overridden",
        "override_manual": "overridden",
        "leave_draft": "left_draft",
    }
    proposal.status = status_by_action[action]
    proposal.updated_at = datetime.now(timezone.utc)


def selected_source_id_for_storage(
    decision_input: ReviewDecisionInput,
    proposal: StationaryEnergyDraftProposal,
    selected_candidate: StationaryEnergyDraftSourceCandidate | None,
) -> str | None:
    """Resolve which source id should be stored for a saved review decision."""
    if decision_input.action == "accept":
        return proposal.recommended_datasource_id
    if decision_input.action != "override_source" or selected_candidate is None:
        return decision_input.selected_source_id
    return selected_candidate.datasource_id


def selected_candidate_id_for_storage(
    decision_input: ReviewDecisionInput,
    proposal: StationaryEnergyDraftProposal,
    selected_candidate: StationaryEnergyDraftSourceCandidate | None,
) -> UUID | None:
    """Resolve which stored candidate id should be saved with a review decision."""
    if decision_input.action == "accept":
        return proposal.recommended_candidate_id
    return selected_candidate.candidate_id if selected_candidate else None


def build_commit_rows(
    *,
    pending_decisions: list[StationaryEnergyReviewDecision],
    proposal_by_id: dict[UUID, StationaryEnergyDraftProposal],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build the CityCatalyst commit payload rows and any local failure results."""
    rows: list[dict[str, Any]] = []
    local_results: list[dict[str, Any]] = []
    for decision in pending_decisions:
        proposal = proposal_by_id.get(decision.proposal_id)
        if proposal is None:
            local_results.append(
                local_failed_commit_result(
                    decision=decision,
                    reason="Proposal snapshot is missing from this draft run.",
                )
            )
            continue

        if decision.action == "override_manual":
            if decision.manual_value is None:
                local_results.append(
                    local_failed_commit_result(
                        decision=decision,
                        reason="Manual override is missing manual_value.",
                    )
                )
                continue
            if not decision.manual_unit:
                local_results.append(
                    local_failed_commit_result(
                        decision=decision,
                        reason="Manual override is missing manual_unit.",
                    )
                )
                continue

            rows.append(
                {
                    "row_type": "manual_override",
                    "proposal_id": str(decision.proposal_id),
                    "decision_version": decision.decision_version,
                    "target_ref": proposal.target_ref or {},
                    "manual_value": float(decision.manual_value),
                    "manual_unit": decision.manual_unit,
                    "note": decision.note,
                }
            )
            continue

        selected_source_id = (
            decision.selected_source_id or proposal.recommended_datasource_id
        )
        if not selected_source_id:
            local_results.append(
                local_failed_commit_result(
                    decision=decision,
                    reason=(
                        "No selected source is available for this reviewed proposal."
                    ),
                )
            )
            continue

        rows.append(
            {
                "row_type": "selected_source",
                "proposal_id": str(decision.proposal_id),
                "decision_version": decision.decision_version,
                "target_ref": proposal.target_ref or {},
                "selected_source_id": selected_source_id,
            }
        )
    return rows, local_results


def commit_result_key(result: dict[str, Any]) -> tuple[str, int] | None:
    """Build a stable lookup key for a commit result payload."""
    proposal_id = result.get("proposal_id")
    decision_version = result.get("decision_version")
    if proposal_id is None or decision_version is None:
        return None
    try:
        return str(proposal_id), int(decision_version)
    except (TypeError, ValueError):
        return None


def local_failed_commit_result(
    *,
    decision: StationaryEnergyReviewDecision,
    reason: str,
) -> dict[str, Any]:
    """Build a synthetic failed commit result for local validation failures."""
    return {
        "proposal_id": str(decision.proposal_id),
        "decision_version": decision.decision_version,
        "selected_source_id": decision.selected_source_id,
        "status": "failed",
        "error": reason,
    }


def apply_commit_results_to_decisions(
    *,
    pending_decisions: list[StationaryEnergyReviewDecision],
    results_by_key: dict[tuple[str, int], dict[str, Any]],
) -> None:
    """Persist commit result statuses back onto the latest pending decisions."""
    for decision in pending_decisions:
        result = results_by_key.get((str(decision.proposal_id), decision.decision_version))
        if result is None:
            result = local_failed_commit_result(
                decision=decision,
                reason="CityCatalyst did not return a result for this reviewed proposal.",
            )
        decision.commit_status = str(result.get("status") or "failed")
        decision.commit_response = result
        decision.updated_at = datetime.now(timezone.utc)


def save_status_after_commit(
    *,
    latest_decisions: dict[UUID, StationaryEnergyReviewDecision],
    attempted: list[StationaryEnergyReviewDecision],
) -> str:
    """Summarize the final draft save status from the latest review commit states."""
    if not attempted:
        return "no_changes"

    latest_statuses = {decision.commit_status for decision in latest_decisions.values()}
    committed_statuses = {"committed", "skipped_duplicate_source"}
    if latest_statuses and latest_statuses.issubset(
        committed_statuses | {"not_applicable"}
    ):
        return "saved"
    if latest_statuses & committed_statuses:
        return "partially_saved"
    if "failed" in latest_statuses:
        return "failed"
    return "no_changes"
