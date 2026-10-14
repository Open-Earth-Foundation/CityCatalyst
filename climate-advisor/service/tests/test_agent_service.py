"""AgentService initialization and prompt configuration."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services.agent_service import AgentService
from tests.agent_service_fixtures import build_mock_settings


class AgentServiceInitializationTests(unittest.TestCase):
    """Tests for AgentService initialization."""

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_initializes_with_settings(self, mock_get_settings) -> None:
        """Test AgentService initializes and loads settings."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()
            self.assertIsNotNone(service)
            self.assertEqual(service.default_model, "openai/gpt-5.6-terra")
            self.assertEqual(service.default_temperature, 0.0)

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_normalizes_openai_model_ids_for_openai_base_url(
        self,
        mock_get_settings,
    ) -> None:
        """Test provider-prefixed model IDs are normalized for direct OpenAI calls."""
        mock_settings = build_mock_settings(
            base_url="https://api.openai.com/v1",
            default_model="openai/gpt-4.1",
            agentic_flow_model="openai/gpt-5.6-sol",
        )
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()

        self.assertEqual(service.default_model, "gpt-4.1")
        self.assertEqual(service.agentic_flow_model, "gpt-5.6-sol")

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_keeps_provider_prefix_for_openrouter_base_url(
        self,
        mock_get_settings,
    ) -> None:
        """Test provider-prefixed model IDs remain unchanged for OpenRouter routing."""
        mock_settings = build_mock_settings(
            base_url="https://openrouter.ai/api/v1",
            default_model="openai/gpt-4.1",
        )
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()

        self.assertEqual(service.default_model, "openai/gpt-4.1")

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_ignores_agentic_flow_env_override(
        self,
        mock_get_settings,
    ) -> None:
        """Test the agentic-flow model comes from llm_config even if an env override is set."""
        mock_settings = build_mock_settings(
            base_url="https://api.openai.com/v1",
            default_model="openai/gpt-4.1",
            agentic_flow_model="openai/gpt-5.6-sol",
        )
        mock_get_settings.return_value = mock_settings

        with patch.dict(
            "os.environ", {"OPENROUTER_AGENTIC_FLOW_MODEL": "openai/gpt-4.1-mini"}
        ):
            with patch("app.services.agent_service.AsyncOpenAI"):
                service = AgentService()

        self.assertEqual(service.agentic_flow_model, "gpt-5.6-sol")

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_raises_without_api_key(self, mock_get_settings) -> None:
        """Test AgentService raises error when API key is missing."""
        mock_settings = build_mock_settings(api_key=None)
        mock_get_settings.return_value = mock_settings

        with self.assertRaises(ValueError) as ctx:
            AgentService()

        self.assertIn("OpenRouter API key", str(ctx.exception))

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_with_citycatalyst_token(self, mock_get_settings) -> None:
        """Test AgentService initializes with CityCatalyst token."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id="thread-123",
                cc_user_id="user-456",
            )

            self.assertEqual(service.cc_access_token, "jwt-token")
            self.assertEqual(service.cc_thread_id, "thread-123")
            self.assertEqual(service.cc_user_id, "user-456")
            self.assertEqual(service._token_ref["value"], "jwt-token")

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_without_citycatalyst_token(self, mock_get_settings) -> None:
        """Test AgentService initializes without CityCatalyst token."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService(cc_access_token=None)
            self.assertIsNone(service.cc_access_token)


class SystemPromptLoadingTests(unittest.TestCase):
    """Tests for system prompt loading."""

    @patch("app.services.agent_service.get_settings")
    def test_system_prompt_loaded_from_config(self, mock_get_settings) -> None:
        """Test system prompt is loaded from LLM config."""
        mock_settings = build_mock_settings(prompt="You are a helpful climate advisor.")
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()
            self.assertEqual(
                service.system_prompt, "You are a helpful climate advisor."
            )
            mock_settings.llm.prompts.compose_prompt.assert_any_call("chat")

    @patch("app.services.agent_service.get_settings")
    def test_temperature_from_config(self, mock_get_settings) -> None:
        """Test orchestrator temperature is loaded from LLM config."""
        mock_settings = build_mock_settings(
            temperature=0.5,
            prompt="Prompt",
        )
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()
            self.assertEqual(service.default_temperature, 0.5)
