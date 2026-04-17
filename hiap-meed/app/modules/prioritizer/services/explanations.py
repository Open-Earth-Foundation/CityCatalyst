"""Post-ranking explanation generation helpers."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from openai import OpenAI
from pydantic import BaseModel

from app.modules.prioritizer.config import (
    get_explanations_max_retries,
    get_explanations_model,
    get_explanations_timeout_seconds,
    is_explanations_enabled,
)
from app.modules.prioritizer.internal_models import ScoredAction

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "ranking_explanation.md"
)
SYSTEM_PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "ranking_explanation_system.md"
)


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
    city_preference_other_text: str | None,
    excluded_actions_free_text: str | None,
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

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key is None or not api_key.strip():
        raise ValueError(
            "OPENAI_API_KEY must be set when createExplanations=true"
        )

    curated_actions = [
        _build_curated_action_payload(
            scored_action=scored_action,
            city_preference_other_text=city_preference_other_text,
            excluded_actions_free_text=excluded_actions_free_text,
        )
        for scored_action in scored_actions
    ]
    expected_action_ids = {item.action.action_id for item in scored_actions}
    prompt = _build_prompt(
        locode=locode,
        city_preference_sectors=city_preference_sectors,
        city_preference_other_text=city_preference_other_text,
        excluded_actions_free_text=excluded_actions_free_text,
        curated_actions=curated_actions,
    )
    system_prompt = _read_system_prompt_template()
    logger.info(
        "Calling explanations LLM API locode=%s model=%s actions=%s",
        locode,
        model_name,
        len(scored_actions),
    )

    client = OpenAI(
        api_key=api_key.strip(),
        timeout=get_explanations_timeout_seconds(),
        max_retries=get_explanations_max_retries(),
    )
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
            "city_preference_sectors": city_preference_sectors,
            "city_preference_other_text": city_preference_other_text,
            "excluded_actions_free_text": excluded_actions_free_text,
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


def _build_prompt(
    *,
    locode: str,
    city_preference_sectors: list[str],
    city_preference_other_text: str | None,
    excluded_actions_free_text: str | None,
    curated_actions: list[dict[str, object]],
) -> str:
    """Build final LLM prompt from template and curated payload."""
    template = _read_prompt_template()
    return template.format(
        locode=locode,
        city_preference_sectors=json.dumps(city_preference_sectors, ensure_ascii=True),
        city_preference_other_text=city_preference_other_text or "",
        excluded_actions_free_text=excluded_actions_free_text or "",
        ranked_actions_json=json.dumps(curated_actions, ensure_ascii=True, indent=2),
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
    city_preference_other_text: str | None,
    excluded_actions_free_text: str | None,
) -> dict[str, object]:
    """Build qualitative, stable explanation input payload for one action."""
    impact_evidence_raw = scored_action.evidence.get("impact")
    hard_filter_evidence_raw = scored_action.evidence.get("hard_filter")
    alignment_evidence_raw = scored_action.evidence.get("alignment")
    feasibility_evidence_raw = scored_action.evidence.get("feasibility")
    impact_evidence = impact_evidence_raw if isinstance(impact_evidence_raw, dict) else {}
    hard_filter_evidence = (
        hard_filter_evidence_raw if isinstance(hard_filter_evidence_raw, dict) else {}
    )
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
        "action_name": scored_action.action.action_name,
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
        "known_limitations": _build_known_limitations(
            hard_filter_evidence=hard_filter_evidence,
            alignment_evidence=alignment_evidence,
            feasibility_evidence=feasibility_evidence,
            city_preference_other_text=city_preference_other_text,
            excluded_actions_free_text=excluded_actions_free_text,
        ),
    }
    return payload


def _build_impact_signals(impact_evidence: dict[str, object]) -> dict[str, object]:
    """Build qualitative impact-focused signals from block evidence."""
    matched_gpc_refs = impact_evidence.get("matched_city_gpc_refs")
    matched_count_value = impact_evidence.get("matched_city_gpc_refs_count")
    matched_count = int(matched_count_value) if isinstance(matched_count_value, int | float) else 0
    impact_text_value = impact_evidence.get("impact_text")
    impact_text = str(impact_text_value).strip() if impact_text_value is not None else None
    timeline_bucket_value = impact_evidence.get("timeline_bucket")
    timeline_bucket = (
        str(timeline_bucket_value).strip()
        if timeline_bucket_value is not None
        else None
    )

    top_gpc_refs: list[str] = []
    if isinstance(matched_gpc_refs, list):
        top_gpc_refs = [
            str(item).strip() for item in matched_gpc_refs[:3] if str(item).strip()
        ]

    return {
        "impact_band": impact_text,
        "timeline_bucket": timeline_bucket,
        "matched_city_gpc_refs_count": matched_count,
        "top_matched_city_gpc_refs": top_gpc_refs,
    }


def _build_alignment_signals(alignment_evidence: dict[str, object]) -> dict[str, object]:
    """Build qualitative alignment signals from block evidence."""
    policy_signal_summaries = alignment_evidence.get("policy_signal_summaries")
    top_policy_signals: list[dict[str, object]] = []
    if isinstance(policy_signal_summaries, list):
        sorted_rows = sorted(
            [row for row in policy_signal_summaries if isinstance(row, dict)],
            key=lambda row: (
                -int(row.get("evidence_count", 0))
                if isinstance(row.get("evidence_count"), int | float)
                else 0,
                str(row.get("signal_type", "")),
            ),
        )
        for row in sorted_rows[:3]:
            evidence_count_value = row.get("evidence_count")
            top_policy_signals.append(
                {
                    "signal_type": str(row.get("signal_type")).strip()
                    if row.get("signal_type") is not None
                    else None,
                    "signal_relation": str(row.get("signal_relation")).strip()
                    if row.get("signal_relation") is not None
                    else None,
                    "signal_strength": str(row.get("signal_strength")).strip()
                    if row.get("signal_strength") is not None
                    else None,
                    "location_scope": str(row.get("location_scope")).strip()
                    if row.get("location_scope") is not None
                    else None,
                    "location_name": str(row.get("location_name")).strip()
                    if row.get("location_name") is not None
                    else None,
                    "evidence_count": int(evidence_count_value)
                    if isinstance(evidence_count_value, int | float)
                    else 0,
                }
            )

    mapped_sector_tag_value = alignment_evidence.get("mapped_sector_tag")
    mapped_sector_tag = (
        str(mapped_sector_tag_value).strip()
        if mapped_sector_tag_value is not None
        else None
    )
    policy_signals_count_value = alignment_evidence.get("policy_signals_count")
    return {
        "sector_match": bool(alignment_evidence.get("sector_match", False)),
        "mapped_sector_tag": mapped_sector_tag,
        "policy_signals_count": int(policy_signals_count_value)
        if isinstance(policy_signals_count_value, int | float)
        else 0,
        "top_policy_signals": top_policy_signals,
    }


def _build_feasibility_signals(
    feasibility_evidence: dict[str, object],
) -> dict[str, object]:
    """Build qualitative feasibility signals from block evidence."""
    rows = feasibility_evidence.get("socioeconomic_indicator_rows")
    socio_rationales: list[str] = []
    if isinstance(rows, list):
        ranked_rows = sorted(
            [row for row in rows if isinstance(row, dict)],
            key=lambda row: (
                -abs(
                    float(row.get("weighted_contribution"))
                    if isinstance(row.get("weighted_contribution"), int | float)
                    else 0.0
                ),
                str(row.get("action_socioeconomic_indicator_key", "")),
            ),
        )
        for row in ranked_rows[:3]:
            rationale_value = row.get("rationale")
            if rationale_value is not None and str(rationale_value).strip():
                rationale = str(rationale_value).strip()
                socio_rationales.append(rationale)

    informational_rows = feasibility_evidence.get("informational_requirements")
    informational_count = (
        len(informational_rows) if isinstance(informational_rows, list) else 0
    )
    soft_legal_aligned_count_value = feasibility_evidence.get("soft_legal_aligned_count")
    soft_legal_total_count_value = feasibility_evidence.get("soft_legal_total_count")
    return {
        "soft_legal_aligned_count": int(soft_legal_aligned_count_value)
        if isinstance(soft_legal_aligned_count_value, int | float)
        else 0,
        "soft_legal_total_count": int(soft_legal_total_count_value)
        if isinstance(soft_legal_total_count_value, int | float)
        else 0,
        "informational_requirements_count": informational_count,
        "socioeconomic_rationales": socio_rationales,
        "missing_city_indicator_keys": feasibility_evidence.get(
            "missing_city_socioeconomic_indicator_keys", []
        ),
    }


def _build_known_limitations(
    *,
    hard_filter_evidence: dict[str, object],
    alignment_evidence: dict[str, object],
    feasibility_evidence: dict[str, object],
    city_preference_other_text: str | None,
    excluded_actions_free_text: str | None,
) -> list[str]:
    """List known limitations that should be acknowledged in explanations."""
    limitations: list[str] = []

    free_text_exclusion_is_stub = bool(
        hard_filter_evidence.get("free_text_exclusion_is_stub")
    )
    excluded_actions_text_provided = bool(
        excluded_actions_free_text and excluded_actions_free_text.strip()
    )
    if free_text_exclusion_is_stub and excluded_actions_text_provided:
        limitations.append(
            "Free-text action exclusions are not implemented yet and therefore do not affect ranking."
        )

    other_component_is_stub = bool(alignment_evidence.get("other_component_is_stub"))
    if city_preference_other_text and other_component_is_stub:
        limitations.append(
            "City free-text preference matching is currently not modeled."
        )

    informational_requirements_count_value = feasibility_evidence.get(
        "informational_requirements"
    )
    informational_requirements_count = (
        len(informational_requirements_count_value)
        if isinstance(informational_requirements_count_value, list)
        else 0
    )
    informational_notes_are_stub = bool(
        feasibility_evidence.get("informational_requirements_notes_are_stub")
    )
    if informational_requirements_count > 0 and informational_notes_are_stub:
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
