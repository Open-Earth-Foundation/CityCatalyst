"""Credential-scoped native catalog tool composition."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

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
