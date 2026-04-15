"""
Impact block that scores expected emissions-reduction benefit for each action.

Plain-language approach:
- Find which city emission sources an action targets (via GPC references).
- Estimate potential reduction from those sources (using impact text band mapping).
- Add a timeline component so faster implementation can score higher.
- Combine reduction + timeline with fixed weights into one final Impact score.

Final score formula per action:
- `impact_block_score = (reduction_weight * reduction_component_value)`
- `+ (timeline_weight * timeline_component_value)`
"""

from __future__ import annotations

import logging

from app.modules.prioritizer.config import (
    IMPACT_DEFAULT_TIMELINE_SCORE,
    IMPACT_TIMELINE_TO_SCORE,
    IMPACT_WEIGHT_REDUCTION_SHARE,
    IMPACT_WEIGHT_TIMELINE,
    resolve_impact_text_multiplier,
    validate_block_component_weights,
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


def _read_emissions_entry(action: Action) -> dict[str, object] | None:
    """Return the emissions mitigation entry for one action if present."""
    emissions_entry = action.emissions
    if not emissions_entry:
        return None
    if not isinstance(emissions_entry, dict):
        logger.error(
            "Invalid emissions contract for action_id=%s: expected dict, got %s",
            action.action_id,
            type(emissions_entry).__name__,
        )
        raise ValueError(
            f"Invalid emissions contract for action_id={action.action_id}: "
            f"expected dict, got {type(emissions_entry).__name__}"
        )
    return emissions_entry


def _read_impact_text(*, action_id: str, emissions_entry: dict[str, object]) -> str:
    """Return validated impact text value for one action emissions entry."""
    raw_impact_text = emissions_entry.get("impact_text")
    if raw_impact_text is None or not str(raw_impact_text).strip():
        raise ValueError(
            f"Action `{action_id}` is missing emissions.impact_text"
        )
    return str(raw_impact_text)


def _compute_impact_block_score(
    *, reduction_share_of_city_emissions: float, timeline_score: float
) -> float:
    """Combine reduction and timeline components into the final Impact block score."""
    return (
        IMPACT_WEIGHT_REDUCTION_SHARE * reduction_share_of_city_emissions
        + IMPACT_WEIGHT_TIMELINE * timeline_score
    )


def _resolve_timeline_score(timeline: str | None) -> float:
    """Resolve Impact timeline component score from configured timeline mapping."""
    if timeline is None:
        return IMPACT_DEFAULT_TIMELINE_SCORE
    return IMPACT_TIMELINE_TO_SCORE.get(timeline, IMPACT_DEFAULT_TIMELINE_SCORE)


def run(
    actions: list[Action], city_emissions_by_gpc_ref: dict[str, float]
) -> BlockScoreResult:
    """
    Compute Impact scores and explainability evidence for all candidate actions.

    Inputs:
    - `actions`: Candidate actions after hard filtering.
    - `city_emissions_by_gpc_ref`: City emissions totals keyed by GPC reference.

    Outputs:
    - `score_by_action_id`: final Impact score per action in `[0,1]`.
    - `evidence_by_action_id`: component values, weighted contributions, and
      matched-emissions diagnostics used to explain each score.
    """
    # Block 1: Validate scoring configuration and initialize output containers.
    validate_block_component_weights()
    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}
    total_city_emissions = sum(city_emissions_by_gpc_ref.values())

    for action in actions:
        # Block 2: Read and validate action emissions targeting metadata.
        emissions_entry = _read_emissions_entry(action)
        action_gpc_refs: list[str] = []
        impact_text: str | None = None
        reduction_multiplier: float | None = None
        if emissions_entry is not None:
            action_gpc_refs = _read_gpc_reference_numbers(
                action_id=action.action_id,
                emissions_entry=emissions_entry,
            )
            impact_text = _read_impact_text(
                action_id=action.action_id,
                emissions_entry=emissions_entry,
            )
            reduction_multiplier = resolve_impact_text_multiplier(impact_text)

        # Block 3: Estimate reduction component from matched city emissions.
        matched_city_gpc_refs: list[str] = []
        if reduction_multiplier is not None:
            matched_city_gpc_refs = [
                gpc_ref
                for gpc_ref in action_gpc_refs
                if gpc_ref in city_emissions_by_gpc_ref
            ]
        total_reduction_amount = 0.0
        if reduction_multiplier is not None:
            total_reduction_amount = sum(
                city_emissions_by_gpc_ref[gpc_ref] * reduction_multiplier
                for gpc_ref in matched_city_gpc_refs
            )
        reduction_share_of_city_emissions = (
            total_reduction_amount / total_city_emissions
            if total_city_emissions > 0.0
            else 0.0
        )

        # Block 4: Build per-source reduction evidence for explainability.
        gpc_contributors: list[dict[str, float | str]] = []
        for gpc_ref in matched_city_gpc_refs:
            gpc_city_emissions = city_emissions_by_gpc_ref[gpc_ref]
            reduction_amount = 0.0
            if reduction_multiplier is not None:
                reduction_amount = gpc_city_emissions * reduction_multiplier
            gpc_contributors.append(
                {
                    "gpc_ref": gpc_ref,
                    "city_emissions": gpc_city_emissions,
                    "share_of_city": (
                        gpc_city_emissions / total_city_emissions
                        if total_city_emissions > 0.0
                        else 0.0
                    ),
                    "reduction_amount": reduction_amount,
                }
            )
        gpc_contributors.sort(
            key=lambda item: (
                -float(item["reduction_amount"]),
                str(item["gpc_ref"]),
            )
        )

        # Block 5: Compute weighted reduction contribution.
        reduction_component_contribution = (
            IMPACT_WEIGHT_REDUCTION_SHARE * reduction_share_of_city_emissions
        )

        # Block 6: Compute weighted timeline contribution.
        timeline_score = _resolve_timeline_score(action.implementation_timeline)
        timeline_component_contribution = IMPACT_WEIGHT_TIMELINE * timeline_score

        # Block 7: Assemble final Impact block score.
        impact_block_score = _compute_impact_block_score(
            reduction_share_of_city_emissions=reduction_share_of_city_emissions,
            timeline_score=timeline_score,
        )
        score_by_action_id[action.action_id] = impact_block_score

        # Block 8: Store action-level explainability payload.
        evidence_by_action_id[action.action_id] = {
            "has_emissions_entry": emissions_entry is not None,
            "has_any_action_gpc_ref": len(action_gpc_refs) > 0,
            "action_gpc_refs": action_gpc_refs,
            "impact_text": impact_text,
            "reduction_multiplier": reduction_multiplier,
            "timeline_bucket": action.implementation_timeline,
            "timeline_bucket_known": action.implementation_timeline in {
                "<5 years",
                "5-10 years",
                ">10 years",
            },
            "timeline_score": timeline_score,
            "matched_city_gpc_refs_count": len(matched_city_gpc_refs),
            "matched_city_gpc_refs": matched_city_gpc_refs,
            "total_city_emissions": total_city_emissions,
            "total_reduction_amount": total_reduction_amount,
            "reduction_share_of_city_emissions": reduction_share_of_city_emissions,
            "reduction_component_value": reduction_share_of_city_emissions,
            "timeline_component_value": timeline_score,
            "reduction_component_contribution": reduction_component_contribution,
            "timeline_component_contribution": timeline_component_contribution,
            "impact_block_score": impact_block_score,
            "gpc_contributors": gpc_contributors,
        }

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
