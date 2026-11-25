"""Settings and provider stubs shared by AgentService test suites."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.agent_service import AgentService


def build_mock_settings(
    *,
    api_key: str | None = "test-key",
    base_url: str = "https://openrouter.ai/api/v1",
    prompt: str = "You are helpful",
    temperature: float = 0.0,
    default_model: str = "openai/gpt-5.6-terra",
    agentic_flow_model: str | None = None,
    agentic_flow_temperature: float | None = None,
    cnb_chat_model: str | None = None,
    cnb_chat_reasoning_effort: str | None = None,
) -> SimpleNamespace:
    """Create a reusable SimpleNamespace matching AgentService expectations."""
    prompts = MagicMock()
    prompts.get_prompt = MagicMock(return_value=prompt)
    prompts.compose_prompt = MagicMock(return_value=prompt)

    llm_api = SimpleNamespace(
        openrouter=SimpleNamespace(
            base_url=base_url,
            timeout_ms=30000,
            retry_attempts=3,
        ),
        openai=SimpleNamespace(
            base_url="https://api.openai.com/v1",
            embedding_model="text-embedding-3-small",
        ),
    )

    models = SimpleNamespace(
        orchestrator=SimpleNamespace(
            name=default_model,
            temperature=temperature,
            reasoning_effort=None,
        ),
        agentic_flow=(
            SimpleNamespace(
                name=agentic_flow_model or default_model,
                reasoning_effort=None,
                temperature=(
                    agentic_flow_temperature
                    if agentic_flow_temperature is not None
                    else temperature
                ),
            )
            if agentic_flow_model is not None or agentic_flow_temperature is not None
            else None
        ),
        cnb_chat=(
            SimpleNamespace(
                name=cnb_chat_model or agentic_flow_model or default_model,
                reasoning_effort=cnb_chat_reasoning_effort,
                temperature=temperature,
            )
            if cnb_chat_model is not None or cnb_chat_reasoning_effort is not None
            else None
        ),
    )

    llm_settings = SimpleNamespace(
        models=models,
        prompts=prompts,
        api=llm_api,
    )

    return SimpleNamespace(
        openrouter_api_key=api_key,
        openrouter_base_url=base_url,
        openrouter_model=default_model,
        llm=llm_settings,
        app_name="climate-advisor",
    )


@contextmanager
def mock_agent_creation(
    settings: SimpleNamespace,
) -> Iterator[tuple[AgentService, MagicMock]]:
    """Capture agent composition without constructing a provider client."""
    with (
        patch("app.services.agent_service.get_settings", return_value=settings),
        patch("app.services.agent_service.AsyncOpenAI"),
        patch("app.services.agent_service.Agent") as agent_class,
    ):
        yield AgentService(), agent_class
