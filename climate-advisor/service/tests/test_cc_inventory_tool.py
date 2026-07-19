from __future__ import annotations

import json
import unittest

from app.services.citycatalyst_client import (
    CityCatalystClientError,
)
from app.tools.cc_inventory_tool import CCInventoryTool
from app.tools.cc_inventory_wrappers import build_cc_datasource_tools
from agents.tool import ToolContext


class _StubClient:
    def __init__(self) -> None:
        self.inventory_response: dict | None = None
        self.datasources_response: dict | None = None
        self.inventory_error: Exception | None = None
        self.tokens_used: list[str | None] = []

    async def get_inventory(self, *args, **kwargs) -> dict:  # type: ignore[override]
        if self.inventory_error:
            raise self.inventory_error
        self.tokens_used.append(kwargs.get("token"))
        assert self.inventory_response is not None
        return self.inventory_response

    async def get_inventory_datasources(
        self, *args, **kwargs
    ) -> dict:  # type: ignore[override]
        if self.inventory_error:
            raise self.inventory_error
        self.tokens_used.append(kwargs.get("token"))
        assert self.datasources_response is not None
        return self.datasources_response

    async def close(self) -> None:  # pragma: no cover - compatibility shim
        return None


class CCInventoryToolTests(unittest.IsolatedAsyncioTestCase):
    """Behavioural tests for the CCInventoryTool."""

    async def test_fetch_inventory_success(self) -> None:
        stub_client = _StubClient()
        stub_client.inventory_response = {
            "data": {"inventoryId": "inv-1", "name": "Inventory One"}
        }
        tool = CCInventoryTool(client=stub_client)

        result = await tool.fetch_inventory(
            "inv-1",
            token="jwt-token",
            user_id="user-1",
            thread_id="thread-1",
        )

        self.assertTrue(result.success)
        self.assertEqual(result.data["data"]["inventoryId"], "inv-1")
        self.assertIsNone(result.error)

    async def test_fetch_inventory_requires_token(self) -> None:
        tool = CCInventoryTool(client=_StubClient())

        result = await tool.fetch_inventory(
            "inv-1",
            token=None,
            user_id="user-1",
            thread_id="thread-1",
        )

        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "missing_token")

    async def test_fetch_inventory_error(self) -> None:
        stub_client = _StubClient()
        stub_client.inventory_error = CityCatalystClientError("API error")
        tool = CCInventoryTool(client=stub_client)

        result = await tool.fetch_inventory(
            "missing",
            token="jwt-token",
            user_id="user-1",
            thread_id="thread-1",
        )

        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "cc_error")

    async def test_datasource_wrapper_returns_serialized_success(self) -> None:
        stub_client = _StubClient()
        stub_client.datasources_response = {
            "data": {
                "successfulSources": [
                    {
                        "datasourceName": "Source A",
                        "sourceType": "third_party",
                    }
                ]
            }
        }
        inventory_tool = CCInventoryTool(client=stub_client)
        tools, token_ref = build_cc_datasource_tools(
            inventory_tool=inventory_tool,
            access_token="initial-token",
            user_id="user-xyz",
            thread_id="thread-xyz",
        )

        datasource_tool = next(
            (t for t in tools if getattr(t, "name", None) == "get_all_datasources"),
            None,
        )
        self.assertIsNotNone(
            datasource_tool, "get_all_datasources tool not found in tools list"
        )
        ctx = ToolContext(
            context=None,
            tool_call_id="test-call",
            tool_name="test_tool",
            tool_arguments={"inventory_id": "inv-10"}
        )
        output = await datasource_tool.on_invoke_tool(  # type: ignore[attr-defined]
            ctx,
            json.dumps({"inventory_id": "inv-10"}),
        )
        data = json.loads(output)
        self.assertEqual(data["action"], "get_all_datasources")
        self.assertTrue(data["success"])
        self.assertEqual(data["data"]["data"][0]["datasourceName"], "Source A")
        self.assertEqual(token_ref["value"], "initial-token")

    async def test_datasource_wrapper_handles_missing_arguments(self) -> None:
        stub_client = _StubClient()
        inventory_tool = CCInventoryTool(client=stub_client)
        tools, _ = build_cc_datasource_tools(
            inventory_tool=inventory_tool,
            access_token="token",
            user_id="user",
            thread_id="thread",
        )
        datasource_tool = tools[0]
        ctx = ToolContext(
            context=None,
            tool_call_id="test-call",
            tool_name="test_tool",
            tool_arguments={"inventory_id": ""}
        )
        output = await datasource_tool.on_invoke_tool(  # type: ignore[attr-defined]
            ctx,
            json.dumps({"inventory_id": ""}),
        )
        data = json.loads(output)
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "invalid_arguments")

    async def test_datasource_wrapper_uses_latest_token(self) -> None:
        stub_client = _StubClient()
        stub_client.datasources_response = {
            "data": {"successfulSources": []}
        }
        inventory_tool = CCInventoryTool(client=stub_client)
        tools, token_ref = build_cc_datasource_tools(
            inventory_tool=inventory_tool,
            access_token="first-token",
            user_id="user",
            thread_id="thread",
        )
        datasource_tool = tools[0]
        ctx = ToolContext(
            context=None,
            tool_call_id="test-call",
            tool_name="test_tool",
            tool_arguments={"inventory_id": "inv-11"}
        )
        await datasource_tool.on_invoke_tool(  # type: ignore[attr-defined]
            ctx,
            json.dumps({"inventory_id": "inv-11"}),
        )
        stub_client.tokens_used.clear()
        token_ref["value"] = "updated-token"
        await datasource_tool.on_invoke_tool(  # type: ignore[attr-defined]
            ctx,
            json.dumps({"inventory_id": "inv-11"}),
        )
        self.assertIn("updated-token", stub_client.tokens_used)

    async def test_datasource_wrapper_missing_token(self) -> None:
        stub_client = _StubClient()
        stub_client.datasources_response = {
            "data": {"successfulSources": []}
        }
        inventory_tool = CCInventoryTool(client=stub_client)
        tools, _ = build_cc_datasource_tools(
            inventory_tool=inventory_tool,
            access_token=None,
            user_id="user",
            thread_id="thread",
        )
        datasource_tool = tools[0]
        ctx = ToolContext(
            context=None,
            tool_call_id="test-call",
            tool_name="test_tool",
            tool_arguments={"inventory_id": "inv-12"}
        )
        output = await datasource_tool.on_invoke_tool(  # type: ignore[attr-defined]
            ctx,
            json.dumps({"inventory_id": "inv-12"}),
        )
        data = json.loads(output)
        self.assertFalse(data["success"])
        self.assertEqual(data["error_code"], "missing_token")
