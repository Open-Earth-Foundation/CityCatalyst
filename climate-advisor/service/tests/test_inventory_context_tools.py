from __future__ import annotations

import json
import unittest
from typing import Any, Dict, Optional

from agents.tool import ToolContext

from app.services.citycatalyst_client import CityCatalystClientError
from app.tools.inventory_context_tools import build_inventory_context_tools


class _StubInventoryContextClient:
    """Capture inventory context capability calls for wrapper tests."""

    def __init__(self) -> None:
        self.status_response: Dict[str, Any] = {
            "action": "ghgi.inventory.status_overview",
            "success": True,
            "data": {"completion": {"required": 43, "filled": 31}},
        }
        self.emissions_response: Dict[str, Any] = {
            "action": "ghgi.inventory.emissions_context",
            "success": True,
            "data": {"total_emissions_tco2e": "12500000"},
        }
        self.error: Exception | None = None
        self.requests: list[Dict[str, Any]] = []
        self.closed = False

    async def load_inventory_status_overview(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self.error:
            raise self.error
        self.requests.append(
            {
                "action": "status",
                "request_payload": request_payload,
                "token": token,
            }
        )
        return self.status_response

    async def load_inventory_emissions_context(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self.error:
            raise self.error
        self.requests.append(
            {
                "action": "emissions",
                "request_payload": request_payload,
                "token": token,
            }
        )
        return self.emissions_response

    async def close(self) -> None:
        self.closed = True


class InventoryContextToolTests(unittest.IsolatedAsyncioTestCase):
    """Tests for read-only whole-inventory tool wrappers."""

    async def test_status_overview_tool_serializes_cc_payload(self) -> None:
        stub_client = _StubInventoryContextClient()
        tools = build_inventory_context_tools(
            resolve_scope=_resolve_scope,
            user_id="user-1",
            token_ref={"value": "jwt-token"},
            client_factory=lambda: stub_client,
        )
        status_tool = _find_tool(tools, "inventory_status_overview")

        output = await status_tool.on_invoke_tool(  # type: ignore[attr-defined]
            _tool_context("inventory_status_overview"),
            "{}",
        )
        data = json.loads(output)

        self.assertEqual(data["action"], "ghgi.inventory.status_overview")
        self.assertTrue(data["success"])
        self.assertEqual(data["data"]["completion"]["filled"], 31)
        self.assertEqual(stub_client.requests[0]["request_payload"]["city_id"], "city-1")
        self.assertEqual(
            stub_client.requests[0]["request_payload"]["inventory_id"],
            "inventory-1",
        )
        self.assertEqual(stub_client.requests[0]["token"], "jwt-token")
        self.assertTrue(stub_client.closed)

    async def test_emissions_context_tool_serializes_cc_payload(self) -> None:
        stub_client = _StubInventoryContextClient()
        tools = build_inventory_context_tools(
            resolve_scope=_resolve_scope,
            user_id="user-1",
            token_ref={"value": "jwt-token"},
            client_factory=lambda: stub_client,
        )
        emissions_tool = _find_tool(tools, "inventory_emissions_context")

        output = await emissions_tool.on_invoke_tool(  # type: ignore[attr-defined]
            _tool_context("inventory_emissions_context"),
            "{}",
        )
        data = json.loads(output)

        self.assertEqual(data["action"], "ghgi.inventory.emissions_context")
        self.assertTrue(data["success"])
        self.assertEqual(data["data"]["total_emissions_tco2e"], "12500000")
        self.assertEqual(stub_client.requests[0]["action"], "emissions")

    async def test_tool_reports_missing_token_without_cc_call(self) -> None:
        stub_client = _StubInventoryContextClient()
        tools = build_inventory_context_tools(
            resolve_scope=_resolve_scope,
            user_id="user-1",
            token_ref={"value": None},
            client_factory=lambda: stub_client,
        )
        status_tool = _find_tool(tools, "inventory_status_overview")

        output = await status_tool.on_invoke_tool(  # type: ignore[attr-defined]
            _tool_context("inventory_status_overview"),
            "{}",
        )
        data = json.loads(output)

        self.assertEqual(data["action"], "ghgi.inventory.status_overview")
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "missing_token")
        self.assertEqual(stub_client.requests, [])

    async def test_tool_preserves_citycatalyst_error_status(self) -> None:
        stub_client = _StubInventoryContextClient()
        stub_client.error = CityCatalystClientError("CC denied", status_code=403)
        tools = build_inventory_context_tools(
            resolve_scope=_resolve_scope,
            user_id="user-1",
            token_ref={"value": "jwt-token"},
            client_factory=lambda: stub_client,
        )
        status_tool = _find_tool(tools, "inventory_status_overview")

        output = await status_tool.on_invoke_tool(  # type: ignore[attr-defined]
            _tool_context("inventory_status_overview"),
            "{}",
        )
        data = json.loads(output)

        self.assertEqual(data["action"], "ghgi.inventory.status_overview")
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "cc_error")
        self.assertEqual(data["status_code"], 403)


async def _resolve_scope() -> tuple[str, str]:
    return "city-1", "inventory-1"


def _find_tool(tools: list[object] | tuple[object, ...], name: str) -> object:
    tool = next((item for item in tools if getattr(item, "name", None) == name), None)
    if tool is None:
        raise AssertionError(f"{name} tool not found")
    return tool


def _tool_context(name: str) -> ToolContext:
    return ToolContext(
        context=None,
        tool_call_id="test-call",
        tool_name=name,
        tool_arguments={},
    )
