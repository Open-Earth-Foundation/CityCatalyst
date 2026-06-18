"""Stationary Energy chat-context serialization helpers."""

from __future__ import annotations

import json
from typing import Any

from app.models.db.stationary_energy_draft import StationaryEnergyDraftRun
from app.models.requests import MessageCreateRequest


def build_stationary_energy_context_payload(
    draft_run: StationaryEnergyDraftRun,
) -> dict[str, Any]:
    """Build the persisted draft snapshot used to ground Stationary Energy chat."""
    context_summary = draft_run.context_summary or {}

    # Serialize the full CA-owned review snapshot with stable id strings.
    return {
        "draft_run": {
            "draft_run_id": str(draft_run.draft_run_id),
            "thread_id": str(draft_run.thread_id) if draft_run.thread_id else None,
            "city_id": draft_run.city_id,
            "inventory_id": draft_run.inventory_id,
            "sector_code": draft_run.sector_code,
            "status": draft_run.status,
            "workflow_step": draft_run.workflow_step,
            "trace_id": draft_run.trace_id,
            "created_at": draft_run.created_at,
            "updated_at": draft_run.updated_at,
        },
        "city": context_summary.get("city") if isinstance(context_summary, dict) else None,
        "inventory": (
            context_summary.get("inventory")
            if isinstance(context_summary, dict)
            else None
        ),
        "context_counts": {
            "taxonomy_count": (
                context_summary.get("taxonomy_count")
                if isinstance(context_summary, dict)
                else None
            ),
            "current_values_count": (
                context_summary.get("current_values_count")
                if isinstance(context_summary, dict)
                else None
            ),
            "source_candidates_count": (
                context_summary.get("source_candidates_count")
                if isinstance(context_summary, dict)
                else None
            ),
        },
        "permission_summary": draft_run.permission_summary,
        "guidance_context": (
            context_summary.get("guidance_context")
            if isinstance(context_summary, dict)
            else None
        ),
        "source_candidates": [
            {
                "candidate_id": str(candidate.candidate_id),
                "datasource_id": candidate.datasource_id,
                "name": candidate.name,
                "publisher_name": candidate.publisher_name,
                "retrieval_method": candidate.retrieval_method,
                "dataset_name": candidate.dataset_name,
                "dataset_year": candidate.dataset_year,
                "url": candidate.url,
                "geography_match": candidate.geography_match,
                "source_scope": candidate.source_scope,
                "source_data": candidate.source_data,
                "normalized_rows": candidate.normalized_rows,
                "applicability_status": candidate.applicability_status,
                "applicability_issues": candidate.applicability_issues,
                "failure_reason": candidate.failure_reason,
                "quality_score": candidate.quality_score,
                "confidence_notes": candidate.confidence_notes,
            }
            for candidate in draft_run.source_candidates
        ],
        "proposals": [
            {
                "proposal_id": str(proposal.proposal_id),
                "target_ref": proposal.target_ref,
                "current_value": proposal.current_value,
                "recommended_candidate_id": (
                    str(proposal.recommended_candidate_id)
                    if proposal.recommended_candidate_id
                    else None
                ),
                "recommended_datasource_id": proposal.recommended_datasource_id,
                "alternative_candidate_ids": proposal.alternative_candidate_ids,
                "proposed_value": proposal.proposed_value,
                "rationale": proposal.rationale,
                "status": proposal.status,
                "confidence_score": proposal.confidence_score,
            }
            for proposal in draft_run.proposals
        ],
        "review_decisions": [
            {
                "decision_id": str(decision.decision_id),
                "proposal_id": str(decision.proposal_id),
                "decision_version": decision.decision_version,
                "action": decision.action,
                "selected_source_id": decision.selected_source_id,
                "selected_candidate_id": (
                    str(decision.selected_candidate_id)
                    if decision.selected_candidate_id
                    else None
                ),
                "manual_value": decision.manual_value,
                "manual_unit": decision.manual_unit,
                "note": decision.note,
                "commit_status": decision.commit_status,
                "commit_response": decision.commit_response,
                "created_at": decision.created_at,
            }
            for decision in sorted(
                draft_run.review_decisions,
                key=lambda item: (
                    str(item.proposal_id),
                    item.decision_version,
                    str(item.decision_id),
                ),
            )
        ],
        "staged_review_selections": [
            {
                "selection_id": str(selection.selection_id),
                "proposal_id": str(selection.proposal_id),
                "action": selection.action,
                "selected_source_id": selection.selected_source_id,
                "selected_candidate_id": (
                    str(selection.selected_candidate_id)
                    if selection.selected_candidate_id
                    else None
                ),
                "rationale": selection.rationale,
                "tool_call_id": selection.tool_call_id,
                "status": selection.status,
                "created_at": selection.created_at,
            }
            for selection in sorted(
                draft_run.staged_review_selections,
                key=lambda item: (
                    str(item.proposal_id),
                    str(item.selection_id),
                ),
            )
            if selection.status == "active"
        ],
    }


def build_stationary_energy_ui_context(
    payload: MessageCreateRequest,
) -> dict[str, Any] | None:
    """Extract UI focus and confirmation context from the request payload."""
    # Normalize request containers so missing context/options behave like empty maps.
    request_context = payload.context if isinstance(payload.context, dict) else {}
    request_options = payload.options if isinstance(payload.options, dict) else {}
    focused_proposal_id = request_context.get(
        "stationary_energy_focused_proposal_id"
    ) or request_options.get("stationary_energy_focused_proposal_id")
    focused_decision_state = request_context.get(
        "stationary_energy_focused_decision_state"
    )
    if not isinstance(focused_decision_state, dict):
        focused_decision_state = None
    pending_reviews = request_context.get("stationary_energy_pending_decision_reviews")
    if not isinstance(pending_reviews, list):
        pending_reviews = []

    # Find the detailed pending-review row that matches the visible pane.
    focused_review = None
    if focused_proposal_id:
        focused_review = next(
            (
                review
                for review in pending_reviews
                if isinstance(review, dict)
                and str(review.get("proposal_id")) == str(focused_proposal_id)
            ),
            None,
        )

    confirmed_bulk_choices = request_context.get(
        "stationary_energy_confirmed_bulk_review_choices"
    )
    if not isinstance(confirmed_bulk_choices, list):
        confirmed_bulk_choices = []
    confirmed_rollback_choices = request_context.get(
        "stationary_energy_confirmed_staged_review_rollback_choices"
    )
    if not isinstance(confirmed_rollback_choices, list):
        confirmed_rollback_choices = []

    # Preserve the explicit UI count when the request sent one.
    pending_count = request_options.get("stationary_energy_pending_decision_review_count")
    if pending_count is None:
        pending_count = len(pending_reviews)

    ui_context = {
        "focused_proposal_id": str(focused_proposal_id) if focused_proposal_id else None,
        "focused_decision_review": focused_review,
        "focused_decision_state": focused_decision_state,
        "pending_decision_review_count": pending_count,
        "confirmed_bulk_review_choices": confirmed_bulk_choices,
        "confirmed_staged_review_rollback_choices": confirmed_rollback_choices,
    }

    # Omit empty UI context so generic chats do not receive irrelevant metadata.
    if any(value for value in ui_context.values()):
        return ui_context
    return None


def format_stationary_energy_context_message(
    context_payload: dict[str, Any],
) -> dict[str, str]:
    """Format the persisted Stationary Energy context as a system message."""
    return {
        "role": "system",
        "content": (
            "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\n"
            f"{json.dumps(context_payload, ensure_ascii=False, default=str)}\n"
            "Use this authoritative persisted CA draft snapshot to explain the Stationary Energy "
            "screen the user is viewing. Do not re-fetch data. Do not invent missing values. "
            "Treat source_candidates, proposals, review_decisions, and guidance_context "
            "as the ground truth for this draft. If ui_context.focused_proposal_id is present, "
            "it is the current right-side Source review decision visible to the user. "
            "If ui_context.focused_decision_state is present, it is the action currently "
            "selected in that right-side pane. "
            "If ui_context.confirmed_staged_review_rollback_choices is present, "
            "it is the exact set of staged source choices the user approved for rollback."
        ),
    }


def build_minimal_stationary_energy_context_payload(
    context_payload: dict[str, Any],
    *,
    initial_tokens: int,
    compacted_tokens: int,
    max_prompt_tokens: int,
) -> dict[str, Any]:
    """Build a compact context payload for prompt budget fallback."""
    # Keep only routing and user-facing summary fields in the final fallback.
    return {
        "draft_run": context_payload.get("draft_run"),
        "city": context_payload.get("city"),
        "inventory": context_payload.get("inventory"),
        "context_counts": context_payload.get("context_counts"),
        "permission_summary": context_payload.get("permission_summary"),
        "guidance_context": context_payload.get("guidance_context"),
        "ui_context": context_payload.get("ui_context"),
        "prompt_budget_compaction": {
            "minimal_snapshot": True,
            "initial_tokens": initial_tokens,
            "compacted_tokens": compacted_tokens,
            "max_prompt_tokens": max_prompt_tokens,
            "omitted_fields": [
                "source_candidates",
                "proposals",
                "review_decisions",
            ],
        },
    }
