"""Unit tests for LLM-assisted co-benefit mapping helpers."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.modules.prioritizer.services import co_benefit_mapping


@pytest.mark.unit
def test_allowed_co_benefit_keys_matches_canonical_taxonomy() -> None:
    """Allowed co-benefit keys expose the canonical taxonomy list."""
    assert list(co_benefit_mapping.ALLOWED_CO_BENEFIT_KEYS) == [
        "air_quality",
        "cost_of_living",
        "habitat",
        "housing",
        "mobility",
        "stakeholder_engagement",
        "water_quality",
    ]


@pytest.mark.unit
def test_resolve_city_preferred_co_benefits_skips_blank_input() -> None:
    """Blank city free text returns a blank-input fallback mapping result."""
    result = co_benefit_mapping.resolve_city_preferred_co_benefits(
        city_preference_other_text="   ",
        available_co_benefit_keys=["air_quality", "housing"],
    )
    assert result["resolved_preferred_co_benefits"] == []
    assert result["mapping_source"] == "fallback_blank_input"


@pytest.mark.unit
def test_resolve_city_preferred_co_benefits_logs_warning_and_falls_back_on_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Resolver fails open when LLM mapping raises an exception."""
    monkeypatch.setenv("HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL", "gpt-test")

    def _boom(**_: object) -> object:
        raise ValueError("parse failed")

    monkeypatch.setattr(co_benefit_mapping, "_resolve_from_llm", _boom)

    result = co_benefit_mapping.resolve_city_preferred_co_benefits(
        city_preference_other_text="air quality and housing",
        available_co_benefit_keys=["air_quality", "housing"],
    )

    assert result["resolved_preferred_co_benefits"] == []
    assert result["mapping_source"] == "fallback_error"
    assert result["warning"] == "parse failed"


@pytest.mark.unit
def test_resolve_city_preferred_co_benefits_truncates_free_text_before_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mapping input is truncated to the configured free-text cap."""
    monkeypatch.setenv("HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL", "gpt-test")
    oversized_text = "A" * (co_benefit_mapping.CO_BENEFIT_MAPPING_FREE_TEXT_MAX_CHARS + 20)

    captured: dict[str, str] = {}

    def _capture(**kwargs: object) -> co_benefit_mapping.CoBenefitMappingResponse:
        captured["text"] = str(kwargs["city_preference_other_text"])
        return co_benefit_mapping.CoBenefitMappingResponse(
            mapped_co_benefits=["air_quality"],
            unmappable_preference_fragments=[],
        )

    monkeypatch.setattr(co_benefit_mapping, "_resolve_from_llm", _capture)

    result = co_benefit_mapping.resolve_city_preferred_co_benefits(
        city_preference_other_text=oversized_text,
        available_co_benefit_keys=["air_quality", "housing"],
    )

    assert len(captured["text"]) == co_benefit_mapping.CO_BENEFIT_MAPPING_FREE_TEXT_MAX_CHARS
    assert result["mapping_source"] == "llm"
    assert result["resolved_preferred_co_benefits"] == ["air_quality"]


@pytest.mark.unit
def test_resolve_city_preferred_co_benefits_fails_open_on_prompt_length_guard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prompt length overflow should fail open before any OpenAI call."""
    monkeypatch.setenv("HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL", "gpt-test")

    monkeypatch.setattr(
        co_benefit_mapping,
        "_read_prompt_template",
        lambda: "A" * (co_benefit_mapping.CO_BENEFIT_MAPPING_PROMPT_MAX_CHARS + 1),
    )
    monkeypatch.setattr(
        co_benefit_mapping,
        "create_openai_client",
        lambda: pytest.fail("OpenAI client should not be called for oversized prompts"),
    )

    result = co_benefit_mapping.resolve_city_preferred_co_benefits(
        city_preference_other_text="air quality and housing",
        available_co_benefit_keys=["air_quality", "housing"],
    )

    assert result["resolved_preferred_co_benefits"] == []
    assert result["mapping_source"] == "fallback_error"
    assert "exceeds max length" in str(result["warning"])


@pytest.mark.unit
def test_co_benefit_mapping_response_rejects_unknown_keys() -> None:
    """Pydantic response schema enforces the allowed co-benefit taxonomy."""
    with pytest.raises(ValidationError):
        co_benefit_mapping.CoBenefitMappingResponse(
            mapped_co_benefits=["public_health"],
            unmappable_preference_fragments=[],
        )


@pytest.mark.unit
def test_score_action_other_preference_component_normalizes_selected_impacts() -> None:
    """Scoring helper normalizes selected co-benefit impacts into `0..1`."""
    score, matched = co_benefit_mapping.score_action_other_preference_component(
        action_co_benefits={
            "air_quality": {"impact_numeric": 1},
            "housing": {"impact_numeric": -1},
        },
        resolved_preferred_co_benefits=["air_quality", "mobility"],
    )
    assert score == pytest.approx(0.625)
    assert matched == ["air_quality"]


@pytest.mark.unit
def test_score_action_other_preference_component_is_neutral_without_priorities() -> None:
    """Scoring helper returns a neutral value when no priorities are selected."""
    score, matched = co_benefit_mapping.score_action_other_preference_component(
        action_co_benefits={"air_quality": {"impact_numeric": 2}},
        resolved_preferred_co_benefits=[],
    )
    assert score == pytest.approx(0.5)
    assert matched == []


@pytest.mark.unit
def test_score_action_other_preference_component_rewards_broader_coverage() -> None:
    """Actions covering more requested co-benefits should score higher."""
    action_with_one_match_score, action_with_one_match = (
        co_benefit_mapping.score_action_other_preference_component(
            action_co_benefits={"air_quality": {"impact_numeric": 2}},
            resolved_preferred_co_benefits=[
                "air_quality",
                "water_quality",
                "habitat",
            ],
        )
    )
    action_with_three_matches_score, action_with_three_matches = (
        co_benefit_mapping.score_action_other_preference_component(
            action_co_benefits={
                "air_quality": {"impact_numeric": 2},
                "water_quality": {"impact_numeric": 2},
                "habitat": {"impact_numeric": 2},
            },
            resolved_preferred_co_benefits=[
                "air_quality",
                "water_quality",
                "habitat",
            ],
        )
    )

    assert action_with_one_match == ["air_quality"]
    assert action_with_three_matches == ["air_quality", "habitat", "water_quality"]
    assert action_with_one_match_score == pytest.approx(2 / 3)
    assert action_with_three_matches_score == pytest.approx(1.0)
    assert action_with_three_matches_score > action_with_one_match_score
