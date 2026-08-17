"""Unit tests for explanation translation structured-output path (ON-6039)."""

from __future__ import annotations

import inspect
import warnings
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import prioritizer.utils.translate_explanations as translate_module
from prioritizer.models import Explanation
from prioritizer.utils.translate_explanations import translate_explanation_text


def _mock_completion(parsed) -> SimpleNamespace:
    """Build a minimal OpenAI-like completion with message.parsed."""
    message = SimpleNamespace(parsed=parsed)
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice])


@pytest.mark.unit
def test_translate_module_does_not_use_wrap_openai() -> None:
    """Structured parse must use a plain OpenAI client (no wrap_openai import)."""
    source = inspect.getsource(translate_module)
    assert "from langsmith.wrappers import wrap_openai" not in source
    assert "traceable" in source


@pytest.mark.unit
def test_translate_explanation_text_returns_explanation() -> None:
    """Successful parse should return Explanation with translated fields."""
    languages = ["es", "pt"]
    expected_es = "Texto en español"
    expected_pt = "Texto em português"

    def _fake_parse(**kwargs):
        model_cls = kwargs["response_format"]
        return _mock_completion(model_cls(es=expected_es, pt=expected_pt))

    with patch.object(
        translate_module.openai_client.beta.chat.completions,
        "parse",
        side_effect=_fake_parse,
    ):
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            result = translate_explanation_text(
                explanation_text="English explanation",
                source_language="en",
                target_languages=languages,
            )

    assert isinstance(result, Explanation)
    assert result.explanations["es"] == expected_es
    assert result.explanations["pt"] == expected_pt
    warning_text = " ".join(str(item.message) for item in captured)
    assert "PydanticSerializationUnexpectedValue" not in warning_text


@pytest.mark.unit
def test_translate_explanation_text_returns_none_for_empty_input() -> None:
    """Empty source text should short-circuit without calling OpenAI."""
    result = translate_explanation_text(
        explanation_text="   ",
        source_language="en",
        target_languages=["pt"],
    )
    assert result is None
