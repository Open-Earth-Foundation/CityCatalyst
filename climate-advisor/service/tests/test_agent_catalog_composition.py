"""Credential-scoped native catalog tool composition."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.config.settings import _load_llm_config
from app.services.agent_service import AgentService
from app.services.native_input_catalog_service import (
    ActiveRequestContext,
)
from app.utils.request_token_refresh import RequestTokenRefreshContext
from tests.agent_service_fixtures import build_mock_settings


class NativeInputCatalogCompositionTests(unittest.IsolatedAsyncioTestCase):
    """Tests for stable runtime NativeInputCatalog tool composition."""

    def _context(self) -> ActiveRequestContext:
        return ActiveRequestContext(
            user_id="user-1",
            thread_id="thread-1",
            organization_id="organization-1",
            project_id="project-1",
            city_id="city-1",
            inventory_id="inventory-1",
        )

    async def test_create_agent_registers_stable_catalog_tools_without_discovery(
        self,
    ) -> None:
        settings = build_mock_settings()
        context = self._context()
        catalog_service = MagicMock()
        catalog_service.discover = AsyncMock()
        refresh_context = RequestTokenRefreshContext(
            canonical_user_id="user-1",
            token="jwt-token",
        )
        stable_tools = [
            SimpleNamespace(name="native_input_discover"),
            SimpleNamespace(name="native_input_read"),
        ]

        def build_tools(**kwargs):
            self.assertIs(kwargs["service"], catalog_service)
            self.assertIs(kwargs["context"], context)
            self.assertIs(kwargs["token_ref"], refresh_context.token_ref)
            return stable_tools

        with (
            patch("app.services.agent_service.get_settings", return_value=settings),
            patch("app.services.agent_service.AsyncOpenAI"),
            patch(
                "app.services.agent_service.build_native_input_catalog_tools",
                create=True,
                side_effect=build_tools,
            ) as mock_build_tools,
            patch("app.services.agent_service.Agent") as mock_agent,
        ):
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id="thread-1",
                cc_user_id="user-1",
                native_input_catalog_service=catalog_service,
                native_input_catalog_context=context,
                request_token_refresh_context=refresh_context,
            )

            await service.create_agent()

        self.assertIs(service._token_ref, refresh_context.token_ref)
        mock_build_tools.assert_called_once()
        catalog_service.discover.assert_not_awaited()
        tool_names = [
            getattr(tool, "name", "") for tool in mock_agent.call_args.kwargs["tools"]
        ]
        self.assertIn("native_input_discover", tool_names)
        self.assertIn("native_input_read", tool_names)
        self.assertIn("climate_vector_search", tool_names)

    async def test_create_agent_skips_catalog_tools_without_active_context(
        self,
    ) -> None:
        settings = build_mock_settings()
        catalog_service = MagicMock()
        catalog_service.discover = AsyncMock()

        with (
            patch("app.services.agent_service.get_settings", return_value=settings),
            patch("app.services.agent_service.AsyncOpenAI"),
            patch(
                "app.services.agent_service.build_native_input_catalog_tools",
                create=True,
            ) as build_tools,
            patch("app.services.agent_service.Agent") as mock_agent,
        ):
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id="thread-1",
                cc_user_id="user-1",
                native_input_catalog_service=catalog_service,
            )

            await service.create_agent()

        catalog_service.discover.assert_not_awaited()
        build_tools.assert_not_called()
        tool_names = [
            getattr(tool, "name", "") for tool in mock_agent.call_args.kwargs["tools"]
        ]
        self.assertIn("climate_vector_search", tool_names)

    async def test_create_agent_skips_catalog_tools_without_core_credential(
        self,
    ) -> None:
        """Catalog tools require a current Core credential as well as context."""
        settings = build_mock_settings()
        context = self._context()
        catalog_service = MagicMock()
        catalog_service.discover = AsyncMock()

        with (
            patch("app.services.agent_service.get_settings", return_value=settings),
            patch("app.services.agent_service.AsyncOpenAI"),
            patch(
                "app.services.agent_service.build_native_input_catalog_tools",
                create=True,
            ) as build_tools,
            patch("app.services.agent_service.Agent") as mock_agent,
        ):
            service = AgentService(
                cc_thread_id="thread-1",
                cc_user_id="user-1",
                native_input_catalog_service=catalog_service,
                native_input_catalog_context=context,
            )

            await service.create_agent()

        catalog_service.discover.assert_not_awaited()
        build_tools.assert_not_called()
        tool_names = [
            getattr(tool, "name", "") for tool in mock_agent.call_args.kwargs["tools"]
        ]
        self.assertNotIn("native_input_discover", tool_names)
        self.assertNotIn("native_input_read", tool_names)

    async def test_create_agent_preserves_existing_tools_when_catalog_service_is_missing(
        self,
    ) -> None:
        settings = build_mock_settings()
        context = self._context()

        with (
            patch("app.services.agent_service.get_settings", return_value=settings),
            patch("app.services.agent_service.AsyncOpenAI"),
            patch(
                "app.services.agent_service.build_native_input_catalog_tools",
                create=True,
            ) as build_tools,
            patch("app.services.agent_service.Agent") as mock_agent,
        ):
            service = AgentService(
                cc_access_token="jwt-token",
                cc_thread_id="thread-1",
                cc_user_id="user-1",
                native_input_catalog_context=context,
            )

            await service.create_agent()

        build_tools.assert_called_once()
        tool_names = [
            getattr(tool, "name", "") for tool in mock_agent.call_args.kwargs["tools"]
        ]
        self.assertIn("climate_vector_search", tool_names)


class ChatPromptCatalogRoutingTests(unittest.TestCase):
    """The composed general-chat prompt must route ranked-action questions to the catalog."""

    def test_composed_chat_prompt_lists_both_catalog_tools_and_hiap_capability(
        self,
    ) -> None:
        prompt = _load_llm_config().prompts.compose_prompt("chat")

        self.assertIn("`native_input_discover`", prompt)
        self.assertIn("`native_input_read`", prompt)
        self.assertIn("hiap.inventory.context", prompt)
        self.assertIn("hiap_meed.ranking.context", prompt)
        self.assertIn("no ranking was found", prompt)
        self.assertIn("inventoryId", prompt)
        self.assertIn("at most 4 cities or city-years", prompt)
        self.assertIn("run discover and read for each inventory separately", prompt)
        self.assertIn("Pass the user's language as `language`", prompt)
        self.assertIn("never print raw action codes", prompt)
        self.assertIn("keep following the cursor", prompt)
        self.assertIn("Only pass an `inventoryId` that `inventory_list_accessible` returned", prompt)

    def test_composed_chat_prompt_routes_views_plans_pillars_and_ambiguity(
        self,
    ) -> None:
        prompt = _load_llm_config().prompts.compose_prompt("chat")

        # Selected versus ranked views, no selection limit, and paging.
        self.assertIn("`scope` `selected`", prompt)
        self.assertIn("`scope` `ranked`", prompt)
        self.assertIn("there is no limit on how many a city selects", prompt)
        self.assertIn("while the result has `truncated` true", prompt)
        self.assertIn("`counts.offset` plus `counts.returned`", prompt)
        # MEED parity gaps are stated, not faked.
        self.assertIn("mitigation actions only", prompt)
        self.assertIn("no city selection", prompt)
        # Plans, plan identification and chapter reads.
        self.assertIn("hiap.action_plan.context", prompt)
        self.assertIn("`displayName`", prompt)
        self.assertIn("`legal_mandate_delivery`", prompt)
        self.assertIn("`financing_precedents_pathway`", prompt)
        self.assertIn("`city_fit`", prompt)
        self.assertIn("stores no legal, finance or socioeconomic data", prompt)
        # Pillar glossary with the default weights.
        self.assertIn("Impact 0.55, Alignment 0.22, Feasibility 0.23", prompt)
        # Ambiguity, year comparison and the MEED export ban.
        self.assertIn("ask one short question to choose the inventory", prompt)
        self.assertIn("compare my 2022 and 2023 ranking", prompt)
        self.assertIn("Never offer to export, download or generate a file", prompt)
        self.assertNotIn("the output plan is returned as stored", prompt)
