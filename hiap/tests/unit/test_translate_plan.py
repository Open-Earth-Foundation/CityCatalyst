"""Unit tests for plan translation structured-output path (ON-6039)."""

from __future__ import annotations

import inspect
import warnings
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import plan_creator_bundle.plan_creator.utils.translate_plan as translate_plan_module
from plan_creator_bundle.plan_creator.models import (
    AdaptationList,
    CostBudget,
    InstitutionList,
    Introduction,
    MerIndicatorList,
    MilestoneList,
    MitigationList,
    PlanContent,
    PlanCreatorMetadata,
    PlanResponse,
    SDGList,
    SubactionList,
    Timeline,
)
from plan_creator_bundle.plan_creator.utils.translate_plan import translate_plan


def _sample_plan(language: str = "en") -> PlanResponse:
    """Build a minimal valid plan response for translation tests."""
    return PlanResponse(
        metadata=PlanCreatorMetadata(
            locode="BR RIO",
            cityName="Rio de Janeiro",
            actionId="MIT001",
            actionName="Solar Installation",
            language=language,
            createdAt=datetime.now(UTC),
        ),
        content=PlanContent(
            introduction=Introduction(
                city_description="Rio is a coastal city.",
                action_description="Install solar on public buildings.",
                national_strategy_explanation="Aligned with national climate policy.",
            ),
            subactions=SubactionList(items=[]),
            institutions=InstitutionList(items=[]),
            milestones=MilestoneList(items=[]),
            timeline=[Timeline()],
            costBudget=[CostBudget()],
            merIndicators=MerIndicatorList(items=[]),
            mitigations=MitigationList(items=[]),
            adaptations=AdaptationList(items=[]),
            sdgs=SDGList(items=[]),
        ),
    )


def _mock_completion(parsed) -> SimpleNamespace:
    """Build a minimal OpenAI-like completion with message.parsed."""
    message = SimpleNamespace(parsed=parsed)
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice])


@pytest.mark.unit
def test_translate_plan_module_does_not_use_wrap_openai() -> None:
    """Structured parse must use a plain OpenAI client (no wrap_openai import)."""
    source = inspect.getsource(translate_plan_module)
    assert "from langsmith.wrappers import wrap_openai" not in source
    assert "traceable" in source


@pytest.mark.unit
def test_translate_plan_extracts_parsed_plan_response() -> None:
    """Successful parse should return PlanResponse with updated language."""
    input_plan = _sample_plan("en")
    parsed_plan = _sample_plan("en")

    with patch.object(
        translate_plan_module.openai_client.beta.chat.completions,
        "parse",
        return_value=_mock_completion(parsed_plan),
    ):
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            result = translate_plan(input_plan, "en", "pt")

    assert isinstance(result, PlanResponse)
    assert result.metadata.language == "pt"
    warning_text = " ".join(str(item.message) for item in captured)
    assert "PydanticSerializationUnexpectedValue" not in warning_text


@pytest.mark.unit
def test_translate_plan_returns_none_when_parsed_is_none() -> None:
    """Missing parsed plan must return None."""
    input_plan = _sample_plan("en")

    with patch.object(
        translate_plan_module.openai_client.beta.chat.completions,
        "parse",
        return_value=_mock_completion(None),
    ):
        result = translate_plan(input_plan, "en", "pt")

    assert result is None


@pytest.mark.unit
def test_translate_plan_skips_when_languages_match() -> None:
    """Identical languages should return the input plan without calling OpenAI."""
    input_plan = _sample_plan("en")
    result = translate_plan(input_plan, "en", "en")
    assert result is input_plan
