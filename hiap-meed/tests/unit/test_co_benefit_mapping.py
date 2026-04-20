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
def test_co_benefit_mapping_response_rejects_unknown_keys() -> None:
    """Pydantic response schema enforces the allowed co-benefit taxonomy."""
    with pytest.raises(ValidationError):
        co_benefit_mapping.CoBenefitMappingResponse(
            mapped_co_benefits=["public_health"],
            unmappable_preference_fragments=[],
        )


@pytest.mark.unit
def test_score_action_other_preference_component_uses_simple_overlap() -> None:
    """Scoring helper returns overlap share and matched co-benefit keys."""
    score, matched = co_benefit_mapping.score_action_other_preference_component(
        action_co_benefit_keys={"air_quality", "housing"},
        resolved_preferred_co_benefits=["air_quality", "mobility"],
    )
    assert score == pytest.approx(0.5)
    assert matched == ["air_quality"]
