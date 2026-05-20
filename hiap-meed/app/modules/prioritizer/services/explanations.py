"""Post-ranking explanation generation helpers."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel

from app.modules.prioritizer.config import (
    get_explanations_model,
    is_explanations_enabled,
)
from app.modules.prioritizer.internal_models import ScoredAction
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "ranking_explanation.md"
)
SYSTEM_PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "ranking_explanation_system.md"
)
EXPLANATION_PROMPT_WARNING_CHARS = 20_000


class ExplanationItem(BaseModel):
    """Structured explanation row returned by the LLM."""

    action_id: str
    explanation: str


class ExplanationBatch(BaseModel):
    """Top-level structured output returned by the LLM."""

    explanations: list[ExplanationItem]


def generate_explanations(
    *,
    locode: str,
    scored_actions: list[ScoredAction],
    city_preference_sectors: list[str],
    city_preference_co_benefit_keys: list[str],
) -> tuple[dict[str, str], dict[str, object]]:
    """
    Generate qualitative explanations for ranked actions.

    The current implementation assumes OpenAI as the provider to keep this flow
    simple and explicit.
    """
    if not is_explanations_enabled():
        return {}, {"status": "skipped", "reason": "HIAP_MEED_EXPLANATIONS_ENABLED=false"}
    if not scored_actions:
        return {}, {"status": "skipped", "reason": "no_scored_actions"}
    model_name = get_explanations_model()
    if model_name is None:
        raise ValueError(
            "HIAP_MEED_EXPLANATIONS_MODEL must be set when createExplanations=true"
        )

    curated_actions = [
        _build_curated_action_payload(
            scored_action=scored_action,
        )
        for scored_action in scored_actions
    ]
    expected_action_ids = {item.action.action_id for item in scored_actions}
    prompt = _build_prompt(
        locode=locode,
        city_preference_sectors=city_preference_sectors,
        city_preference_co_benefit_keys=city_preference_co_benefit_keys,
        curated_actions=curated_actions,
    )
    _warn_if_prompt_is_large(
        prompt=prompt,
        locode=locode,
        action_count=len(scored_actions),
    )
    system_prompt = _read_system_prompt_template()
    logger.info(
        "Calling explanations LLM API locode=%s model=%s actions=%s",
        locode,
        model_name,
        len(scored_actions),
    )

    client = create_openai_client()
    completion = client.chat.completions.parse(
        # Parse helper converts the Pydantic model to JSON schema and returns
        # a typed parsed object in `message.parsed`.
        model=model_name,
        temperature=0,
        response_format=ExplanationBatch,
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {"role": "user", "content": prompt},
        ],
    )

    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError("LLM did not return parsable structured explanation output")
    explanations_by_action_id = _rows_to_explanations(
        explanation_rows=parsed.explanations,
        expected_action_ids=expected_action_ids,
    )
    logger.info(
        "Explanations LLM API call completed locode=%s model=%s returned_rows=%s",
        locode,
        model_name,
        len(parsed.explanations),
    )
    llm_io_payload = {
        "status": "completed",
        "provider": "openai",
        "model": model_name,
        "request_context": {
            "locode": locode,
            "canonical_language": "en",
            "city_preference_sectors": city_preference_sectors,
            "city_preference_co_benefit_keys": city_preference_co_benefit_keys,
            "ranked_action_ids": sorted(expected_action_ids),
        },
        "llm_input": {
            "system_prompt": system_prompt,
            "prompt_text": prompt,
            "curated_actions": curated_actions,
        },
        "llm_output": {
            "parsed": parsed.model_dump(mode="json"),
            "explanations_by_action_id": explanations_by_action_id,
        },
    }
    return explanations_by_action_id, llm_io_payload


def _warn_if_prompt_is_large(*, prompt: str, locode: str, action_count: int) -> None:
    """Warn when the final explanation prompt is unusually large."""
    prompt_characters = len(prompt)
    if prompt_characters <= EXPLANATION_PROMPT_WARNING_CHARS:
        return

    logger.warning(
        "Large explanation prompt detected locode=%s actions=%s prompt_characters=%s threshold=%s",
        locode,
        action_count,
        prompt_characters,
        EXPLANATION_PROMPT_WARNING_CHARS,
    )


def _build_prompt(
    *,
    locode: str,
    city_preference_sectors: list[str],
    city_preference_co_benefit_keys: list[str],
    curated_actions: list[dict[str, object]],
) -> str:
    """Build final LLM prompt from template and curated payload."""
    template = _read_prompt_template()
    return template.format(
        locode=locode,
        city_preference_sectors=json.dumps(city_preference_sectors, ensure_ascii=False),
        city_preference_co_benefit_keys=json.dumps(
            city_preference_co_benefit_keys, ensure_ascii=False
        ),
        ranked_actions_json=json.dumps(curated_actions, ensure_ascii=False, indent=2),
    )


def _read_prompt_template() -> str:
    """Read explanation prompt template from markdown file."""
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def _read_system_prompt_template() -> str:
    """Read system prompt template from markdown file."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()


def _rows_to_explanations(
    *, explanation_rows: list[ExplanationItem], expected_action_ids: set[str]
) -> dict[str, str]:
    """Convert structured LLM rows into validated action->explanation mapping."""
    explanations_by_action_id: dict[str, str] = {}
    for row in explanation_rows:
        action_id = row.action_id.strip()
        if action_id not in expected_action_ids:
            continue
        cleaned = " ".join(row.explanation.strip().split())
        if not cleaned:
            continue
        explanations_by_action_id[action_id] = cleaned
    return explanations_by_action_id


def _build_curated_action_payload(
    *,
    scored_action: ScoredAction,
) -> dict[str, object]:
    """Build qualitative, stable explanation input payload for one action."""
    impact_evidence_raw = scored_action.evidence.get("impact")
    alignment_evidence_raw = scored_action.evidence.get("alignment")
    feasibility_evidence_raw = scored_action.evidence.get("feasibility")
    impact_evidence = impact_evidence_raw if isinstance(impact_evidence_raw, dict) else {}
    alignment_evidence = (
        alignment_evidence_raw if isinstance(alignment_evidence_raw, dict) else {}
    )
    feasibility_evidence = (
        feasibility_evidence_raw
        if isinstance(feasibility_evidence_raw, dict)
        else {}
    )

    payload: dict[str, object] = {
        "action_id": scored_action.action.action_id,
        "rank": scored_action.rank,
        "score_bands": {
            "final": _score_band(scored_action.final_score),
            "impact": _score_band(scored_action.impact_score),
            "alignment": _score_band(scored_action.alignment_score),
            "feasibility": _score_band(scored_action.feasibility_score),
        },
        "impact_signals": _build_impact_signals(impact_evidence),
        "alignment_signals": _build_alignment_signals(alignment_evidence),
        "feasibility_signals": _build_feasibility_signals(feasibility_evidence),
        "main_strengths": _build_main_strengths(
            impact_evidence=impact_evidence,
            alignment_evidence=alignment_evidence,
            feasibility_evidence=feasibility_evidence,
        ),
        "main_constraints": _build_main_constraints(
            impact_evidence=impact_evidence,
            alignment_evidence=alignment_evidence,
            feasibility_evidence=feasibility_evidence,
        ),
        "known_limitations": _build_known_limitations(
            feasibility_evidence=feasibility_evidence,
        ),
    }
    return payload


def _build_impact_signals(impact_evidence: dict[str, object]) -> dict[str, object]:
    """Build qualitative impact-focused signals from block evidence."""
    matched_count_value = impact_evidence.get("matched_city_subsector_keys_count")
    matched_count = int(matched_count_value) if isinstance(matched_count_value, int | float) else 0
    impact_band_value = impact_evidence.get("impact_band")
    impact_band = str(impact_band_value).strip() if impact_band_value is not None else None
    timeline_bucket_value = impact_evidence.get("timeline_bucket")
    timeline_bucket = (
        str(timeline_bucket_value).strip()
        if timeline_bucket_value is not None
        else None
    )
    emissions_reduction_component_score = impact_evidence.get(
        "emissions_reduction_component_score"
    )
    timeline_component_score = impact_evidence.get("timeline_component_score")

    return {
        "impact_band": impact_band,
        "timeline_bucket": timeline_bucket,
        "matched_city_subsector_keys_count": matched_count,
        "emissions_reduction_component_bucket": _component_score_bucket(
            emissions_reduction_component_score
        ),
        "timeline_component_bucket": _component_score_bucket(timeline_component_score),
    }


def _build_alignment_signals(alignment_evidence: dict[str, object]) -> dict[str, object]:
    """Build qualitative alignment signals from block evidence."""
    action_timeline_bucket_value = alignment_evidence.get("action_timeline_bucket")
    action_timeline_bucket = (
        str(action_timeline_bucket_value).strip()
        if action_timeline_bucket_value is not None
        else None
    )
    policy_signals_count_value = alignment_evidence.get("policy_signals_count")
    matched_preferred_co_benefits_count_value = alignment_evidence.get(
        "matched_preferred_co_benefits_count"
    )
    timeframe_match_label_value = alignment_evidence.get("timeframe_match_label")
    city_preference_timeframes = alignment_evidence.get("city_preference_timeframes", [])
    policy_component_score = alignment_evidence.get("policy_component_score")
    sector_component_score = alignment_evidence.get("sector_component_score")
    co_benefit_component_score = alignment_evidence.get("co_benefit_component_score")
    timeframe_component_score = alignment_evidence.get("timeframe_component_score")
    return {
        "sector_match": bool(alignment_evidence.get("sector_match", False)),
        "action_timeline_bucket": action_timeline_bucket,
        "city_preference_timeframes": city_preference_timeframes,
        "timeframe_match_label": (
            str(timeframe_match_label_value).strip()
            if timeframe_match_label_value is not None
            else None
        ),
        "policy_signals_count": int(policy_signals_count_value)
        if isinstance(policy_signals_count_value, int | float)
        else 0,
        "policy_component_bucket": _component_score_bucket(policy_component_score),
        "sector_component_bucket": _component_score_bucket(sector_component_score),
        "co_benefit_component_bucket": _component_score_bucket(
            co_benefit_component_score
        ),
        "timeframe_component_bucket": _component_score_bucket(
            timeframe_component_score
        ),
        "matched_preferred_co_benefits_count": int(
            matched_preferred_co_benefits_count_value
        )
        if isinstance(matched_preferred_co_benefits_count_value, int | float)
        else 0,
    }


def _build_feasibility_signals(
    feasibility_evidence: dict[str, object],
) -> dict[str, object]:
    """Build qualitative feasibility signals from block evidence."""
    informational_rows = feasibility_evidence.get("informational_requirements")
    informational_count = (
        len(informational_rows) if isinstance(informational_rows, list) else 0
    )
    soft_legal_aligned_count_value = feasibility_evidence.get("soft_legal_aligned_count")
    soft_legal_total_count_value = feasibility_evidence.get("soft_legal_total_count")
    soft_legal_component_score = feasibility_evidence.get("soft_legal_component_score")
    socioeconomic_component_score = feasibility_evidence.get(
        "socioeconomic_component_score"
    )
    return {
        "soft_legal_aligned_count": int(soft_legal_aligned_count_value)
        if isinstance(soft_legal_aligned_count_value, int | float)
        else 0,
        "soft_legal_total_count": int(soft_legal_total_count_value)
        if isinstance(soft_legal_total_count_value, int | float)
        else 0,
        "informational_requirements_count": informational_count,
        "missing_city_indicator_keys_count": len(
            feasibility_evidence.get("missing_city_socioeconomic_indicator_keys", [])
        )
        if isinstance(
            feasibility_evidence.get("missing_city_socioeconomic_indicator_keys", []),
            list,
        )
        else 0,
        "soft_legal_component_bucket": _component_score_bucket(
            soft_legal_component_score
        ),
        "socioeconomic_component_bucket": _component_score_bucket(
            socioeconomic_component_score
        ),
    }


def _build_main_strengths(
    *,
    impact_evidence: dict[str, object],
    alignment_evidence: dict[str, object],
    feasibility_evidence: dict[str, object],
) -> list[str]:
    """Summarize the biggest ranking strengths for one action."""
    strengths: list[str] = []
    matched_count = int(impact_evidence.get("matched_city_subsector_keys_count", 0))
    if matched_count > 0:
        _append_strength_message_for_score(
            strengths,
            score_value=impact_evidence.get("emissions_reduction_component_score"),
            strong_message="Expected to make a strong emissions reduction in the current city inventory.",
            very_strong_message="Expected to make a very strong emissions reduction in the current city inventory.",
        )

    if bool(impact_evidence.get("timeline_bucket_known", False)):
        _append_strength_message_for_score(
            strengths,
            score_value=impact_evidence.get("timeline_component_score"),
            strong_message="Can deliver emissions benefits on a relatively favorable timeline.",
            very_strong_message="Can deliver emissions benefits on a very favorable timeline.",
        )

    city_preference_sectors = alignment_evidence.get("city_preference_sectors", [])
    if isinstance(city_preference_sectors, list) and city_preference_sectors:
        _append_strength_message_for_score(
            strengths,
            score_value=alignment_evidence.get("sector_component_score"),
            strong_message="Matches the city's preferred sector.",
            very_strong_message="Matches the city's preferred sector.",
        )

    city_preference_timeframes = alignment_evidence.get("city_preference_timeframes", [])
    if isinstance(city_preference_timeframes, list) and city_preference_timeframes:
        _append_strength_message_for_score(
            strengths,
            score_value=alignment_evidence.get("timeframe_component_score"),
            strong_message="Fits the city's preferred implementation timeframe.",
            very_strong_message="Fits the city's preferred implementation timeframe.",
        )

    if bool(alignment_evidence.get("policy_support_score_present", False)):
        _append_strength_message_for_score(
            strengths,
            score_value=alignment_evidence.get("policy_component_score"),
            strong_message="Shows strong supportive policy context in the current evidence.",
            very_strong_message="Shows very strong supportive policy context in the current evidence.",
        )

    if bool(alignment_evidence.get("city_selected_co_benefits_present", False)):
        _append_strength_message_for_score(
            strengths,
            score_value=alignment_evidence.get("co_benefit_component_score"),
            strong_message="Supports the city's preferred co-benefits well.",
            very_strong_message="Supports the city's preferred co-benefits very well.",
        )

    soft_legal_total_count = int(feasibility_evidence.get("soft_legal_total_count", 0))
    if soft_legal_total_count > 0:
        _append_strength_message_for_score(
            strengths,
            score_value=feasibility_evidence.get("soft_legal_component_score"),
            strong_message="Shows strong supportive soft legal conditions in the current evidence.",
            very_strong_message="Shows very strong supportive soft legal conditions in the current evidence.",
        )

    socioeconomic_rows = feasibility_evidence.get("socioeconomic_indicator_rows", [])
    if isinstance(socioeconomic_rows, list) and socioeconomic_rows:
        _append_strength_message_for_score(
            strengths,
            score_value=feasibility_evidence.get("socioeconomic_component_score"),
            strong_message="Fits the current city socioeconomic context well.",
            very_strong_message="Fits the current city socioeconomic context very well.",
        )

    return strengths


def _build_main_constraints(
    *,
    impact_evidence: dict[str, object],
    alignment_evidence: dict[str, object],
    feasibility_evidence: dict[str, object],
) -> list[str]:
    """Summarize the biggest ranking constraints for one action."""
    constraints: list[str] = []
    matched_count = int(impact_evidence.get("matched_city_subsector_keys_count", 0))
    if matched_count == 0:
        constraints.append(
            "Does not directly match a subsector with recorded city emissions in the current inventory."
        )
    else:
        _append_constraint_message_for_score(
            constraints,
            score_value=impact_evidence.get("emissions_reduction_component_score"),
            weak_message="Its expected emissions reduction is limited in the current city inventory.",
            very_weak_message="Its expected emissions reduction is very limited in the current city inventory.",
        )

    if bool(impact_evidence.get("timeline_bucket_known", False)):
        _append_constraint_message_for_score(
            constraints,
            score_value=impact_evidence.get("timeline_component_score"),
            weak_message="Its expected emissions benefits arrive on a relatively slow timeline.",
            very_weak_message="Its expected emissions benefits arrive on a slow timeline.",
        )

    city_preference_sectors = alignment_evidence.get("city_preference_sectors", [])
    if isinstance(city_preference_sectors, list) and city_preference_sectors:
        _append_constraint_message_for_score(
            constraints,
            score_value=alignment_evidence.get("sector_component_score"),
            weak_message="Does not match the city's preferred sector.",
            very_weak_message="Does not match the city's preferred sector.",
        )

    city_preference_timeframes = alignment_evidence.get("city_preference_timeframes", [])
    if isinstance(city_preference_timeframes, list) and city_preference_timeframes:
        _append_constraint_message_for_score(
            constraints,
            score_value=alignment_evidence.get("timeframe_component_score"),
            weak_message="Does not fit the city's preferred implementation timeframe.",
            very_weak_message="Does not fit the city's preferred implementation timeframe.",
        )

    if bool(alignment_evidence.get("policy_support_score_present", False)):
        _append_constraint_message_for_score(
            constraints,
            score_value=alignment_evidence.get("policy_component_score"),
            weak_message="Shows weak supportive policy context in the current evidence.",
            very_weak_message="Shows very weak supportive policy context in the current evidence.",
        )

    if bool(alignment_evidence.get("city_selected_co_benefits_present", False)):
        _append_constraint_message_for_score(
            constraints,
            score_value=alignment_evidence.get("co_benefit_component_score"),
            weak_message="Offers weak support for the city's preferred co-benefits.",
            very_weak_message="Offers very weak support for the city's preferred co-benefits.",
        )

    soft_legal_total_count = int(feasibility_evidence.get("soft_legal_total_count", 0))
    if soft_legal_total_count > 0:
        _append_constraint_message_for_score(
            constraints,
            score_value=feasibility_evidence.get("soft_legal_component_score"),
            weak_message="Shows weak supportive soft legal conditions in the current evidence.",
            very_weak_message="Shows very weak supportive soft legal conditions in the current evidence.",
        )

    socioeconomic_rows = feasibility_evidence.get("socioeconomic_indicator_rows", [])
    if isinstance(socioeconomic_rows, list) and socioeconomic_rows:
        _append_constraint_message_for_score(
            constraints,
            score_value=feasibility_evidence.get("socioeconomic_component_score"),
            weak_message="Fits the current city socioeconomic context less well.",
            very_weak_message="Fits the current city socioeconomic context poorly.",
        )

    return constraints


def _build_known_limitations(
    *,
    feasibility_evidence: dict[str, object],
) -> list[str]:
    """List known limitations that should be acknowledged in explanations."""
    limitations: list[str] = []

    informational_requirements_count_value = feasibility_evidence.get(
        "informational_requirements"
    )
    informational_requirements_count = (
        len(informational_requirements_count_value)
        if isinstance(informational_requirements_count_value, list)
        else 0
    )
    informational_summary_available = bool(
        feasibility_evidence.get("informational_requirements_summary_available")
    )
    if informational_requirements_count > 0 and not informational_summary_available:
        limitations.append(
            "Non-blocking legal constraints are included as evidence, but UI-friendly implementation notes are not fully implemented yet."
        )
    return limitations


def _score_band(score: float) -> str:
    """
    Map one block score into a qualitative label.

    This is applied independently to:
    - final score
    - impact block score
    - alignment block score
    - feasibility block score
    """
    if score >= 0.75:
        return "high"
    if score >= 0.5:
        return "moderate"
    if score >= 0.25:
        return "low"
    return "very low"


def _coerce_unit_score(score_value: object) -> float | None:
    """Normalize one component score into the expected 0..1 range."""
    if not isinstance(score_value, int | float):
        return None
    return min(max(float(score_value), 0.0), 1.0)


def _append_strength_message_for_score(
    messages: list[str],
    *,
    score_value: object,
    strong_message: str,
    very_strong_message: str,
) -> None:
    """Append the strength sentence that matches this component score."""
    score = _coerce_unit_score(score_value)
    if score is None:
        return
    if score > 0.75:
        messages.append(very_strong_message)
    elif score > 0.5:
        messages.append(strong_message)


def _append_constraint_message_for_score(
    messages: list[str],
    *,
    score_value: object,
    weak_message: str,
    very_weak_message: str,
) -> None:
    """Append the constraint sentence that matches this component score."""
    score = _coerce_unit_score(score_value)
    if score is None:
        return
    if score < 0.25:
        messages.append(very_weak_message)
    elif score < 0.5:
        messages.append(weak_message)


def _component_score_bucket(score_value: object) -> str | None:
    """Map one component score to the explanation bucket used for payload signals."""
    score = _coerce_unit_score(score_value)
    if score is None:
        return None
    if score > 0.75:
        return "very_strong"
    if score > 0.5:
        return "strong"
    if score == 0.5:
        return "neutral"
    if score >= 0.25:
        return "weak"
    return "very_weak"
