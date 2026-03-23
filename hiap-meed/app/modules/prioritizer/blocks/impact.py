"""Impact block for mitigation-focused scoring inputs."""

from __future__ import annotations

import logging

from app.modules.prioritizer.config import (
    resolve_impact_text_multiplier,
    resolve_timeline_score,
)
from app.modules.prioritizer.internal_models import Action, BlockScoreResult


logger = logging.getLogger(__name__)


def _read_gpc_reference_numbers(
    *, action_id: str, emissions_entry: dict[str, object]
) -> list[str]:
    """Extract and deduplicate GPC reference numbers from one emissions entry dict."""
    ref_value = emissions_entry.get("gpc_reference_number")
    if not isinstance(ref_value, list):
        message = (
            "Invalid impact contract for action_id=%s: expected `gpc_reference_number` "
            "to be a list[str], got %s"
        )
        logger.error(message, action_id, type(ref_value).__name__)
        raise ValueError(message % (action_id, type(ref_value).__name__))
    refs = [str(item).strip() for item in ref_value if str(item).strip()]
    return list(dict.fromkeys(refs))


def run(actions: list[Action]) -> BlockScoreResult:
    """
    Compute stub impact scores and impact evidence.

    The initial scaffold returns 0.0 for all actions while preserving explainability
    metadata required by artifacts and downstream debugging.
    """

    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}

    for action in actions:
        emissions_entry = action.mitigation_impact.get("emissions")
        if emissions_entry is None:
            collected_refs = []
        elif not isinstance(emissions_entry, dict):
            logger.error(
                "Invalid mitigation_impact.emissions for action_id=%s: expected dict, got %s",
                action.action_id,
                type(emissions_entry).__name__,
            )
            raise ValueError(
                f"Invalid mitigation_impact.emissions for action_id={action.action_id}: "
                f"expected dict, got {type(emissions_entry).__name__}"
            )
        else:
            collected_refs = _read_gpc_reference_numbers(
                action_id=action.action_id, emissions_entry=emissions_entry
            )

        impact_text = (
            str(emissions_entry.get("impact_text"))
            if isinstance(emissions_entry, dict)
            and emissions_entry.get("impact_text") is not None
            else None
        )
        reduction_multiplier = (
            resolve_impact_text_multiplier(impact_text)
            if impact_text is not None
            else None
        )
        timeline_score = resolve_timeline_score(action.implementation_timeline)
        action_gpc_refs = list(dict.fromkeys(collected_refs))
        evidence_by_action_id[action.action_id] = {
            "has_emissions_entry": emissions_entry is not None,
            "has_any_action_gpc_ref": len(action_gpc_refs) > 0,
            "action_gpc_refs": action_gpc_refs,
            "impact_text": impact_text,
            "reduction_multiplier": reduction_multiplier,
            "timeline_bucket": action.implementation_timeline,
            "timeline_score": timeline_score,
        }
        score_by_action_id[action.action_id] = 0.0

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
