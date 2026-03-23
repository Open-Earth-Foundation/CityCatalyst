"""Impact block for mitigation-focused scoring inputs."""

from __future__ import annotations

import logging

from app.modules.prioritizer.config import (
    IMPACT_WEIGHT_REDUCTION_SHARE,
    IMPACT_WEIGHT_TIMELINE,
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


def _read_emissions_entry(action: Action) -> dict[str, object] | None:
    """Return the emissions mitigation entry for one action if present."""
    emissions_entry = action.mitigation_impact.get("emissions")
    if emissions_entry is None:
        return None
    if not isinstance(emissions_entry, dict):
        logger.error(
            "Invalid mitigation_impact.emissions for action_id=%s: expected dict, got %s",
            action.action_id,
            type(emissions_entry).__name__,
        )
        raise ValueError(
            f"Invalid mitigation_impact.emissions for action_id={action.action_id}: "
            f"expected dict, got {type(emissions_entry).__name__}"
        )
    return emissions_entry


def _read_impact_text(*, action_id: str, emissions_entry: dict[str, object]) -> str:
    """Return validated impact text value for one action emissions entry."""
    raw_impact_text = emissions_entry.get("impact_text")
    if raw_impact_text is None or not str(raw_impact_text).strip():
        raise ValueError(
            f"Action `{action_id}` is missing mitigation_impact.emissions.impact_text"
        )
    return str(raw_impact_text)


def _compute_raw_impact_score(
    *, reduction_share_of_city_emissions: float, timeline_score: float
) -> float:
    """Combine reduction share and timeline score using configured Impact weights."""
    return (
        IMPACT_WEIGHT_REDUCTION_SHARE * reduction_share_of_city_emissions
        + IMPACT_WEIGHT_TIMELINE * timeline_score
    )


def _normalize_by_max(raw_score_by_action_id: dict[str, float]) -> dict[str, float]:
    """Normalize raw scores to 0..1 by dividing by max score in the run."""
    if not raw_score_by_action_id:
        return {}
    max_score = max(raw_score_by_action_id.values())
    if max_score <= 0.0:
        return {action_id: 0.0 for action_id in raw_score_by_action_id}
    return {
        action_id: raw_score / max_score
        for action_id, raw_score in raw_score_by_action_id.items()
    }


def run(
    actions: list[Action], city_emissions_by_gpc_ref: dict[str, float]
) -> BlockScoreResult:
    """
    Compute city-specific Impact block scores and explainability evidence.

    Inputs:
    - `actions`: Candidate actions after hard filtering.
    - `city_emissions_by_gpc_ref`: City emissions totals keyed by GPC reference.

    Outputs:
    - Max-normalized Impact scores in 0..1 for each action.
    - Per-action evidence including matched GPC refs, reduction share, timeline
      score, and the normalized Impact score.
    """

    raw_score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}
    total_city_emissions = sum(city_emissions_by_gpc_ref.values())

    for action in actions:
        # Step 1: Read and validate action emissions targeting fields.
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

        # Step 2: Match action target refs against city emissions keys.
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

        # Step 3: Build top-contributor evidence for matched GPC refs.
        top_contributors: list[dict[str, float | str]] = []
        for gpc_ref in matched_city_gpc_refs:
            gpc_city_emissions = city_emissions_by_gpc_ref[gpc_ref]
            reduction_amount = 0.0
            if reduction_multiplier is not None:
                reduction_amount = gpc_city_emissions * reduction_multiplier
            top_contributors.append(
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
        top_contributors.sort(
            key=lambda item: (
                -float(item["reduction_amount"]),
                str(item["gpc_ref"]),
            )
        )

        # Step 4: Combine reduction share with timeline and store raw score.
        timeline_score = resolve_timeline_score(action.implementation_timeline)
        impact_raw = _compute_raw_impact_score(
            reduction_share_of_city_emissions=reduction_share_of_city_emissions,
            timeline_score=timeline_score,
        )
        raw_score_by_action_id[action.action_id] = impact_raw
        evidence_by_action_id[action.action_id] = {
            "has_emissions_entry": emissions_entry is not None,
            "has_any_action_gpc_ref": len(action_gpc_refs) > 0,
            "action_gpc_refs": action_gpc_refs,
            "impact_text": impact_text,
            "reduction_multiplier": reduction_multiplier,
            "matched_city_gpc_refs_count": len(matched_city_gpc_refs),
            "matched_city_gpc_refs": matched_city_gpc_refs,
            "total_city_emissions": total_city_emissions,
            "total_reduction_amount": total_reduction_amount,
            "reduction_share_of_city_emissions": reduction_share_of_city_emissions,
            "timeline_bucket": action.implementation_timeline,
            "timeline_score": timeline_score,
            "timeline_bucket_known": action.implementation_timeline in {
                "<5 years",
                "5-10 years",
                ">10 years",
            },
            "impact_raw": impact_raw,
            "top_contributors": top_contributors,
        }

    # Step 5: Max-normalize per run and append normalized values to evidence.
    score_by_action_id = _normalize_by_max(raw_score_by_action_id)
    for action_id, score in score_by_action_id.items():
        evidence_by_action_id[action_id]["impact_normalized"] = score

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
    )
