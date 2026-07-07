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


def test_build_curated_action_payload_uses_qualitative_evidence() -> None:
    """Curated payload should expose qualitative signals and known limitations."""
    scored_action = ScoredAction(
        action=Action(action_id="A_1", action_name="Retrofit buildings"),
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
                "matched_city_subsector_keys": ["I.1", "I.2"],
                "emissions_reduction_component_score": 0.9,
            },
            "alignment": {
                "sector_match": True,
                "city_preference_sectors": ["stationary_energy"],
                "sector_component_score": 1.0,
                "policy_component_score": 0.5,
                "policy_score_present": True,
                "matched_preferred_co_benefits_count": 0,
                "city_selected_co_benefits_present": True,
                "co_benefit_component_score": 0.5,
                "timeframe_match_label": "preferred_match",
                "city_preference_timeframes": ["short"],
                "timeframe_component_score": 1.0,
            },
            "feasibility": {
                "legal": {
                    "assessment_present": True,
                    "assessment_missing": False,
                    "verdict_category": "conditional",
                    "component_source": "verdict_score",
                    "component_score": 0.5,
                    "verdict_score_missing": False,
                },
                "mitigation_feasibility": {
                    "component_score": 0.5,
                    "score_present": False,
                    "score_missing": False,
                },
                "financial_feasibility": {
                    "component_score": 0.5,
                    "score_present": False,
                    "score_missing": False,
                    "route": "self-deliverable",
                    "reason": "Low-capital action.",
                },
            },
        },
    )

    payload = _build_curated_action_payload(
        scored_action=scored_action,
    )

    assert payload["action_id"] == "A_1"
    assert "action_name" not in payload
    assert payload["rank"] == 1
    assert payload["score_bands"] == {
        "final": "moderate",
        "impact": "high",
        "alignment": "moderate",
        "feasibility": "moderate",
    }
    assert payload["impact_signals"]["impact_band"] == "high"
    assert payload["impact_signals"]["matched_city_subsector_keys_count"] == 2
    assert payload["impact_signals"]["emissions_reduction_component_bucket"] == "very_strong"
    assert payload["impact_signals"]["timeline_component_bucket"] == "neutral"
    assert payload["alignment_signals"]["sector_match"] is True
    assert payload["alignment_signals"]["sector_component_bucket"] == "very_strong"
    assert payload["alignment_signals"]["policy_component_bucket"] == "neutral"
    assert payload["alignment_signals"]["co_benefit_component_bucket"] == "neutral"
    assert payload["feasibility_signals"]["legal_component_bucket"] == "neutral"
    assert (
        payload["feasibility_signals"]["mitigation_feasibility_component_bucket"]
        == "neutral"
    )
    assert (
        payload["feasibility_signals"]["financial_feasibility_component_bucket"]
        == "neutral"
    )
    assert (
        payload["feasibility_signals"]["financial_feasibility_route"]
        == "self-deliverable"
    )
    assert (
        payload["feasibility_signals"]["financial_feasibility_reason"]
        == "Low-capital action."
    )
    assert payload["main_strengths"] == [
        "Expected to make a very strong emissions reduction in the current city inventory.",
        "Matches the city's preferred sector.",
        "Fits the city's preferred implementation timeframe.",
    ]
    assert payload["main_constraints"] == []
    assert payload["known_limitations"] == []


def test_build_curated_action_payload_uses_policy_buckets_for_strength() -> None:
    """Policy support wording should distinguish neutral, strong, and very strong scores."""
    base_evidence = {
        "impact": {
            "impact_band": "low",
            "matched_city_subsector_keys_count": 0,
            "emissions_reduction_component_score": 0.0,
            "timeline_bucket_known": False,
            "timeline_component_score": 0.5,
        },
        "alignment": {
            "matched_preferred_co_benefits_count": 0,
            "policy_score_present": True,
        },
        "feasibility": {
            "legal": {
                "assessment_present": False,
                "assessment_missing": True,
                "component_score": 0.5,
                "component_source": "neutral_fallback",
                "verdict_score_missing": False,
            },
            "mitigation_feasibility": {
                "score_present": False,
                "score_missing": True,
            },
        },
    }

    neutral_payload = _build_curated_action_payload(
        scored_action=ScoredAction(
            action=Action(action_id="A_2", action_name="Support score neutral"),
            impact_score=0.2,
            alignment_score=0.5,
            feasibility_score=0.1,
            final_score=0.2,
            rank=2,
            evidence={
                **base_evidence,
                "alignment": {
                    **base_evidence["alignment"],
                    "policy_component_score": 0.5,
                },
            },
        )
    )

    strong_payload = _build_curated_action_payload(
        scored_action=ScoredAction(
            action=Action(action_id="A_3", action_name="Support score strong"),
            impact_score=0.2,
            alignment_score=0.6,
            feasibility_score=0.1,
            final_score=0.2,
            rank=3,
            evidence={
                **base_evidence,
                "alignment": {
                    **base_evidence["alignment"],
                    "policy_component_score": 0.6,
                },
            },
        )
    )

    very_strong_payload = _build_curated_action_payload(
        scored_action=ScoredAction(
            action=Action(action_id="A_4", action_name="Support score very strong"),
            impact_score=0.2,
            alignment_score=0.9,
            feasibility_score=0.1,
            final_score=0.3,
            rank=4,
            evidence={
                **base_evidence,
                "alignment": {
                    **base_evidence["alignment"],
                    "policy_component_score": 0.9,
                },
            },
        )
    )

    assert (
        "Shows strong supportive policy context in the current evidence."
        not in neutral_payload["main_strengths"]
    )
    assert (
        "Shows strong supportive policy context in the current evidence."
        in strong_payload["main_strengths"]
    )
    assert (
        "Shows very strong supportive policy context in the current evidence."
        in very_strong_payload["main_strengths"]
    )


def test_build_curated_action_payload_uses_component_buckets_for_constraints() -> None:
    """Constraint text should follow weak component buckets across the blocks."""
    payload = _build_curated_action_payload(
        scored_action=ScoredAction(
            action=Action(action_id="A_5", action_name="Slow, weak fit"),
            impact_score=0.1,
            alignment_score=0.1,
            feasibility_score=0.1,
            final_score=0.1,
            rank=5,
            evidence={
                "impact": {
                    "impact_band": "low",
                    "timeline_bucket": ">10 years",
                    "timeline_bucket_known": True,
                    "timeline_component_score": 0.0,
                    "matched_city_subsector_keys_count": 0,
                    "emissions_reduction_component_score": 0.0,
                },
                "alignment": {
                    "city_preference_sectors": ["waste"],
                    "sector_component_score": 0.0,
                    "city_preference_timeframes": ["short"],
                    "timeframe_component_score": 0.0,
                    "policy_score_present": True,
                    "policy_component_score": 0.1,
                    "city_selected_co_benefits_present": True,
                    "co_benefit_component_score": 0.2,
                },
                "feasibility": {
                    "legal": {
                        "assessment_present": True,
                        "assessment_missing": False,
                        "component_score": 0.0,
                        "component_source": "verdict_score",
                        "verdict_score_missing": False,
                    },
                    "mitigation_feasibility": {
                        "component_score": 0.25,
                        "score_present": True,
                        "score_missing": False,
                    },
                    "financial_feasibility": {
                        "component_score": 0.2,
                        "score_present": True,
                        "score_missing": False,
                    },
                },
            },
        )
    )

    assert payload["main_constraints"] == [
        "Does not directly match a subsector with recorded city emissions in the current inventory.",
        "Its expected emissions benefits arrive on a slow timeline.",
        "Does not match the city's preferred sector.",
        "Does not fit the city's preferred implementation timeframe.",
        "Shows very weak supportive policy context in the current evidence.",
        "Offers very weak support for the city's preferred co-benefits.",
        "Shows very weak legal feasibility conditions in the current evidence.",
        "Shows weaker mitigation feasibility for the current city.",
        "Needs a difficult financing route for the current city.",
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
    assert "Focus on the biggest ranking drivers" in prompt
    assert "Do not infer extra benefits" in prompt
    assert '"air_quality", "mobility"' in prompt
