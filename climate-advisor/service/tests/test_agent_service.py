"""AgentService provider routing and OpenRouter client configuration."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.agent_service import AgentService
from app.services.openrouter_client import build_openrouter_client_options
from tests.agent_service_fixtures import build_mock_settings


@pytest.mark.parametrize(
    "base_url, default_model, agentic_model",
    [
        # Direct OpenAI rejects provider-prefixed model IDs.
        ("https://api.openai.com/v1", "gpt-4.1", "gpt-5.6-sol"),
        # OpenRouter routes by the provider prefix, so it must stay.
        ("https://openrouter.ai/api/v1", "openai/gpt-4.1", "openai/gpt-5.6-sol"),
    ],
    ids=["openai", "openrouter"],
)
def test_agent_service_normalizes_model_ids_for_the_provider(
    base_url: str, default_model: str, agentic_model: str
) -> None:
    settings = build_mock_settings(
        base_url=base_url,
        default_model="openai/gpt-4.1",
        agentic_flow_model="openai/gpt-5.6-sol",
    )

    with (
        patch("app.services.agent_service.get_settings", return_value=settings),
        patch("app.services.agent_service.AsyncOpenAI"),
    ):
        service = AgentService()

    assert service.default_model == default_model
    assert service.agentic_flow_model == agentic_model


def test_agent_service_raises_without_api_key() -> None:
    with patch(
        "app.services.agent_service.get_settings",
        return_value=build_mock_settings(api_key=None),
    ):
        with pytest.raises(ValueError, match="OpenRouter API key"):
            AgentService()


def test_openrouter_options_fall_back_to_llm_config(monkeypatch) -> None:
    """An empty copied settings field still uses llm_config; env never overrides it."""
    monkeypatch.setenv("OPENROUTER_TIMEOUT_MS", "120000")
    monkeypatch.setenv("OPENROUTER_MAX_RETRIES", "9")
    settings = build_mock_settings()
    settings.openrouter_base_url = None

    options = build_openrouter_client_options(
        settings, missing_api_key_message="missing"
    )

    assert options.base_url == "https://openrouter.ai/api/v1"
    assert options.kwargs["timeout"] == 30.0
    assert options.kwargs["max_retries"] == 3
    assert "HTTP-Referer" in options.kwargs["default_headers"]
