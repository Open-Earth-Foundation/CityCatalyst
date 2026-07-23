"""Post-ranking explanation generation helpers."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel

from app.modules.prioritizer.internal_models import ScoredAction
from app.modules.prioritizer.llm_config import (
    get_explanations_model,
    get_explanations_temperature,
    is_explanations_enabled,
)
from app.modules.prioritizer.localization import (
    localized_source_value,
    translate_term,
    validate_generated_language,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "ranking_explanation.md"
)
SYSTEM_PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "ranking_explanation_system.md"
)
EXPLANATION_PROMPT_WARNING_CHARS = 20_000
MAX_LANGUAGE_ATTEMPTS = 2
FEASIBILITY_COMPONENT_ORDER: tuple[str, ...] = (
    "legal",
    "mitigation_feasibility",
    "financial_feasibility",
)


def _feasibility_component(
    feasibility_evidence: dict[str, object], component_name: str
) -> dict[str, object]:
    """Return one grouped feasibility component, or an empty dict."""
    component = feasibility_evidence.get(component_name, {})
    if not isinstance(component, dict):
        return {}
    return component


def _feasibility_component_value(
    feasibility_evidence: dict[str, object],
    component_name: str,
    key: str,
    legacy_key: str,
) -> object:
    """Read grouped feasibility evidence with a flat-key fallback."""
    component = _feasibility_component(feasibility_evidence, component_name)
    if key in component:
        return component.get(key)
    return feasibility_evidence.get(legacy_key)


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
    languages: list[str],
    scored_actions: list[ScoredAction],
    city_preference_sectors: list[str],
    city_preference_co_benefit_keys: list[str],
) -> tuple[dict[str, dict[str, str]], dict[str, object]]:
    """
    Generate qualitative explanations independently in every requested language.

    The current implementation assumes OpenAI as the provider to keep this flow
    simple and explicit.
    """
    localized: dict[str, dict[str, str]] = {}
    llm_io_by_language: dict[str, object] = {}
    for language in languages:
        explanations, llm_io = _generate_explanations_for_language(
            locode=locode,
            language=language,
            scored_actions=scored_actions,
            city_preference_sectors=city_preference_sectors,
            city_preference_co_benefit_keys=city_preference_co_benefit_keys,
        )
        localized[language] = explanations
        llm_io_by_language[language] = llm_io
    return localized, {"languages": llm_io_by_language}


def _generate_explanations_for_language(
    *,
    locode: str,
    language: str,
    scored_actions: list[ScoredAction],
    city_preference_sectors: list[str],
    city_preference_co_benefit_keys: list[str],
) -> tuple[dict[str, str], dict[str, object]]:
    """Generate and validate one complete explanation batch in one language."""
    if not is_explanations_enabled():
        return {}, {"status": "skipped", "reason": "explanations_disabled"}
    if not scored_actions:
        return {}, {"status": "skipped", "reason": "no_scored_actions"}
    model_name = get_explanations_model()
    if model_name is None:
        raise ValueError(
            "The explanations model must be configured in llm_config.yaml when createExplanations=true"
        )

    curated_actions = [
        _build_curated_action_payload(
            scored_action=scored_action,
            language=language,
        )
        for scored_action in scored_actions
    ]
    expected_action_ids = {item.action.action_id for item in scored_actions}
    prompt = _build_prompt(
        locode=locode,
        language=language,
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
        "Calling explanations LLM API locode=%s language=%s model=%s actions=%s",
        locode,
        language,
        model_name,
        len(scored_actions),
    )

    client = create_openai_client()
    attempts: list[dict[str, object]] = []
    explanations_by_action_id: dict[str, str] = {}
    parsed: ExplanationBatch | None = None
    for attempt in range(1, MAX_LANGUAGE_ATTEMPTS + 1):
        completion = client.chat.completions.parse(
            model=model_name,
            temperature=get_explanations_temperature(),
            response_format=ExplanationBatch,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        candidate = completion.choices[0].message.parsed
        if candidate is None:
            raise ValueError("LLM did not return parsable structured explanation output")
        explanations_by_action_id = _rows_to_explanations(
            explanation_rows=candidate.explanations,
            expected_action_ids=expected_action_ids,
        )
        attempts.append(
            {"attempt": attempt, "parsed": candidate.model_dump(mode="json")}
        )
        try:
            _validate_explanation_coverage(
                explanations_by_action_id, expected_action_ids, language
            )
            _validate_explanation_languages(explanations_by_action_id, language)
        except ValueError:
            if attempt == MAX_LANGUAGE_ATTEMPTS:
                raise
            prompt = _build_language_retry_prompt(prompt, language)
            continue
        parsed = candidate
        break

    if parsed is None:
        raise ValueError("LLM explanation language validation failed")
    logger.info(
        "Explanations LLM API call completed locode=%s language=%s "
        "model=%s returned_rows=%s",
        locode,
        language,
        model_name,
        len(parsed.explanations),
    )
    llm_io_payload = {
        "status": "completed",
        "provider": "openai",
        "model": model_name,
        "request_context": {
            "locode": locode,
            "language": language,
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
            "attempts": attempts,
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
    language: str,
    city_preference_sectors: list[str],
    city_preference_co_benefit_keys: list[str],
    curated_actions: list[dict[str, object]],
) -> str:
    """Build final LLM prompt from template and curated payload."""
    template = _read_prompt_template()
    return template.format(
        locode=locode,
        language=language,
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


def _validate_explanation_languages(
    explanations_by_action_id: dict[str, str], language: str
) -> None:
    """Require every substantive explanation to use the requested language."""
    for action_id, explanation in explanations_by_action_id.items():
        validate_generated_language(
            explanation,
            language,
            content_label=f"Explanation for action `{action_id}`",
        )


def _validate_explanation_coverage(
    explanations_by_action_id: dict[str, str],
    expected_action_ids: set[str],
    language: str,
) -> None:
    """Require one non-empty explanation per action for the generated language."""
    if set(explanations_by_action_id) != expected_action_ids:
        missing = sorted(expected_action_ids - set(explanations_by_action_id))
        raise ValueError(
            f"Explanation batch for `{language}` is missing action IDs: {missing}"
        )


def _build_language_retry_prompt(prompt: str, language: str) -> str:
    """Add a focused correction after a wrong-language explanation batch."""
    return (
        f"{prompt}\n\n"
        f"Correction: rewrite every explanation in `{language}`. Keep only official "
        "document, programme, agency, law, place, and action names in their source form."
    )


def _build_curated_action_payload(
    *,
    scored_action: ScoredAction,
    language: str,
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
        "action_name": localized_source_value(
            language=language,
            localized=scored_action.action.name_i18n,
            fallback=scored_action.action.action_name,
        ),
        "explanation_slots": _build_explanation_slots(
            impact_evidence=impact_evidence,
            alignment_evidence=alignment_evidence,
            feasibility_evidence=feasibility_evidence,
            language=language,
        ),
        "known_limitations": _build_known_limitations(
            feasibility_evidence=feasibility_evidence,
        ),
    }
    return payload


def _build_explanation_slots(
    *,
    impact_evidence: dict[str, object],
    alignment_evidence: dict[str, object],
    feasibility_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Build the fixed Notion-proposal explanation slots for one action."""
    return {
        "impact_driver": _build_impact_driver(impact_evidence, language),
        "alignment_driver": _build_alignment_driver(alignment_evidence, language),
        "feasibility_driver": _build_feasibility_driver(
            feasibility_evidence, language
        ),
    }


def _build_impact_driver(
    impact_evidence: dict[str, object], language: str
) -> dict[str, object]:
    """Return the top matched subsector/share slot used for the first sentence."""
    contributors = impact_evidence.get("subsector_contributors", [])
    if not isinstance(contributors, list) or not contributors:
        return {
            "kind": "no_inventory_match",
            "message": (
                "This action does not directly match a subsector with recorded "
                "city emissions in the current inventory."
            ),
            "impact_band": translate_term(
                "score_labels", impact_evidence.get("impact_band"), language
            ),
        }

    contributor_rows: list[dict[str, object]] = []
    for contributor in contributors:
        if not isinstance(contributor, dict):
            continue
        subsector_key = _clean_optional_string(contributor.get("subsector_key"))
        if subsector_key is None:
            continue
        share = _coerce_unit_score(contributor.get("share_of_city")) or 0.0
        reduction_amount = (
            float(contributor["reduction_amount"])
            if isinstance(contributor.get("reduction_amount"), int | float)
            else 0.0
        )
        contributor_rows.append(
            {
                "subsector_key": subsector_key,
                "subsector_label": _display_label_for_subsector(
                    subsector_key, language
                ),
                "sector_key": subsector_key.split(".", 1)[0],
                "share_of_city": share,
                "reduction_amount": reduction_amount,
            }
        )

    if not contributor_rows:
        return {
            "kind": "no_inventory_match",
            "message": (
                "This action does not directly match a subsector with recorded "
                "city emissions in the current inventory."
            ),
            "impact_band": translate_term(
                "score_labels", impact_evidence.get("impact_band"), language
            ),
        }

    top_subsector = sorted(
        contributor_rows,
        key=lambda item: (
            -float(item["reduction_amount"]),
            -float(item["share_of_city"]),
            str(item["subsector_key"]),
        ),
    )[0]
    share = _coerce_unit_score(top_subsector.get("share_of_city")) or 0.0
    return {
        "kind": "subsector_share",
        "subsector_key": top_subsector["subsector_key"],
        "subsector_label": top_subsector["subsector_label"],
        "sector_key": top_subsector["sector_key"],
        "sector_label": _display_label_for_sector(
            str(top_subsector["sector_key"]), language
        ),
        "share_of_city_percent": round(share * 100.0, 1),
        "share_phrase": _format_percent_share(share),
        "impact_band": translate_term(
            "score_labels", impact_evidence.get("impact_band"), language
        ),
    }


def _build_alignment_driver(
    alignment_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Return policy, priority, co-benefit, and notable timeframe alignment facts."""
    return {
        "policy": _build_policy_alignment_fact(alignment_evidence, language),
        "sector_priority": _build_sector_priority_fact(
            alignment_evidence, language
        ),
        "co_benefit_priority": _build_co_benefit_priority_fact(
            alignment_evidence, language
        ),
        "timeframe": _build_timeframe_alignment_fact(
            alignment_evidence, language
        ),
    }


def _build_policy_alignment_fact(
    alignment_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Return the top policy evidence fact for the alignment sentence."""
    policy_score_present = bool(alignment_evidence.get("policy_score_present", False))
    evidence_items = alignment_evidence.get("policy_evidence", [])
    top_evidence: dict[str, object] | None = None
    if isinstance(evidence_items, list):
        evidence_dicts = [item for item in evidence_items if isinstance(item, dict)]
        if evidence_dicts:
            top_evidence = sorted(
                evidence_dicts,
                key=lambda item: (
                    int(item.get("evidence_rank", 9999))
                    if isinstance(item.get("evidence_rank"), int | float)
                    else 9999,
                    str(item.get("document_name") or ""),
                ),
            )[0]

    return {
        "status": "present" if policy_score_present else "not_present",
        "support_category": translate_term(
            "score_labels",
            alignment_evidence.get("policy_support_category"),
            language,
        ),
        "document_name": (
            _clean_optional_string(top_evidence.get("document_name"))
            if top_evidence is not None
            else None
        ),
        "signal_relation": (
            _clean_optional_string(top_evidence.get("signal_relation"))
            if top_evidence is not None
            else None
        ),
        "evidence_text": (
            _clean_optional_string(top_evidence.get("evidence_text"))
            if top_evidence is not None
            else None
        ),
    }


def _build_sector_priority_fact(
    alignment_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Return whether the action sector matches city-selected priority sectors."""
    city_preference_sectors = _clean_string_list(
        alignment_evidence.get("city_preference_sectors")
    )
    mapped_sector_tags = _clean_string_list(alignment_evidence.get("mapped_sector_tags"))
    matched_sectors = sorted(set(city_preference_sectors).intersection(mapped_sector_tags))
    return {
        "city_selected_sectors": [
            _display_label_for_sector(sector, language)
            for sector in city_preference_sectors
        ],
        "action_sectors": [
            _display_label_for_sector(sector, language)
            for sector in mapped_sector_tags
        ],
        "matched_sectors": [
            _display_label_for_sector(sector, language) for sector in matched_sectors
        ],
        "matches_city_priority": bool(alignment_evidence.get("sector_match", False)),
    }


def _build_co_benefit_priority_fact(
    alignment_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Return co-benefit preference matches in display-friendly form."""
    matched_keys = _clean_string_list(
        alignment_evidence.get("matched_preferred_co_benefits")
    )
    selected_keys = _clean_string_list(
        alignment_evidence.get("city_preference_co_benefit_keys")
    )
    return {
        "city_selected_co_benefits": [
            _display_label_for_co_benefit(key, language) for key in selected_keys
        ],
        "matched_co_benefits": [
            _display_label_for_co_benefit(key, language) for key in matched_keys
        ],
        "matched_count": len(matched_keys),
        "city_selected_any": bool(
            alignment_evidence.get("city_selected_co_benefits_present", False)
        ),
    }


def _build_timeframe_alignment_fact(
    alignment_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Return timeframe alignment only when it is notably aligned or misaligned."""
    match_label = _clean_optional_string(alignment_evidence.get("timeframe_match_label"))
    if match_label not in {"exact_match", "mismatch"}:
        return {"status": "not_notable"}
    return {
        "status": "aligned" if match_label == "exact_match" else "misaligned",
        "action_timeframe": translate_term(
            "timeframes", alignment_evidence.get("action_timeframe_label"), language
        ),
        "action_timeline_bucket": _clean_optional_string(
            alignment_evidence.get("action_timeline_bucket")
        ),
        "city_preference_timeframes": [
            translate_term("timeframes", timeframe, language)
            for timeframe in _clean_string_list(
                alignment_evidence.get("city_preference_timeframes")
            )
        ],
    }


def _build_feasibility_driver(
    feasibility_evidence: dict[str, object],
    language: str,
) -> dict[str, object]:
    """Return the single feasibility component to mention in the third sentence."""
    components = [
        _build_feasibility_component_fact(
            feasibility_evidence, component_name, language
        )
        for component_name in FEASIBILITY_COMPONENT_ORDER
    ]
    scored_components = [
        component for component in components if component["score_for_comparison"] is not None
    ]
    if not scored_components:
        return {
            "kind": "unknown",
            "component": None,
            "component_label": None,
            "stance": "unknown",
            "message": "Feasibility evidence is not available for this action.",
        }

    weakest = sorted(
        scored_components,
        key=lambda item: (
            float(item["score_for_comparison"]),
            FEASIBILITY_COMPONENT_ORDER.index(str(item["component"])),
        ),
    )[0]
    score = float(weakest["score_for_comparison"])
    if score >= 0.75:
        stance = "support"
    elif score < 0.5:
        stance = "constraint"
    else:
        stance = "mixed"
    weakest.pop("score_for_comparison", None)
    return {
        "kind": "weakest_component",
        "stance": stance,
        **weakest,
    }


def _build_feasibility_component_fact(
    feasibility_evidence: dict[str, object], component_name: str, language: str
) -> dict[str, object]:
    """Return one comparable feasibility component fact."""
    component_score = _feasibility_component_value(
        feasibility_evidence,
        component_name,
        "component_score",
        f"{component_name}_component_score",
    )
    score = _coerce_unit_score(component_score)
    fact: dict[str, object] = {
        "component": component_name,
        "component_label": translate_term(
            "feasibility_components", component_name, language
        ),
        "score_for_comparison": score,
        "bucket": translate_term(
            "score_labels", _component_score_bucket(score), language
        ),
    }
    if component_name == "financial_feasibility":
        fact.update(
            {
                "route": translate_term(
                    "finance_routes",
                    _feasibility_component_value(
                        feasibility_evidence,
                        component_name,
                        "route",
                        "financial_feasibility_route",
                    ),
                    language,
                ),
                "reason": _clean_optional_string(
                    _feasibility_component_value(
                        feasibility_evidence,
                        component_name,
                        "reason",
                        "financial_feasibility_reason",
                    )
                ),
            }
        )
    elif component_name == "legal":
        fact.update(
            {
                "verdict_category": translate_term(
                    "score_labels",
                    _feasibility_component_value(
                        feasibility_evidence,
                        component_name,
                        "verdict_category",
                        "legal_verdict_category",
                    ),
                    language,
                ),
                "ownership_description": _localized_legal_description(
                    feasibility_evidence,
                    component_name,
                    "ownership_description",
                    language,
                ),
                "restrictions_description": _localized_legal_description(
                    feasibility_evidence,
                    component_name,
                    "restrictions_description",
                    language,
                ),
            }
        )
    else:
        fact.update(
            {
                "global_mitigation_option": _clean_optional_string(
                    _feasibility_component_value(
                        feasibility_evidence,
                        component_name,
                        "global_mitigation_option",
                        "global_mitigation_option",
                    )
                ),
                "action_mapping_strength": _clean_optional_string(
                    _feasibility_component_value(
                        feasibility_evidence,
                        component_name,
                        "action_mapping_strength",
                        "action_mapping_strength",
                    )
                ),
                "option_family": _clean_optional_string(
                    _feasibility_component_value(
                        feasibility_evidence,
                        component_name,
                        "option_family",
                        "option_family",
                    )
                ),
            }
        )
    return fact


def _clean_optional_string(value: object) -> str | None:
    """Return a stripped string value, or None when no useful text exists."""
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _clean_string_list(value: object) -> list[str]:
    """Return a stable list of non-empty strings from list-like evidence."""
    if not isinstance(value, list):
        return []
    cleaned_values = [str(item).strip() for item in value if str(item).strip()]
    return list(dict.fromkeys(cleaned_values))


def _localized_legal_description(
    feasibility_evidence: dict[str, object],
    component_name: str,
    key: str,
    language: str,
) -> str | None:
    """Select an upstream legal description in the requested language."""
    component = _feasibility_component(feasibility_evidence, component_name)
    localized = {
        "es": str(component.get(f"{key}_es") or ""),
    }
    fallback = _clean_optional_string(
        _feasibility_component_value(
            feasibility_evidence,
            component_name,
            key,
            key,
        )
    )
    return localized_source_value(
        language=language,
        localized=localized,
        fallback=fallback,
    )


def _display_label_for_sector(sector_key: str, language: str) -> str:
    """Return a human-friendly sector label for a GPC sector or sector tag."""
    normalized = {
        "I": "stationary_energy",
        "II": "transportation",
        "III": "waste",
        "IV": "ippu",
        "V": "afolu",
    }.get(sector_key.strip().upper(), sector_key)
    return translate_term("gpc_sectors", normalized, language) or normalized


def _display_label_for_subsector(subsector_key: str, language: str) -> str:
    """Return a human-friendly GPC subsector label."""
    normalized_key = subsector_key.strip().lower()
    return (
        translate_term("gpc_subsectors", normalized_key, language)
        or f"GPC {subsector_key.strip().upper()}"
    )


def _display_label_for_co_benefit(co_benefit_key: str, language: str) -> str:
    """Return a human-friendly co-benefit label for one taxonomy key."""
    return (
        translate_term("co_benefits", co_benefit_key, language)
        or co_benefit_key.replace("_", " ")
    )


def _format_percent_share(share: float) -> str:
    """Format an inventory share as a percentage suitable for explanation text."""
    percent = max(share, 0.0) * 100.0
    if percent >= 10.0:
        return f"{round(percent):.0f}%"
    if percent >= 1.0:
        return f"{percent:.1f}%"
    if percent > 0.0:
        return "<1%"
    return "0%"


def _build_known_limitations(
    *,
    feasibility_evidence: dict[str, object],
) -> list[str]:
    """List known limitations that should be acknowledged in explanations."""
    limitations: list[str] = []

    if bool(
        _feasibility_component_value(
            feasibility_evidence,
            "legal",
            "assessment_missing",
            "legal_assessment_missing",
        )
    ):
        limitations.append(
            "No legal assessment row was available for this action, so the legal component used a neutral fallback."
        )
    elif bool(
        _feasibility_component_value(
            feasibility_evidence,
            "legal",
            "verdict_score_missing",
            "legal_verdict_score_missing",
        )
    ):
        limitations.append(
            "The legal assessment was incomplete for this action, so the legal component used a neutral fallback."
        )
    if bool(
        _feasibility_component_value(
            feasibility_evidence,
            "mitigation_feasibility",
            "score_missing",
            "mitigation_feasibility_score_missing",
        )
    ):
        limitations.append(
            "No mitigation feasibility score row was available for this action, so the feasibility component used a neutral fallback."
        )
    elif bool(
        _feasibility_component_value(
            feasibility_evidence,
            "mitigation_feasibility",
            "action_score_missing",
            "mitigation_feasibility_action_score_missing",
        )
    ):
        limitations.append(
            "The mitigation feasibility score row was incomplete for this action, so the feasibility component used a neutral fallback."
        )
    if bool(
        _feasibility_component_value(
            feasibility_evidence,
            "financial_feasibility",
            "score_missing",
            "financial_feasibility_score_missing",
        )
    ):
        limitations.append(
            "No financial feasibility score row was available for this action, so the financial feasibility component used a neutral fallback."
        )
    elif bool(
        _feasibility_component_value(
            feasibility_evidence,
            "financial_feasibility",
            "action_score_missing",
            "financial_feasibility_action_score_missing",
        )
    ):
        limitations.append(
            "The financial feasibility score row was incomplete for this action, so the financial feasibility component used a neutral fallback."
        )
    return limitations


def _coerce_unit_score(score_value: object) -> float | None:
    """Normalize one component score into the expected 0..1 range."""
    if not isinstance(score_value, int | float):
        return None
    return min(max(float(score_value), 0.0), 1.0)


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
