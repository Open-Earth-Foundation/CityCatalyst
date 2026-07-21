"""Unit tests for prioritizer explanation generation (ON-6039)."""

from __future__ import annotations

import inspect
import warnings
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import prioritizer.utils.add_explanations as add_explanations_module
from prioritizer.models import Explanation
from prioritizer.utils.add_explanations import generate_multilingual_explanation


def _mock_completion(parsed) -> SimpleNamespace:
    """Build a minimal OpenAI-like completion with message.parsed."""
    message = SimpleNamespace(parsed=parsed)
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice])


@pytest.mark.unit
def test_module_does_not_use_wrap_openai_for_parse_client() -> None:
    """Structured parse must use a plain OpenAI client (no wrap_openai import)."""
    source = inspect.getsource(add_explanations_module)
    assert "from langsmith.wrappers import wrap_openai" not in source
    assert "traceable" in source
    assert isinstance(add_explanations_module.openai_client, add_explanations_module.OpenAI)


@pytest.mark.unit
def test_generate_multilingual_explanation_returns_explanation_content() -> None:
    """Successful parse should return Explanation with expected language fields."""
    languages = ["en", "pt"]
    expected_en = "Restoring mangroves helps against climate impacts."
    expected_pt = "Restaurar manguezais ajuda contra impactos climáticos."
    action = {
        "ActionID": "c40_0010",
        "ActionType": ["mitigation"],
        "ActionName": "Mangrove restoration",
        "Description": "Restore coastal mangroves",
    }

    def _fake_parse(**kwargs):
        # Use the same dynamic model class the helper passes as response_format
        model_cls = kwargs["response_format"]
        return _mock_completion(model_cls(en=expected_en, pt=expected_pt))

    with (
        patch.object(
            add_explanations_module,
            "get_national_strategy_for_prompt",
            return_value=[],
        ),
        patch.object(
            add_explanations_module,
            "build_prompt_inputs",
            return_value=({}, action),
        ),
        patch.object(
            add_explanations_module.openai_client.beta.chat.completions,
            "parse",
            side_effect=_fake_parse,
        ) as mock_parse,
    ):
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            result = generate_multilingual_explanation(
                country_code="BR",
                city_data={"locode": "BR RIO"},
                single_action=action,
                rank=1,
                languages=languages,
            )

    assert isinstance(result, Explanation)
    assert result.explanations["en"] == expected_en
    assert result.explanations["pt"] == expected_pt
    mock_parse.assert_called_once()
    warning_text = " ".join(str(item.message) for item in captured)
    assert "PydanticSerializationUnexpectedValue" not in warning_text
    assert "Expected none" not in warning_text or "field_name='parsed'" not in warning_text


@pytest.mark.unit
def test_generate_multilingual_explanation_returns_none_when_parsed_is_none() -> None:
    """Missing parsed payload must return None (explicit failure)."""
    action = {
        "ActionID": "c40_0010",
        "ActionType": ["mitigation"],
        "ActionName": "Test",
        "Description": "Test",
    }

    with (
        patch.object(
            add_explanations_module,
            "get_national_strategy_for_prompt",
            return_value=[],
        ),
        patch.object(
            add_explanations_module,
            "build_prompt_inputs",
            return_value=({}, action),
        ),
        patch.object(
            add_explanations_module.openai_client.beta.chat.completions,
            "parse",
            return_value=_mock_completion(None),
        ),
    ):
        result = generate_multilingual_explanation(
            country_code="BR",
            city_data={},
            single_action=action,
            rank=1,
            languages=["en"],
        )

    assert result is None


@pytest.mark.unit
def test_generate_multilingual_explanation_returns_none_for_wrong_parsed_type() -> None:
    """Wrong parsed type must return None instead of inventing an explanation."""
    action = {
        "ActionID": "c40_0010",
        "ActionType": ["mitigation"],
        "ActionName": "Test",
        "Description": "Test",
    }

    with (
        patch.object(
            add_explanations_module,
            "get_national_strategy_for_prompt",
            return_value=[],
        ),
        patch.object(
            add_explanations_module,
            "build_prompt_inputs",
            return_value=({}, action),
        ),
        patch.object(
            add_explanations_module.openai_client.beta.chat.completions,
            "parse",
            return_value=_mock_completion({"en": "not a model"}),
        ),
    ):
        result = generate_multilingual_explanation(
            country_code="BR",
            city_data={},
            single_action=action,
            rank=1,
            languages=["en"],
        )

    assert result is None
