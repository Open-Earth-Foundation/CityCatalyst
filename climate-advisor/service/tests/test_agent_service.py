"""
Comprehensive tests for the Agent Service.

Tests cover:
- Agent service initialization
- OpenRouter client configuration
- Agent creation with default and custom models
- Tool registration and availability
- System prompt loading
- CityCatalyst token handling
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.services.agent_service import AgentService


def build_mock_settings(
    *,
    api_key: str | None = "test-key",
    base_url: str = "https://openrouter.ai/api/v1",
    prompt: str = "You are helpful",
    temperature: float = 0.1,
):
    """Create a reusable SimpleNamespace matching AgentService expectations."""
    prompts = MagicMock()
    prompts.get_prompt = MagicMock(return_value=prompt)

    llm_api = SimpleNamespace(
        openrouter=SimpleNamespace(
            base_url=base_url,
            timeout_ms=30000,
        ),
        openai=SimpleNamespace(
            base_url="https://api.openai.com/v1",
            embedding_model="text-embedding-3-small",
        ),
    )

    llm_settings = SimpleNamespace(
        models={"default": "openai/gpt-4o"},
        generation=SimpleNamespace(
            defaults=SimpleNamespace(temperature=temperature)
        ),
        prompts=prompts,
        api=llm_api,
    )

    return SimpleNamespace(
        openrouter_api_key=api_key,
        openrouter_base_url=base_url,
        llm=llm_settings,
        app_name="climate-advisor",
    )


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
            self.assertEqual(service.default_model, "openai/gpt-4o")
            self.assertEqual(service.default_temperature, 0.1)

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
                cc_user_id="user-456"
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


class OpenRouterClientConfigurationTests(unittest.TestCase):
    """Tests for OpenRouter client configuration."""

    @patch.dict("os.environ", {"OPENROUTER_REFERER": "https://custom.ai"})
    @patch("app.services.agent_service.get_settings")
    def test_openrouter_client_sets_referer_header(self, mock_get_settings) -> None:
        """Test OpenRouter client is configured with proper referer header."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI") as mock_client_class:
            service = AgentService()
            
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
            service = AgentService()
            
            call_kwargs = mock_client_class.call_args[1]
            self.assertEqual(
                call_kwargs["base_url"],
                "https://openrouter.ai/api/v1"
            )

    @patch("app.services.agent_service.get_settings")
    def test_openrouter_client_uses_fallback_base_url(self, mock_get_settings) -> None:
        """Test OpenRouter client falls back to default URL if not configured."""
        mock_settings = build_mock_settings()
        mock_settings.openrouter_base_url = None
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI") as mock_client_class:
            service = AgentService()
            
            call_kwargs = mock_client_class.call_args[1]
            self.assertEqual(
                call_kwargs["base_url"],
                "https://openrouter.ai/api/v1"
            )


class AgentCreationTests(unittest.IsolatedAsyncioTestCase):
    """Tests for agent creation."""

    async def test_create_agent_with_default_model(self) -> None:
        """Test agent creation uses default model from settings."""
        mock_settings = build_mock_settings()

        with patch("app.services.agent_service.get_settings", return_value=mock_settings):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    agent = await service.create_agent()
                    
                    # Verify agent was created
                    mock_agent_class.assert_called_once()
                    call_kwargs = mock_agent_class.call_args[1]
                    self.assertEqual(call_kwargs["model"], "openai/gpt-4o")

    async def test_create_agent_with_model_override(self) -> None:
        """Test agent creation with model override."""
        mock_settings = build_mock_settings()

        with patch("app.services.agent_service.get_settings", return_value=mock_settings):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    agent = await service.create_agent(model="openai/gpt-4-turbo")
                    
                    call_kwargs = mock_agent_class.call_args[1]
                    self.assertEqual(call_kwargs["model"], "openai/gpt-4-turbo")

    async def test_create_agent_includes_system_prompt(self) -> None:
        """Test agent creation includes system prompt."""
        mock_settings = build_mock_settings(
            prompt="You are a helpful climate advisor."
        )

        with patch("app.services.agent_service.get_settings", return_value=mock_settings):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    agent = await service.create_agent()
                    
                    call_kwargs = mock_agent_class.call_args[1]
                    # System prompt should be included
                    self.assertIsNotNone(call_kwargs.get("instructions"))

    async def test_create_agent_includes_tools(self) -> None:
        """Test agent creation includes configured tools."""
        mock_settings = build_mock_settings()

        with patch("app.services.agent_service.get_settings", return_value=mock_settings):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    agent = await service.create_agent()
                    
                    call_kwargs = mock_agent_class.call_args[1]
                    # Tools should be included
                    self.assertIn("tools", call_kwargs)


class SystemPromptLoadingTests(unittest.TestCase):
    """Tests for system prompt loading."""

    @patch("app.services.agent_service.get_settings")
    def test_system_prompt_loaded_from_config(self, mock_get_settings) -> None:
        """Test system prompt is loaded from LLM config."""
        mock_settings = build_mock_settings(
            prompt="You are a helpful climate advisor."
        )
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()
            self.assertEqual(
                service.system_prompt,
                "You are a helpful climate advisor."
            )

    @patch("app.services.agent_service.get_settings")
    def test_temperature_from_config(self, mock_get_settings) -> None:
        """Test temperature is loaded from LLM config."""
        mock_settings = build_mock_settings(
            temperature=0.5,
            prompt="Prompt",
        )
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()
            self.assertEqual(service.default_temperature, 0.5)


class InventoryToolIntegrationTests(unittest.TestCase):
    """Tests for CityCatalyst inventory tool integration."""

    @patch("app.services.agent_service.get_settings")
    def test_inventory_tool_initialized_with_token(self, mock_get_settings) -> None:
        """Test inventory tool is initialized when CC token is present."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            with patch("app.services.agent_service.CCInventoryTool"):
                service = AgentService(
                    cc_access_token="jwt-token",
                    cc_user_id="user-123"
                )
                self.assertIsNotNone(service._token_ref)
                self.assertEqual(service._token_ref["value"], "jwt-token")

    @patch("app.services.agent_service.get_settings")
    def test_token_ref_allows_dynamic_update(self, mock_get_settings) -> None:
        """Test token reference allows dynamic token updates."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService(cc_access_token="initial-token")
            self.assertEqual(service._token_ref["value"], "initial-token")
            
            # Simulate token refresh
            service._token_ref["value"] = "refreshed-token"
            self.assertEqual(service._token_ref["value"], "refreshed-token")


if __name__ == "__main__":
    unittest.main(verbosity=2)
