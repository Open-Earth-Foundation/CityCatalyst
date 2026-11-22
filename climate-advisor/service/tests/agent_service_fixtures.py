"""Settings stub shared by AgentService test suites."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock


def build_mock_settings(
    *,
    api_key: str | None = "test-key",
    base_url: str = "https://openrouter.ai/api/v1",
    default_model: str = "openai/gpt-5.6-terra",
    agentic_flow_model: str | None = None,
) -> SimpleNamespace:
    """Create a reusable SimpleNamespace matching AgentService expectations."""
    prompts = MagicMock()
    prompts.get_prompt = MagicMock(return_value="You are helpful")
    prompts.compose_prompt = MagicMock(return_value="You are helpful")

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
            temperature=0.0,
            reasoning_effort=None,
        ),
        agentic_flow=(
            SimpleNamespace(
                name=agentic_flow_model, reasoning_effort=None, temperature=0.0
            )
            if agentic_flow_model is not None
            else None
        ),
        cnb_chat=None,
    )

    return SimpleNamespace(
        openrouter_api_key=api_key,
        openrouter_base_url=base_url,
        openrouter_model=default_model,
        llm=SimpleNamespace(models=models, prompts=prompts, api=llm_api),
        app_name="climate-advisor",
    )
