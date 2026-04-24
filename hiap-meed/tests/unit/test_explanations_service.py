"""Unit tests for post-ranking explanation helpers."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.services import explanations as explanations_service
from app.modules.prioritizer.internal_models import Action, ScoredAction
from app.modules.prioritizer.services.explanations import (
    EXPLANATION_FREE_TEXT_MAX_CHARS,
    EXPLANATION_PROMPT_WARNING_CHARS,
    ExplanationItem,
    _build_curated_action_payload,
    _build_known_limitations,
    _rows_to_explanations,
    _truncate_explanation_free_text,
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
                "impact_text": "high",
                "timeline_bucket": "<5 years",
                "matched_city_gpc_refs_count": 2,
                "matched_city_gpc_refs": ["I.1.1", "I.1.2"],
            },
            "alignment": {
                "sector_match": True,
                "mapped_sector_tag": "stationary_energy",
                "policy_signals_count": 2,
                "other_component_mapping_source": "fallback_error",
                "policy_signal_summaries": [
                    {
                        "signal_type": "plan",
                        "signal_relation": "supports",
                        "signal_strength": "strong",
                        "location_scope": "city",
                        "location_name": "Santiago",
                        "evidence_count": 4,
                    }
                ],
                "other_component_value": 0.0,
            },
            "feasibility": {
                "soft_legal_aligned_count": 1,
                "soft_legal_total_count": 2,
                "informational_requirements_notes_are_stub": True,
                "informational_requirements": [{"signal_code": "PERMIT"}],
                "socioeconomic_indicator_rows": [
                    {
                        "action_socioeconomic_indicator_key": "unemployment_rate",
                        "weighted_contribution": 1.2,
                        "rationale": "Labor market conditions support delivery pace.",
                    }
                ],
                "missing_city_socioeconomic_indicator_keys": [],
            },
        },
    )

    payload = _build_curated_action_payload(
        scored_action=scored_action,
        city_preference_other_text="Prioritize air quality outcomes",
    )

    assert payload["action_id"] == "A_1"
    assert payload["rank"] == 1
    assert payload["score_bands"] == {
        "final": "moderate",
        "impact": "high",
        "alignment": "moderate",
        "feasibility": "moderate",
    }
    assert payload["impact_signals"]["impact_band"] == "high"
    assert payload["alignment_signals"]["sector_match"] is True
    assert (
        payload["alignment_signals"]["other_component_mapping_source"]
        == "fallback_error"
    )
    assert payload["feasibility_signals"]["informational_requirements_count"] == 1
    assert payload["known_limitations"] == [
        "City free-text preference was provided, but mapping did not complete successfully; ranking used neutral other-preference scoring.",
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


def test_known_limitations_skip_other_preference_note_when_mapping_succeeds() -> None:
    """Successful mapping should not produce the neutral-fallback limitation note."""
    limitations = _build_known_limitations(
        alignment_evidence={"other_component_mapping_source": "llm"},
        feasibility_evidence={},
        city_preference_other_text="Prioritize cleaner air",
    )

    assert all(
        "neutral other-preference scoring" not in limitation
        for limitation in limitations
    )


def test_truncate_explanation_free_text_warns_and_clamps(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Oversized explanation inputs should be truncated with a warning."""
    oversized_text = "x" * (EXPLANATION_FREE_TEXT_MAX_CHARS + 25)
    warning_messages: list[str] = []

    def fake_warning(message: str, *args: object) -> None:
        warning_messages.append(message % args)

    monkeypatch.setattr(explanations_service.logger, "warning", fake_warning)
    truncated = _truncate_explanation_free_text(
        value=oversized_text,
        field_name="city_preference_other_text",
        locode="CL IQQ",
    )

    assert truncated == oversized_text[:EXPLANATION_FREE_TEXT_MAX_CHARS]
    assert any(
        "Truncating explanation input field `city_preference_other_text`" in message
        for message in warning_messages
    )


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
