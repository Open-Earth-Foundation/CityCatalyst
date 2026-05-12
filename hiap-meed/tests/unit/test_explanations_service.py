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
                "matched_city_subsector_keys_count": 2,
                "matched_city_subsector_keys": ["I.1", "I.2"],
            },
            "alignment": {
                "sector_match": True,
                "city_preference_sectors": ["stationary_energy"],
                "policy_signals_count": 2,
                "matched_preferred_co_benefits_count": 1,
                "timeframe_match_label": "preferred_match",
                "city_preference_timeframes": ["short"],
            },
            "feasibility": {
                "soft_legal_aligned_count": 1,
                "soft_legal_total_count": 2,
                "informational_requirements_summary_available": False,
                "informational_requirements": [{"signal_code": "PERMIT"}],
                "missing_city_socioeconomic_indicator_keys": [],
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
    assert payload["alignment_signals"]["sector_match"] is True
    assert payload["alignment_signals"]["matched_preferred_co_benefits_count"] == 1
    assert payload["feasibility_signals"]["informational_requirements_count"] == 1
    assert payload["main_strengths"] == [
        "Expected to make a relatively strong emissions reduction in the current city inventory.",
        "Matches the city's preferred sector.",
        "Fits the city's preferred implementation timeframe.",
    ]
    assert payload["main_constraints"] == []
    assert payload["known_limitations"] == [
        "Non-blocking legal constraints are included as evidence, but UI-friendly implementation notes are not fully implemented yet.",
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
