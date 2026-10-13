"""Inventory credentials and workflow-scoped tool registration."""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from agents import OpenAIResponsesModel

from app.services.agent_service import AgentService
from tests.agent_service_fixtures import build_mock_settings


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
    def test_create_agent_does_not_fetch_inventory_for_general_chat(
        self,
        mock_get_settings,
    ) -> None:
        """Test general chat no longer preloads active inventory prompt context."""
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings
        inventory_tool = MagicMock()
        inventory_tool.fetch_inventory = AsyncMock()

        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch(
                "app.services.agent_service.CCInventoryTool",
                return_value=inventory_tool,
            ),
            patch(
                "app.services.agent_service.build_cc_datasource_tools",
                return_value=([], {"value": "jwt-token"}),
            ),
            patch(
                "app.services.agent_service.build_inventory_capability_tools",
                return_value=[],
            ),
            patch("app.services.agent_service.Agent"),
        ):
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
            )

            asyncio.run(service.create_agent())

        inventory_tool.fetch_inventory.assert_not_awaited()

    @patch("app.services.agent_service.get_settings")
    def test_stationary_energy_tools_registered_only_with_draft_context(
        self,
        mock_get_settings,
    ) -> None:
        mock_settings = build_mock_settings()
        mock_get_settings.return_value = mock_settings

        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch("app.services.agent_service.Agent") as mock_agent_class,
        ):
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
            self.assertEqual(
                set(tool_names),
                {
                    "inventory_status_overview",
                    "inventory_emissions_context",
                    "stationary_energy_list_review_options",
                    "stationary_energy_list_notation_keys",
                    "stationary_energy_accept_one",
                    "stationary_energy_stage_notation_key",
                    "stationary_energy_accept_multiple",
                    "stationary_energy_accept_all_recommended",
                    "stationary_energy_request_bulk_review_confirmation",
                    "stationary_energy_request_bulk_notation_confirmation",
                    "stationary_energy_apply_bulk_notation_choices",
                    "stationary_energy_request_all_recommended_confirmation",
                    "stationary_energy_request_staged_source_change_confirmation",
                    "stationary_energy_request_staged_sources_rollback_confirmation",
                    "stationary_energy_rollback_staged_sources",
                    "stationary_energy_rollback_staged_notation_keys",
                    "stationary_energy_save_review_draft",
                    "stationary_energy_request_inventory_save_confirmation",
                },
            )
            self.assertNotIn("inventory_list_accessible", tool_names)
            self.assertNotIn("stationary_energy_start_draft", tool_names)
            self.assertNotIn("get_user_inventories", tool_names)
            self.assertNotIn("get_inventory", tool_names)
            self.assertNotIn("get_all_datasources", tool_names)
            self.assertNotIn("city_inventory_search", tool_names)
            self.assertNotIn("climate_vector_search", tool_names)

        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch("app.services.agent_service.Agent") as mock_agent_class,
        ):
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
            self.assertIn("inventory_list_accessible", tool_names)
            self.assertIn("inventory_status_overview", tool_names)
            self.assertIn("inventory_emissions_context", tool_names)
            self.assertIn("get_all_datasources", tool_names)
            self.assertIn("climate_vector_search", tool_names)
            self.assertNotIn("get_user_inventories", tool_names)
            self.assertNotIn("city_inventory_search", tool_names)
            self.assertNotIn("get_inventory", tool_names)
            self.assertNotIn("stationary_energy_accept_one", tool_names)

    @patch("app.services.agent_service.get_settings")
    def test_stationary_energy_start_draft_registered_only_before_draft_exists(
        self,
        mock_get_settings,
    ) -> None:
        """Test start-draft is available only for the pre-draft SE surface."""
        mock_settings = build_mock_settings(prompt="Base prompt")
        mock_get_settings.return_value = mock_settings

        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch("app.services.agent_service.Agent") as mock_agent_class,
        ):
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
            self.assertIn(
                "continue_request",
                start_draft_tool.params_json_schema["properties"],
            )

        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch("app.services.agent_service.Agent") as mock_agent_class,
        ):
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
    def test_stationary_energy_review_prompt_uses_composed_workflow_prompt(
        self,
        mock_get_settings,
    ) -> None:
        mock_settings = build_mock_settings(prompt="Base prompt")
        mock_settings.llm.prompts.compose_prompt.side_effect = lambda prompt_type: {
            "chat": "Composed chat prompt",
            "stationary_energy_review": (
                "Composed Stationary Energy review prompt with tools section"
            ),
        }[prompt_type]
        mock_get_settings.return_value = mock_settings

        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch("app.services.agent_service.Agent") as mock_agent_class,
        ):
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id=uuid4(),
                cc_user_id="user-123",
                session_factory=MagicMock(),
                stationary_energy_draft_run_id=uuid4(),
            )

            asyncio.run(service.create_agent())

            mock_settings.llm.prompts.compose_prompt.assert_any_call(
                "stationary_energy_review"
            )
            instructions = mock_agent_class.call_args.kwargs["instructions"]
            self.assertIn(
                "Composed Stationary Energy review prompt with tools section",
                instructions,
            )
            mock_settings.llm.prompts.get_prompt.assert_not_called()

    @patch("app.services.agent_service.get_settings")
    def test_cnb_chat_selects_composed_prompt_even_when_bundle_is_unavailable(
        self,
        mock_get_settings,
    ) -> None:
        mock_settings = build_mock_settings()
        mock_settings.llm.prompts.compose_prompt.side_effect = lambda name: (
            f"Core + {name}"
        )
        mock_get_settings.return_value = mock_settings
        with (
            patch("app.services.agent_service.AsyncOpenAI"),
            patch(
                "app.services.agent_service.load_agent_context",
                new=AsyncMock(return_value=None),
            ),
            patch("app.services.agent_service.Agent") as agent_class,
        ):
            service = AgentService(
                cc_access_token="token",
                cc_user_id="user-1",
                cc_thread_id=uuid4(),
                session_factory=MagicMock(),
                concept_note_run_id=uuid4(),
            )
            assert service.system_prompt == "Core + cnb_chat"
            asyncio.run(service.create_agent())
            assert agent_class.call_args.kwargs["instructions"] == "Core + cnb_chat"
            assert agent_class.call_args.kwargs["tools"] == []

            assert isinstance(
                agent_class.call_args.kwargs["model"], OpenAIResponsesModel
            )
            model_settings = agent_class.call_args.kwargs["model_settings"]
            assert model_settings.reasoning.summary == "detailed"
            assert model_settings.store is False
            assert model_settings.extra_body is None

            # Rebuilding an agent must not fall back to general chat instructions.
            service.system_prompt = None
            asyncio.run(service.create_agent())
            assert agent_class.call_args.kwargs["instructions"] == "Core + cnb_chat"
            asyncio.run(service.create_agent(instructions="Explicit override"))
            assert agent_class.call_args.kwargs["instructions"] == "Explicit override"
