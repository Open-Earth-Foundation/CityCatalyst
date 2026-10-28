"""Unit tests for plan-creator tools."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import plan_creator_bundle.tools.tools as tools_module


@pytest.mark.unit
def test_openai_web_search_uses_configured_search_model() -> None:
    """Web search should use the configured model and preserve its result contract."""
    completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                model_dump=lambda: {
                    "message": {
                        "content": "Search result",
                        "annotations": [{"type": "url_citation"}],
                    }
                }
            )
        ]
    )
    create = MagicMock(return_value=completion)
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )

    with (
        patch.object(
            tools_module, "OPENAI_MODEL_NAME_WEB_SEARCH", "gpt-test-search"
        ),
        patch.object(tools_module, "OpenAI", return_value=client),
    ):
        result = tools_module.openai_web_search_tool.invoke(
            {"query": "city policy", "country": "BR", "city": "Recife"}
        )

    assert result == {
        "content": "Search result",
        "annotations": [{"type": "url_citation"}],
    }
    create.assert_called_once_with(
        model="gpt-test-search",
        web_search_options={
            "user_location": {
                "type": "approximate",
                "approximate": {"country": "BR", "city": "Recife"},
            },
            "search_context_size": "medium",
        },
        messages=[{"role": "user", "content": "city policy"}],
    )
