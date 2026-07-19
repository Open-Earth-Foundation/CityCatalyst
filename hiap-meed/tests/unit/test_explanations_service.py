"""Unit tests for post-ranking explanation helpers."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.services import explanations as explanations_service
from app.modules.prioritizer.internal_models import Action, ScoredAction
from app.modules.prioritizer.services.explanations import (
    EXPLANATION_PROMPT_WARNING_CHARS,
    ExplanationItem,
    _build_prompt,
    _build_curated_action_payload,
    _rows_to_explanations,
    _warn_if_prompt_is_large,
)


def test_build_curated_action_payload_uses_notion_explanation_slots() -> None:
    """Curated payload should expose the fixed Notion proposal slots."""
    scored_action = ScoredAction(
        action=Action(action_id="A_1", action_name="Electrify municipal bus fleet"),
        impact_score=0.82,
        alignment_score=0.61,
        feasibility_score=0.52,
        final_score=0.68,
        rank=1,
        evidence={
            "impact": {
                "impact_band": "high",
                "timeline_bucket": "<5 years",
                "timeline_bucket_known": True,
                "timeline_component_score": 0.5,
                "matched_city_subsector_keys_count": 2,
                "matched_city_subsector_keys": ["II.1", "II.2"],
                "emissions_reduction_component_score": 0.9,
                "subsector_contributors": [
                    {
                        "subsector_key": "II.1",
                        "city_emissions": 31.0,
                        "scoring_city_emissions_magnitude": 31.0,
                        "share_of_city": 0.31,
                        "reduction_amount": 24.8,
                    },
                    {
                        "subsector_key": "II.2",
                        "city_emissions": 4.0,
                        "scoring_city_emissions_magnitude": 4.0,
                        "share_of_city": 0.04,
                        "reduction_amount": 3.2,
                    },
                ],
            },
            "alignment": {
                "sector_match": True,
                "mapped_sector_tags": ["transportation"],
                "city_preference_sectors": ["transportation"],
                "sector_component_score": 1.0,
                "policy_component_score": 0.8,
                "policy_score_present": True,
                "policy_support_category": "strong",
                "policy_evidence": [
                    {
                        "evidence_rank": 1,
                        "document_name": "National Fleet Electrification Plan",
                        "signal_relation": "commits",
                        "evidence_text": "Sets targets for zero-emission buses.",
                    }
                ],
                "matched_preferred_co_benefits_count": 0,
                "matched_preferred_co_benefits": [],
                "city_preference_co_benefit_keys": ["air_quality"],
                "city_selected_co_benefits_present": True,
                "co_benefit_component_score": 0.5,
                "timeframe_match_label": "exact_match",
                "city_preference_timeframes": ["short"],
                "action_timeframe_label": "short",
                "action_timeline_bucket": "<5 years",
                "timeframe_component_score": 1.0,
            },
            "feasibility": {
                "legal": {
                    "assessment_present": True,
                    "assessment_missing": False,
                    "verdict_category": "conditional",
                    "component_source": "verdict_score",
                    "component_score": 0.85,
                    "verdict_score_missing": False,
                },
                "mitigation_feasibility": {
                    "component_score": 0.8,
                    "score_present": True,
                    "score_missing": False,
                },
                "financial_feasibility": {
                    "component_score": 0.45,
                    "score_present": True,
                    "score_missing": False,
                    "route": "needs co-financing",
                    "reason": "Capital-intensive investment likely needs external co-financing.",
                },
            },
        },
    )

    payload = _build_curated_action_payload(scored_action=scored_action)

    assert payload["action_id"] == "A_1"
    assert payload["action_name"] == "Electrify municipal bus fleet"
    assert payload["rank"] == 1
    assert set(payload) == {
        "action_id",
        "rank",
        "action_name",
        "explanation_slots",
        "known_limitations",
    }

    slots = payload["explanation_slots"]
    assert slots["impact_driver"] == {
        "kind": "subsector_share",
        "subsector_key": "II.1",
        "subsector_label": "on-road transportation",
        "sector_key": "II",
        "sector_label": "Transportation",
        "share_of_city_percent": 31.0,
        "share_phrase": "31%",
        "impact_band": "high",
    }
    assert slots["alignment_driver"]["policy"]["document_name"] == (
        "National Fleet Electrification Plan"
    )
    assert slots["alignment_driver"]["sector_priority"]["matched_sectors"] == [
        "Transportation"
    ]
    assert slots["alignment_driver"]["co_benefit_priority"][
        "city_selected_co_benefits"
    ] == ["air quality"]
    assert slots["alignment_driver"]["timeframe"]["status"] == "aligned"
    assert slots["feasibility_driver"] == {
        "kind": "weakest_component",
        "stance": "constraint",
        "component": "financial_feasibility",
        "component_label": "financial feasibility",
        "bucket": "weak",
        "route": "needs co-financing",
        "reason": "Capital-intensive investment likely needs external co-financing.",
    }
    assert payload["known_limitations"] == []


def test_build_curated_action_payload_allows_supportive_feasibility_slot() -> None:
    """Feasibility slot should be supportive when the weakest component is strong."""
    payload = _build_curated_action_payload(
        scored_action=ScoredAction(
            action=Action(
                action_id="A_2",
                action_name="Promote agroecological certification",
            ),
            impact_score=0.42,
            alignment_score=0.2,
            feasibility_score=0.9,
            final_score=0.5,
            rank=8,
            evidence={
                "impact": {
                    "impact_band": "medium",
                    "matched_city_subsector_keys_count": 1,
                    "emissions_reduction_component_score": 0.11,
                    "subsector_contributors": [
                        {
                            "subsector_key": "V.1",
                            "share_of_city": 0.11,
                            "reduction_amount": 5.5,
                        }
                    ],
                },
                "alignment": {
                    "sector_match": False,
                    "mapped_sector_tags": ["afolu"],
                    "city_preference_sectors": ["transportation"],
                    "sector_component_score": 0.0,
                    "policy_component_score": 0.0,
                    "policy_score_present": False,
                    "matched_preferred_co_benefits": [],
                    "city_preference_co_benefit_keys": [],
                    "city_selected_co_benefits_present": False,
                    "timeframe_match_label": "not_scored",
                },
                "feasibility": {
                    "legal": {
                        "assessment_present": True,
                        "component_score": 0.95,
                    },
                    "mitigation_feasibility": {
                        "component_score": 0.9,
                        "score_present": True,
                    },
                    "financial_feasibility": {
                        "component_score": 0.85,
                        "score_present": True,
                        "route": "self-deliverable",
                        "reason": "Low-capital action the city can deliver itself.",
                    },
                },
            },
        )
    )

    slots = payload["explanation_slots"]
    assert slots["impact_driver"]["subsector_label"] == "livestock"
    assert slots["impact_driver"]["sector_label"] == "AFOLU"
    assert slots["impact_driver"]["share_phrase"] == "11%"
    assert slots["alignment_driver"]["policy"]["status"] == "not_present"
    assert slots["alignment_driver"]["sector_priority"]["matched_sectors"] == []
    assert slots["alignment_driver"]["timeframe"] == {"status": "not_notable"}
    assert slots["feasibility_driver"] == {
        "kind": "weakest_component",
        "stance": "support",
        "component": "financial_feasibility",
        "component_label": "financial feasibility",
        "bucket": "very_strong",
        "route": "self-deliverable",
        "reason": "Low-capital action the city can deliver itself.",
    }


def test_build_curated_action_payload_keeps_known_limitations() -> None:
    """Known limitations should stay as the only non-slot explanation context."""
    payload = _build_curated_action_payload(
        scored_action=ScoredAction(
            action=Action(action_id="A_3", action_name="Missing evidence action"),
            impact_score=0.1,
            alignment_score=0.1,
            feasibility_score=0.1,
            final_score=0.1,
            rank=3,
            evidence={
                "impact": {},
                "alignment": {},
                "feasibility": {
                    "legal": {
                        "assessment_present": False,
                        "assessment_missing": True,
                        "component_score": 0.5,
                        "verdict_score_missing": False,
                    },
                    "mitigation_feasibility": {
                        "component_score": 0.5,
                        "score_missing": True,
                        "action_score_missing": False,
                    },
                    "financial_feasibility": {
                        "component_score": 0.5,
                        "score_missing": True,
                        "action_score_missing": False,
                    },
                },
            },
        )
    )

    assert payload["known_limitations"] == [
        "No legal assessment row was available for this action, so the legal component used a neutral fallback.",
        "No mitigation feasibility score row was available for this action, so the feasibility component used a neutral fallback.",
        "No financial feasibility score row was available for this action, so the financial feasibility component used a neutral fallback.",
    ]


def test_rows_to_explanations_filters_unknown_ids_and_empty_text() -> None:
    """Structured rows should keep only valid explanations for expected IDs."""
    rows = [
        ExplanationItem(action_id="A_1", explanation="First explanation."),
        ExplanationItem(action_id="A_2", explanation="   "),
        ExplanationItem(action_id="A_3", explanation="Should be ignored."),
        ExplanationItem(action_id="   ", explanation="Invalid id"),
    ]

    result = _rows_to_explanations(
        explanation_rows=rows, expected_action_ids={"A_1", "A_2"}
    )

    assert result == {"A_1": "First explanation."}


def test_warn_if_prompt_is_large_logs_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Oversized explanation prompts should emit a warning."""
    prompt = "x" * (EXPLANATION_PROMPT_WARNING_CHARS + 1)
    warning_messages: list[str] = []

    def fake_warning(message: str, *args: object) -> None:
        warning_messages.append(message % args)

    monkeypatch.setattr(explanations_service.logger, "warning", fake_warning)
    _warn_if_prompt_is_large(prompt=prompt, locode="CL IQQ", action_count=25)

    assert any("Large explanation prompt detected" in message for message in warning_messages)


def test_build_prompt_is_canonical_english_only() -> None:
    """Prompt should explicitly anchor explanation generation in English."""
    prompt = _build_prompt(
        locode="CL IQQ",
        city_preference_sectors=["waste"],
        city_preference_co_benefit_keys=["air_quality", "mobility"],
        curated_actions=[],
    )

    assert "Write every explanation in English." in prompt
    assert "Core grounding rules:" in prompt
    assert "Sentence plan:" in prompt
    assert "Sentence 1 rendering rules:" in prompt
    assert "Sentence 2 rendering rules:" in prompt
    assert "Sentence 3 rendering rules:" in prompt
    assert "Style guardrails:" in prompt
    assert "Sentence 1: impact driver from `explanation_slots.impact_driver`." in prompt
    assert "Sentence 2: alignment driver from `explanation_slots.alignment_driver`." in prompt
    assert "Sentence 3: feasibility driver from `explanation_slots.feasibility_driver`." in prompt
    assert "If `feasibility_driver.stance` is `support`" in prompt
    assert "If `feasibility_driver.stance` is `mixed`" in prompt
    assert "Do not infer extra benefits" in prompt
    assert "Do not repeat the score bars in prose" in prompt
    assert "On-road transportation accounts for 31% of the city's inventory" in prompt
    assert "Avoid broad repeated sector wording" in prompt
    assert "Do not write schema-derived phrases" in prompt
    assert "matches the city's <timeframe> timeframe preference" in prompt
    assert "fits the city's short-term timeframe preference" in prompt
    assert "mention co-benefits and timeframe as separate facts" in prompt
    assert "matches the city's air quality co-benefit with a short-term timeframe" in prompt
    assert "Livestock accounts for 11% of the city's inventory" in prompt
    assert "Financial feasibility is the main constraint" in prompt
    assert "Financial feasibility is supportive" in prompt
    assert "main_strengths" not in prompt
    assert "main_constraints" not in prompt
    assert "score_bands" not in prompt
    assert "impact_signals" not in prompt
    assert '"air_quality", "mobility"' in prompt
