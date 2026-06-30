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

import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import unittest
from uuid import uuid4

from app.services.agent_service import AgentService


def build_mock_settings(
    *,
    api_key: str | None = "test-key",
    base_url: str = "https://openrouter.ai/api/v1",
    prompt: str = "You are helpful",
    temperature: float = 0.0,
    default_model: str = "openai/gpt-5.4-mini",
    agentic_flow_model: str | None = None,
    agentic_flow_temperature: float | None = None,
):
    """Create a reusable SimpleNamespace matching AgentService expectations."""
    prompts = MagicMock()
    prompts.get_prompt = MagicMock(return_value=prompt)

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
        ),
        agentic_flow=(
            SimpleNamespace(
                name=agentic_flow_model or default_model,
                temperature=(
                    agentic_flow_temperature
                    if agentic_flow_temperature is not None
                    else temperature
                ),
            )
            if agentic_flow_model is not None or agentic_flow_temperature is not None
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
            self.assertEqual(service.default_model, "openai/gpt-5.4-mini")
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
            agentic_flow_model="openai/gpt-5.4",
        )
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()

        self.assertEqual(service.default_model, "gpt-4.1")
        self.assertEqual(service.agentic_flow_model, "gpt-5.4")

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
            agentic_flow_model="openai/gpt-5.4",
        )
        mock_get_settings.return_value = mock_settings

        with patch.dict(
            "os.environ", {"OPENROUTER_AGENTIC_FLOW_MODEL": "openai/gpt-4.1-mini"}
        ):
            with patch("app.services.agent_service.AsyncOpenAI"):
                service = AgentService()

        self.assertEqual(service.agentic_flow_model, "gpt-5.4")

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
            service = AgentService()

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

        with patch(
            "app.services.agent_service.build_openrouter_client_options",
            return_value=SimpleNamespace(
                base_url="https://custom-openrouter.example/v1",
                kwargs=client_kwargs,
            ),
        ) as mock_builder, patch(
            "app.services.agent_service.AsyncOpenAI"
        ) as mock_client_class:
            service = AgentService()

        mock_builder.assert_called_once_with(
            mock_settings,
            missing_api_key_message="OpenRouter API key (OPENROUTER_API_KEY) must be set",
        )
        mock_client_class.assert_called_once_with(**client_kwargs)
        self.assertEqual(service._chat_base_url, "https://custom-openrouter.example/v1")


class AgentCreationTests(unittest.IsolatedAsyncioTestCase):
    """Tests for agent creation."""

    async def test_create_agent_with_default_model(self) -> None:
        """Test agent creation uses default model from settings."""
        mock_settings = build_mock_settings()

        with patch(
            "app.services.agent_service.get_settings", return_value=mock_settings
        ):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    agent = await service.create_agent()

                    # Verify agent was created
                    mock_agent_class.assert_called_once()
                    call_kwargs = mock_agent_class.call_args[1]
                    self.assertEqual(call_kwargs["model"].model, "openai/gpt-5.4-mini")
                    self.assertEqual(call_kwargs["model_settings"].temperature, 0.0)

    async def test_create_agent_with_model_override(self) -> None:
        """Test agent creation with model override."""
        mock_settings = build_mock_settings()

        with patch(
            "app.services.agent_service.get_settings", return_value=mock_settings
        ):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    agent = await service.create_agent(model="openai/gpt-4-turbo")

                    call_kwargs = mock_agent_class.call_args[1]
                    self.assertEqual(call_kwargs["model"].model, "openai/gpt-4-turbo")
                    self.assertEqual(call_kwargs["model_settings"].temperature, 0.0)

    async def test_create_agent_strips_provider_prefix_for_openai_base_url(
        self,
    ) -> None:
        """Test agent creation strips provider prefixes for direct OpenAI calls."""
        mock_settings = build_mock_settings(base_url="https://api.openai.com/v1")

        with patch(
            "app.services.agent_service.get_settings", return_value=mock_settings
        ):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    await service.create_agent(model="openai/gpt-4.1")

                    call_kwargs = mock_agent_class.call_args[1]
                    self.assertEqual(call_kwargs["model"].model, "gpt-4.1")
                    self.assertEqual(call_kwargs["model_settings"].temperature, 0.0)

    async def test_create_agent_uses_agentic_flow_temperature(self) -> None:
        """Test agent creation uses agentic-flow temperature for that configured model."""
        mock_settings = build_mock_settings(
            agentic_flow_model="openai/gpt-5.4",
            agentic_flow_temperature=0.3,
        )

        with patch(
            "app.services.agent_service.get_settings", return_value=mock_settings
        ):
            with patch("app.services.agent_service.AsyncOpenAI"):
                with patch("app.services.agent_service.Agent") as mock_agent_class:
                    service = AgentService()
                    await service.create_agent(model="openai/gpt-5.4")

                    call_kwargs = mock_agent_class.call_args[1]
                    self.assertEqual(call_kwargs["model"].model, "openai/gpt-5.4")
                    self.assertEqual(call_kwargs["model_settings"].temperature, 0.3)

    async def test_create_agent_includes_system_prompt(self) -> None:
        """Test agent creation includes system prompt."""
        mock_settings = build_mock_settings(prompt="You are a helpful climate advisor.")

        with patch(
            "app.services.agent_service.get_settings", return_value=mock_settings
        ):
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

        with patch(
            "app.services.agent_service.get_settings", return_value=mock_settings
        ):
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
        mock_settings = build_mock_settings(prompt="You are a helpful climate advisor.")
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"):
            service = AgentService()
            self.assertEqual(
                service.system_prompt, "You are a helpful climate advisor."
            )

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
                    cc_access_token="jwt-token", cc_user_id="user-123"
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

    @patch("app.services.agent_service.get_settings")
    def test_stationary_energy_tools_registered_only_with_draft_context(
        self,
        mock_get_settings,
    ) -> None:
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"), patch(
            "app.services.agent_service.Agent"
        ) as mock_agent_class:
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
                city_id="city-123",
                inventory_id="inventory-123",
                session_factory=MagicMock(),
                stationary_energy_draft_run_id=uuid4(),
            )

            asyncio.run(service.create_agent())

            tool_names = [
                getattr(tool, "name", "")
                for tool in mock_agent_class.call_args.kwargs["tools"]
            ]
            self.assertIn("inventory_status_overview", tool_names)
            self.assertIn("inventory_emissions_context", tool_names)
            self.assertIn("stationary_energy_accept_one", tool_names)
            self.assertIn("stationary_energy_accept_multiple", tool_names)
            self.assertIn("stationary_energy_accept_all_recommended", tool_names)
            self.assertIn(
                "stationary_energy_request_bulk_review_confirmation",
                tool_names,
            )
            self.assertIn(
                "stationary_energy_request_all_recommended_confirmation",
                tool_names,
            )
            self.assertIn(
                "stationary_energy_request_staged_source_change_confirmation",
                tool_names,
            )
            self.assertIn(
                "stationary_energy_request_staged_sources_rollback_confirmation",
                tool_names,
            )
            self.assertIn("stationary_energy_rollback_staged_sources", tool_names)
            self.assertIn("stationary_energy_save_review_draft", tool_names)
            self.assertIn(
                "stationary_energy_request_inventory_save_confirmation",
                tool_names,
            )
            self.assertNotIn("stationary_energy_start_draft", tool_names)
            self.assertNotIn("get_user_inventories", tool_names)
            self.assertNotIn("get_inventory", tool_names)
            self.assertNotIn("get_all_datasources", tool_names)
            self.assertNotIn("city_inventory_search", tool_names)
            self.assertNotIn("climate_vector_search", tool_names)

        with patch("app.services.agent_service.AsyncOpenAI"), patch(
            "app.services.agent_service.Agent"
        ) as mock_agent_class:
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
                session_factory=MagicMock(),
            )

            asyncio.run(service.create_agent())

            tool_names = [
                getattr(tool, "name", "")
                for tool in mock_agent_class.call_args.kwargs["tools"]
            ]
            self.assertNotIn("stationary_energy_accept_one", tool_names)

    @patch("app.services.agent_service.get_settings")
    def test_stationary_energy_start_draft_registered_only_before_draft_exists(
        self,
        mock_get_settings,
    ) -> None:
        """Test start-draft is available only for the pre-draft SE surface."""
        mock_settings = build_mock_settings(prompt="Base prompt")
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"), patch(
            "app.services.agent_service.Agent"
        ) as mock_agent_class:
            service = AgentService(
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
                city_id="city-123",
                inventory_id="inventory-123",
                session_factory=MagicMock(),
                stationary_energy_surface=True,
            )

            asyncio.run(service.create_agent())

            tool_names = [
                getattr(tool, "name", "")
                for tool in mock_agent_class.call_args.kwargs["tools"]
            ]
            instructions = mock_agent_class.call_args.kwargs["instructions"]
            start_draft_tool = next(
                tool
                for tool in mock_agent_class.call_args.kwargs["tools"]
                if getattr(tool, "name", "") == "stationary_energy_start_draft"
            )
            self.assertIn("stationary_energy_start_draft", tool_names)
            self.assertEqual(instructions, "Base prompt")
            self.assertIn(
                "pre-draft Stationary Energy surface",
                start_draft_tool.description,
            )
            self.assertIn("no arguments", start_draft_tool.description)

        with patch("app.services.agent_service.AsyncOpenAI"), patch(
            "app.services.agent_service.Agent"
        ) as mock_agent_class:
            service = AgentService(
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
                city_id="city-123",
                inventory_id="inventory-123",
                session_factory=MagicMock(),
                stationary_energy_surface=True,
                stationary_energy_draft_run_id=uuid4(),
            )

            asyncio.run(service.create_agent())

            tool_names = [
                getattr(tool, "name", "")
                for tool in mock_agent_class.call_args.kwargs["tools"]
            ]
            self.assertNotIn("stationary_energy_start_draft", tool_names)

    @patch("app.services.agent_service.get_settings")
    def test_stationary_energy_review_prompt_replaces_default_prompt(
        self,
        mock_get_settings,
    ) -> None:
        mock_settings = build_mock_settings(prompt="Base prompt")
        mock_settings.llm.prompts.get_prompt.side_effect = lambda prompt_type: {
            "default": "Base prompt",
            "inventory_context": "Inventory prompt",
            "stationary_energy_review": "Stationary Energy review prompt with tools section",
        }[prompt_type]
        mock_get_settings.return_value = mock_settings

        with patch("app.services.agent_service.AsyncOpenAI"), patch(
            "app.services.agent_service.Agent"
        ) as mock_agent_class:
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
                session_factory=MagicMock(),
                stationary_energy_draft_run_id=uuid4(),
            )

            asyncio.run(service.create_agent())

            mock_settings.llm.prompts.get_prompt.assert_any_call(
                "stationary_energy_review"
            )
            instructions = mock_agent_class.call_args.kwargs["instructions"]
            requested_prompts = [
                call.args[0]
                for call in mock_settings.llm.prompts.get_prompt.call_args_list
            ]
            self.assertNotIn("default", requested_prompts)
            self.assertNotIn("inventory_context", requested_prompts)
            self.assertNotIn("Base prompt", instructions)
            self.assertNotIn("Inventory prompt", instructions)
            self.assertIn(
                "Stationary Energy review prompt with tools section",
                instructions,
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
