"""Configured agent models, temperatures, instructions, and tools."""

from __future__ import annotations

import unittest

from tests.agent_service_fixtures import build_mock_settings, mock_agent_creation


class AgentCreationTests(unittest.IsolatedAsyncioTestCase):
    """Tests for agent creation."""

    async def test_create_agent_with_default_model(self) -> None:
        """Test agent creation uses default model from settings."""
        mock_settings = build_mock_settings()

        with mock_agent_creation(mock_settings) as (service, mock_agent_class):
            await service.create_agent()

            # Verify agent was created
            mock_agent_class.assert_called_once()
            call_kwargs = mock_agent_class.call_args[1]
            self.assertEqual(call_kwargs["model"].model, "openai/gpt-5.6-terra")
            self.assertEqual(call_kwargs["model_settings"].temperature, 0.0)

    async def test_create_agent_with_model_override(self) -> None:
        """Test agent creation with model override."""
        mock_settings = build_mock_settings()

        with mock_agent_creation(mock_settings) as (service, mock_agent_class):
            await service.create_agent(model="openai/gpt-4-turbo")

            call_kwargs = mock_agent_class.call_args[1]
            self.assertEqual(call_kwargs["model"].model, "openai/gpt-4-turbo")
            self.assertEqual(call_kwargs["model_settings"].temperature, 0.0)

    async def test_create_agent_strips_provider_prefix_for_openai_base_url(
        self,
    ) -> None:
        """Test agent creation strips provider prefixes for direct OpenAI calls."""
        mock_settings = build_mock_settings(base_url="https://api.openai.com/v1")

        with mock_agent_creation(mock_settings) as (service, mock_agent_class):
            await service.create_agent(model="openai/gpt-4.1")

            call_kwargs = mock_agent_class.call_args[1]
            self.assertEqual(call_kwargs["model"].model, "gpt-4.1")
            self.assertEqual(call_kwargs["model_settings"].temperature, 0.0)

    async def test_create_agent_uses_agentic_flow_temperature(self) -> None:
        """Test agent creation uses agentic-flow temperature for that configured model."""
        mock_settings = build_mock_settings(
            agentic_flow_model="openai/gpt-5.6-sol",
            agentic_flow_temperature=0.3,
        )

        with mock_agent_creation(mock_settings) as (service, mock_agent_class):
            await service.create_agent(model="openai/gpt-5.6-sol")

            call_kwargs = mock_agent_class.call_args[1]
            self.assertEqual(call_kwargs["model"].model, "openai/gpt-5.6-sol")
            self.assertEqual(call_kwargs["model_settings"].temperature, 0.3)

    async def test_create_agent_includes_system_prompt(self) -> None:
        """Test agent creation includes system prompt."""
        mock_settings = build_mock_settings(prompt="You are a helpful climate advisor.")

        with mock_agent_creation(mock_settings) as (service, mock_agent_class):
            await service.create_agent()

            call_kwargs = mock_agent_class.call_args[1]
            # System prompt should be included
            self.assertIsNotNone(call_kwargs.get("instructions"))
            mock_settings.llm.prompts.compose_prompt.assert_any_call("chat")

    async def test_create_agent_includes_tools(self) -> None:
        """Test agent creation includes configured tools."""
        mock_settings = build_mock_settings()

        with mock_agent_creation(mock_settings) as (service, mock_agent_class):
            await service.create_agent()

            call_kwargs = mock_agent_class.call_args[1]
            # Tools should be included
            self.assertIn("tools", call_kwargs)
