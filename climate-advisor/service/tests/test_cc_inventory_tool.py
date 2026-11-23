from __future__ import annotations

import json
from typing import Any

from app.tools.cc_inventory_tool import CCInventoryTool
from app.tools.cc_inventory_wrappers import build_cc_datasource_tools
from agents.tool import ToolContext


class _StubClient:
    def __init__(self, response: dict | None = None) -> None:
        self.datasources_response = response
        self.tokens_used: list[str | None] = []

    async def get_inventory_datasources(
        self, *args, **kwargs
    ) -> dict:  # type: ignore[override]
        self.tokens_used.append(kwargs.get("token"))
        assert self.datasources_response is not None
        return self.datasources_response

    async def close(self) -> None:  # pragma: no cover - compatibility shim
        return None


def _datasource_tool(
    client: _StubClient, access_token: str | None
) -> tuple[Any, dict[str, str | None]]:
    """Build the get_all_datasources tool and its shared token reference."""
    tools, token_ref = build_cc_datasource_tools(
        inventory_tool=CCInventoryTool(client=client),
        access_token=access_token,
        user_id="user",
        thread_id="thread",
    )
    tool = next(t for t in tools if getattr(t, "name", None) == "get_all_datasources")
    return tool, token_ref


async def _invoke(tool: Any, inventory_id: str) -> dict[str, Any]:
    """Invoke the tool as the Agents SDK would and decode its JSON envelope."""
    arguments = {"inventory_id": inventory_id}
    ctx = ToolContext(
        context=None,
        tool_call_id="test-call",
        tool_name="get_all_datasources",
        tool_arguments=arguments,
    )
    return json.loads(await tool.on_invoke_tool(ctx, json.dumps(arguments)))


async def test_datasource_wrapper_returns_serialized_success() -> None:
    client = _StubClient(
        {
            "data": {
                "successfulSources": [
                    {"datasourceName": "Source A", "sourceType": "third_party"}
                ]
            }
        }
    )
    tool, token_ref = _datasource_tool(client, "initial-token")

    data = await _invoke(tool, "inv-10")

    assert data["action"] == "get_all_datasources"
    assert data["success"] is True
    assert data["data"]["data"][0]["datasourceName"] == "Source A"
    assert token_ref["value"] == "initial-token"


async def test_datasource_wrapper_handles_missing_arguments() -> None:
    tool, _ = _datasource_tool(_StubClient(), "token")

    data = await _invoke(tool, "")

    assert data["success"] is False
    assert data["error_code"] == "invalid_arguments"


async def test_datasource_wrapper_uses_latest_token() -> None:
    client = _StubClient({"data": {"successfulSources": []}})
    tool, token_ref = _datasource_tool(client, "first-token")

    await _invoke(tool, "inv-11")
    client.tokens_used.clear()
    token_ref["value"] = "updated-token"
    await _invoke(tool, "inv-11")

    assert "updated-token" in client.tokens_used


async def test_datasource_wrapper_missing_token() -> None:
    tool, _ = _datasource_tool(_StubClient({"data": {"successfulSources": []}}), None)

    data = await _invoke(tool, "inv-12")

    assert data["success"] is False
    assert data["error_code"] == "missing_token"
