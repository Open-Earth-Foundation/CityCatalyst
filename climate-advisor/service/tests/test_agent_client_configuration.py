"""Provider routing and OpenRouter client configuration."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.agent_service import AgentService
from tests.agent_service_fixtures import build_mock_settings


class OpenRouterClientConfigurationTests(unittest.TestCase):
    """Tests for OpenRouter client configuration."""

    @patch.dict("os.environ", {"OPENROUTER_REFERER": "https://custom.ai"})
    @patch("app.services.agent_service.get_settings")
    def test_openrouter_client_sets_referer_header(self, mock_get_settings) -> None:
        """Test OpenRouter client is configured with proper referer header."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI") as mock_client_class:
            AgentService()

            # Verify AsyncOpenAI was initialized with headers
            mock_client_class.assert_called_once()
            call_kwargs = mock_client_class.call_args[1]
            self.assertIn("default_headers", call_kwargs)
            headers = call_kwargs["default_headers"]
            self.assertIn("HTTP-Referer", headers)

    @patch("app.services.agent_service.get_settings")
    def test_openrouter_client_has_correct_base_url(self, mock_get_settings) -> None:
        """Test OpenRouter client uses correct base URL."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI") as mock_client_class:
            AgentService()

            call_kwargs = mock_client_class.call_args[1]
            self.assertEqual(call_kwargs["base_url"], "https://openrouter.ai/api/v1")

    @patch("app.services.agent_service.get_settings")
    def test_openrouter_client_uses_llm_config_base_url(
        self, mock_get_settings
    ) -> None:
        """Test OpenRouter client still uses llm_config when the copied settings field is empty."""
        mock_settings = build_mock_settings()
        mock_settings.openrouter_base_url = None
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI") as mock_client_class:
            AgentService()

            call_kwargs = mock_client_class.call_args[1]
            self.assertEqual(call_kwargs["base_url"], "https://openrouter.ai/api/v1")

    @patch.dict(
        "os.environ",
        {"OPENROUTER_TIMEOUT_MS": "120000", "OPENROUTER_MAX_RETRIES": "9"},
    )
    @patch("app.services.agent_service.get_settings")
    def test_openrouter_client_ignores_timeout_and_retry_env_overrides(
        self,
        mock_get_settings,
    ) -> None:
        """Test OpenRouter timeout and retry settings come from llm_config, not env."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI") as mock_client_class:
            AgentService()

            call_kwargs = mock_client_class.call_args[1]
            self.assertEqual(call_kwargs["timeout"], 30.0)
            self.assertEqual(call_kwargs["max_retries"], 3)

    @patch("app.services.agent_service.get_settings")
    def test_agent_service_uses_shared_openrouter_options_helper(
        self,
        mock_get_settings,
    ) -> None:
        """Test AgentService delegates OpenRouter settings resolution to the shared helper."""

        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings
        client_kwargs = {
            "api_key": "test-key",
            "base_url": "https://custom-openrouter.example/v1",
            "timeout": 30.0,
            "max_retries": 3,
            "default_headers": {
                "HTTP-Referer": "https://citycatalyst.ai",
                "X-Title": "CityCatalyst Climate Advisor",
                "Accept": "application/json",
            },
        }

        with (
            patch(
                "app.services.agent_service.build_openrouter_client_options",
                return_value=SimpleNamespace(
                    base_url="https://custom-openrouter.example/v1",
                    kwargs=client_kwargs,
                ),
            ) as mock_builder,
            patch("app.services.agent_service.AsyncOpenAI") as mock_client_class,
        ):
            service = AgentService()

        mock_builder.assert_called_once_with(
            mock_settings,
            missing_api_key_message="OpenRouter API key (OPENROUTER_API_KEY) must be set",
        )
        mock_client_class.assert_called_once_with(**client_kwargs)
        self.assertEqual(service._chat_base_url, "https://custom-openrouter.example/v1")
