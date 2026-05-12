"""
Impact block that scores expected emissions-reduction benefit for each action.

Plain-language approach:
- Match each action to city emissions at true `sector.subsector` level.
- Estimate potential reduction from those matched subsectors.
- Add a timeline component so faster implementation can score higher.
- Keep a guarded placeholder for future activity-data-level refinement.

Final score formula per action:
- `impact_block_score = (reduction_weight * emissions_reduction_share_of_city_total)`
- `+ (timeline_weight * timeline_component_score)`
"""

from __future__ import annotations

import logging

from app.modules.prioritizer.config import (
    IMPACT_DEFAULT_TIMELINE_SCORE,
    IMPACT_TIMELINE_TO_SCORE,
    IMPACT_WEIGHT_REDUCTION_SHARE,
    IMPACT_WEIGHT_TIMELINE,
    is_activity_data_level_mapping_enabled,
    resolve_impact_text_multiplier,
    validate_block_component_weights,
)
from app.modules.prioritizer.internal_models import (
    Action,
    BlockScoreResult,
    CityActivityRow,
    CityEmissionsContext,
)
from app.modules.prioritizer.utils.subsector_mapping import (
    resolve_action_subsector_keys,
)


logger = logging.getLogger(__name__)


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


def _read_action_subsector_keys(
    *, action_id: str, emissions_entry: dict[str, object]
) -> list[str]:
    """Return the active true-subsector join keys from one action emissions entry."""
    sector_number = emissions_entry.get("sector_number")
    subsector_numbers = emissions_entry.get("subsector_number")

    if not isinstance(sector_number, str):
        raise ValueError(
            f"Action `{action_id}` is missing emissions.sector_number string"
        )
    if not isinstance(subsector_numbers, list):
        raise ValueError(
            f"Action `{action_id}` is missing emissions.subsector_number list[int]"
        )

    normalized_subsector_numbers = [int(value) for value in subsector_numbers]
    return resolve_action_subsector_keys(
        sector_number=sector_number,
        subsector_numbers=normalized_subsector_numbers,
    )


def _read_impact_band(*, action_id: str, emissions_entry: dict[str, object]) -> str:
    """Return the validated categorical impact band for one action emissions entry."""
    raw_impact_band = emissions_entry.get("impact_text")
    if raw_impact_band is None or not str(raw_impact_band).strip():
        raise ValueError(f"Action `{action_id}` is missing emissions.impact_text")
    return str(raw_impact_band)


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


def _has_activity_type(activity_row: CityActivityRow) -> bool:
    """Return whether one city activity row has a non-null activityType value."""
    return activity_row.activity_type is not None


def _resolve_action_text_source(action: Action) -> tuple[str, str | None]:
    """Choose the future activity-mapping text source for one action."""
    if action.activity_type_description and action.activity_type_description.strip():
        return "activity_type_description", action.activity_type_description.strip()
    if action.description and action.description.strip():
        logger.warning(
            "Missing action activity_type_description action_id=%s; future mapping would fall back to description",
            action.action_id,
        )
        return "description", action.description.strip()
    logger.warning(
        "Missing action activity_type_description and description action_id=%s",
        action.action_id,
    )
    return "missing", None


def _collect_activity_data_level_mapping_stub_metadata(
    *,
    city_activity_rows: list[CityActivityRow],
    candidate_action_ids_by_subsector_key: dict[str, list[str]],
    action_lookup: dict[str, Action],
    matched_subsector_keys_by_action_id: dict[str, list[str]],
) -> dict[str, object]:
    """
    Return no-op stub diagnostics without changing subsector matches or ranking.

    Future intended logic:
    - compare each city `activityType` against action `activity_type_description`
    - if `activity_type_description` is missing, fall back to action `description`
    - retain only activity-to-action matches that pass that semantic check
    """
    logger.warning(
        "ACTIVITY_DATA_LEVEL_MAPPING is enabled but activity-data-level mapping is not implemented yet; using subsector-only matches"
    )

    warnings: list[str] = [
        "ACTIVITY_DATA_LEVEL_MAPPING enabled but not implemented; using subsector-only matches."
    ]
    action_text_sources_by_action_id: dict[str, dict[str, str | None]] = {}
    activity_row_candidates: list[dict[str, object]] = []

    # Build future-facing candidate diagnostics while keeping the active path unchanged.
    for activity_row in city_activity_rows:
        candidate_action_ids = candidate_action_ids_by_subsector_key.get(
            activity_row.sector_subsector_key, []
        )
        has_activity_type = _has_activity_type(activity_row)
        if not has_activity_type:
            warning_message = (
                "City activity row missing activityType; only subsector matching is possible "
                f"for sector_subsector_key={activity_row.sector_subsector_key}"
            )
            logger.warning(warning_message)
            warnings.append(warning_message)

        for action_id in candidate_action_ids:
            if action_id in action_text_sources_by_action_id:
                continue
            text_source, text_value = _resolve_action_text_source(action_lookup[action_id])
            action_text_sources_by_action_id[action_id] = {
                "source": text_source,
                "text": text_value,
            }

        activity_row_candidates.append(
            {
                "sector_subsector_key": activity_row.sector_subsector_key,
                "activity_type": activity_row.activity_type,
                "candidate_action_ids": candidate_action_ids,
                "mapping_skipped_reason": (
                    "missing_activity_type"
                    if not has_activity_type
                    else "stub_not_implemented"
                ),
            }
        )

    return {
        "activity_data_level_mapping_enabled": True,
        "stub_invoked": True,
        "matching_mode": "subsector_only_stubbed_activity_mapping",
        "warnings": warnings,
        "candidate_action_ids_by_subsector_key": candidate_action_ids_by_subsector_key,
        "action_text_sources_by_action_id": action_text_sources_by_action_id,
        "activity_row_candidates": activity_row_candidates,
        "matched_subsector_keys_by_action_id": matched_subsector_keys_by_action_id,
    }


def run(actions: list[Action], city_emissions_context: CityEmissionsContext) -> BlockScoreResult:
    """
    Compute Impact scores and explainability evidence for all candidate actions.

    Inputs:
    - `actions`: Candidate actions after hard filtering.
    - `city_emissions_context`: City subsector totals plus preserved activity rows.

    Outputs:
    - `score_by_action_id`: final Impact score per action in `[0,1]`.
    - `evidence_by_action_id`: component values, weighted contributions, and
      matched-emissions diagnostics used to explain each score.
    """
    # Block 1: Validate scoring configuration and initialize output containers.
    validate_block_component_weights()
    score_by_action_id: dict[str, float] = {}
    evidence_by_action_id: dict[str, dict[str, object]] = {}
    city_emissions_by_subsector_key = city_emissions_context.emissions_by_subsector_key
    total_city_emissions = sum(city_emissions_by_subsector_key.values())
    activity_data_level_mapping_enabled = is_activity_data_level_mapping_enabled()

    prepared_actions: dict[str, dict[str, object]] = {}
    candidate_action_ids_by_subsector_key: dict[str, list[str]] = {}

    # Block 2: Read action targeting metadata and resolve true subsector candidates.
    for action in actions:
        emissions_entry = _read_emissions_entry(action)
        action_subsector_keys: list[str] = []
        impact_band: str | None = None
        reduction_multiplier: float | None = None

        if emissions_entry is not None:
            action_subsector_keys = _read_action_subsector_keys(
                action_id=action.action_id,
                emissions_entry=emissions_entry,
            )
            impact_band = _read_impact_band(
                action_id=action.action_id,
                emissions_entry=emissions_entry,
            )
            reduction_multiplier = resolve_impact_text_multiplier(impact_band)

        matched_city_subsector_keys: list[str] = []
        if reduction_multiplier is not None:
            matched_city_subsector_keys = [
                subsector_key
                for subsector_key in action_subsector_keys
                if subsector_key in city_emissions_by_subsector_key
            ]
            for subsector_key in matched_city_subsector_keys:
                candidate_action_ids_by_subsector_key.setdefault(subsector_key, []).append(
                    action.action_id
                )

        prepared_actions[action.action_id] = {
            "emissions_entry": emissions_entry,
            "action_subsector_keys": action_subsector_keys,
            "impact_band": impact_band,
            "reduction_multiplier": reduction_multiplier,
            "matched_city_subsector_keys": matched_city_subsector_keys,
        }

    # Block 3: Run the guarded future mapping stub when requested.
    matched_subsector_keys_by_action_id = {
        action_id: list(prepared["matched_city_subsector_keys"])
        for action_id, prepared in prepared_actions.items()
    }
    activity_mapping_metadata = {
        "activity_data_level_mapping_enabled": activity_data_level_mapping_enabled,
        "stub_invoked": False,
        "matching_mode": "subsector_only",
        "warnings": [],
        "candidate_action_ids_by_subsector_key": candidate_action_ids_by_subsector_key,
        "action_text_sources_by_action_id": {},
        "activity_row_candidates": [],
        "matched_subsector_keys_by_action_id": matched_subsector_keys_by_action_id,
    }
    if activity_data_level_mapping_enabled:
        activity_mapping_metadata = _collect_activity_data_level_mapping_stub_metadata(
            city_activity_rows=city_emissions_context.activity_rows,
            candidate_action_ids_by_subsector_key=candidate_action_ids_by_subsector_key,
            action_lookup={action.action_id: action for action in actions},
            matched_subsector_keys_by_action_id=matched_subsector_keys_by_action_id,
        )

    # Block 4: Score actions from the resolved subsector matches.
    for action in actions:
        prepared = prepared_actions[action.action_id]
        emissions_entry = prepared["emissions_entry"]
        action_subsector_keys = prepared["action_subsector_keys"]
        impact_band = prepared["impact_band"]
        reduction_multiplier = prepared["reduction_multiplier"]
        matched_city_subsector_keys = activity_mapping_metadata[
            "matched_subsector_keys_by_action_id"
        ].get(action.action_id, [])

        total_reduction_amount = 0.0
        if reduction_multiplier is not None:
            total_reduction_amount = sum(
                city_emissions_by_subsector_key[subsector_key] * reduction_multiplier
                for subsector_key in matched_city_subsector_keys
            )
        reduction_share_of_city_emissions = (
            total_reduction_amount / total_city_emissions
            if total_city_emissions > 0.0
            else 0.0
        )

        # Block 5: Build per-subsector reduction evidence for explainability.
        subsector_contributors: list[dict[str, float | str]] = []
        for subsector_key in matched_city_subsector_keys:
            subsector_city_emissions = city_emissions_by_subsector_key[subsector_key]
            reduction_amount = 0.0
            if reduction_multiplier is not None:
                reduction_amount = subsector_city_emissions * reduction_multiplier
            subsector_contributors.append(
                {
                    "subsector_key": subsector_key,
                    "city_emissions": subsector_city_emissions,
                    "share_of_city": (
                        subsector_city_emissions / total_city_emissions
                        if total_city_emissions > 0.0
                        else 0.0
                    ),
                    "reduction_amount": reduction_amount,
                }
            )
        subsector_contributors.sort(
            key=lambda item: (
                -float(item["reduction_amount"]),
                str(item["subsector_key"]),
            )
        )

        # Block 6: Compute weighted reduction and timeline contributions.
        reduction_component_contribution = (
            IMPACT_WEIGHT_REDUCTION_SHARE * reduction_share_of_city_emissions
        )
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
            "has_any_action_subsector_key": len(action_subsector_keys) > 0,
            "action_subsector_keys": action_subsector_keys,
            "impact_band": impact_band,
            "reduction_multiplier": reduction_multiplier,
            "timeline_bucket": action.implementation_timeline,
            "timeline_bucket_known": action.implementation_timeline in {
                "<5 years",
                "5-10 years",
                ">10 years",
            },
            "timeline_score": timeline_score,
            "matched_city_subsector_keys_count": len(matched_city_subsector_keys),
            "matched_city_subsector_keys": matched_city_subsector_keys,
            "total_city_emissions": total_city_emissions,
            "total_reduction_amount": total_reduction_amount,
            "emissions_reduction_share_of_city_total": reduction_share_of_city_emissions,
            "timeline_component_score": timeline_score,
            "emissions_reduction_contribution": reduction_component_contribution,
            "timeline_contribution": timeline_component_contribution,
            "impact_block_score": impact_block_score,
            "subsector_contributors": subsector_contributors,
        }

    return BlockScoreResult(
        score_by_action_id=score_by_action_id,
        evidence_by_action_id=evidence_by_action_id,
        metadata={
            "activity_data_level_mapping_enabled": activity_mapping_metadata[
                "activity_data_level_mapping_enabled"
            ],
            "stub_invoked": activity_mapping_metadata["stub_invoked"],
            "matching_mode": activity_mapping_metadata["matching_mode"],
            "city_activity_rows_count": len(city_emissions_context.activity_rows),
            "city_subsector_keys": sorted(city_emissions_by_subsector_key.keys()),
            "warnings": list(activity_mapping_metadata["warnings"]),
            "candidate_action_ids_by_subsector_key": activity_mapping_metadata[
                "candidate_action_ids_by_subsector_key"
            ],
            "action_text_sources_by_action_id": activity_mapping_metadata[
                "action_text_sources_by_action_id"
            ],
            "activity_row_candidates": activity_mapping_metadata[
                "activity_row_candidates"
            ],
        },
    )
