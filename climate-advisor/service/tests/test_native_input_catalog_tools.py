from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
from unittest.mock import AsyncMock

import pytest
from agents.tool import ToolContext

from app.services.citycatalyst_client import CityCatalystClientError
from app.services.native_input_catalog_service import (
    ActiveRequestContext,
    NativeInputDiscovery,
    NativeInputSelection,
)
from app.tools.native_input_catalog_tools import build_native_input_catalog_tools


@dataclass
class _StubClient:
    response: dict[str, Any] = field(
        default_factory=lambda: {
            "action": "ghgi.inventory.status_overview",
            "success": True,
            "data": {"completion": {"filled": 31}},
        }
    )
    last_refreshed_token: Optional[str] = None
    error: Exception | None = None
    requests: list[dict[str, Any]] = field(default_factory=list)
    closed: bool = False

    async def read_native_input(
        self,
        *,
        request_payload: dict[str, Any],
        token: Optional[str],
        user_id: str,
        thread_id: str,
    ) -> dict[str, Any]:
        if self.error:
            raise self.error
        self.requests.append(
            {
                "request_payload": request_payload,
                "token": token,
                "user_id": user_id,
                "thread_id": thread_id,
            }
        )
        return self.response

    async def close(self) -> None:
        self.closed = True


def _selection(
    *,
    capability_id: str = "ghgi.inventory.status_overview",
) -> NativeInputSelection:
    return NativeInputSelection(
        catalog_id="catalog-1",
        capability_id=capability_id,
        context=ActiveRequestContext(
            user_id="user-1",
            thread_id="thread-1",
            organization_id="organization-1",
            project_id="project-1",
            city_id="city-1",
            inventory_id="inventory-1",
        ),
    )


def _tool_context(name: str) -> ToolContext:
    return ToolContext(
        context=None,
        tool_call_id="test-call",
        tool_name=name,
        tool_arguments={},
    )


def _find_tool(tools: list[object] | tuple[object, ...]) -> object:
    if len(tools) != 1:
        raise AssertionError(f"expected one selected tool, got {len(tools)}")
    return tools[0]


def _build(
    client: _StubClient,
    *,
    token_ref: Optional[dict[str, Optional[str]]] = None,
    capability_id: str = "ghgi.inventory.status_overview",
) -> tuple[object, dict[str, Optional[str]]]:
    ref = token_ref or {"value": "jwt-token"}
    tools = build_native_input_catalog_tools(
        selection=_selection(capability_id=capability_id),
        discovery=NativeInputDiscovery(
            entries=(
                {
                    "catalog_id": "catalog-1",
                    "kind": "inventory_import",
                    "owning_module": "ghgi",
                    "source_type": "inventory",
                    "capability_ids": (capability_id,),
                },
                {
                    "catalog_id": "catalog-unselected",
                    "kind": "hiap_ranking",
                    "owning_module": "hiap",
                    "source_type": "hiap_ranking",
                    "capability_ids": ("hiap.inventory.context",),
                },
            )
        ),
        token_ref=ref,
        client_factory=lambda: client,
    )
    return _find_tool(tools), ref


@pytest.mark.asyncio
async def test_only_selected_capability_creates_a_tool_without_preloading_or_reading() -> None:
    client = _StubClient()

    tool, _ = _build(client)

    assert getattr(tool, "name", "") == "native_input_ghgi_inventory_status_overview"
    assert client.requests == []
    assert not client.closed


def test_unselected_discovery_entries_are_never_loaded_or_exposed_as_tools() -> None:
    client = _StubClient()

    tools = build_native_input_catalog_tools(
        selection=_selection(),
        discovery=NativeInputDiscovery(
            entries=(
                {
                    "catalog_id": "catalog-1",
                    "kind": "inventory_import",
                    "owning_module": "ghgi",
                    "source_type": "inventory",
                    "capability_ids": ("ghgi.inventory.status_overview",),
                },
                {
                    "catalog_id": "catalog-unselected",
                    "kind": "hiap_ranking",
                    "owning_module": "hiap",
                    "source_type": "hiap_ranking",
                    "capability_ids": ("hiap.inventory.context",),
                },
            )
        ),
        token_ref={"value": "jwt-token"},
        client_factory=lambda: client,
    )

    assert [getattr(tool, "name", "") for tool in tools] == [
        "native_input_ghgi_inventory_status_overview"
    ]
    assert client.requests == []
    assert not client.closed


@pytest.mark.asyncio
async def test_selected_tool_reads_only_bound_context_with_declared_bounded_input() -> None:
    client = _StubClient()
    tool, _ = _build(client)

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload["success"] is True
    assert client.requests == [
        {
            "request_payload": {
                "user_id": "user-1",
                "organization_id": "organization-1",
                "project_id": "project-1",
                "city_id": "city-1",
                "inventory_id": "inventory-1",
                "catalog_id": "catalog-1",
                "capability_id": "ghgi.inventory.status_overview",
                "input": {"city_id": "city-1", "inventory_id": "inventory-1"},
            },
            "token": "jwt-token",
            "user_id": "user-1",
            "thread_id": "thread-1",
        }
    ]
    assert client.closed


def test_selected_tool_schema_exposes_no_scope_route_source_storage_or_credential_arguments() -> None:
    client = _StubClient()
    tool, _ = _build(client)

    properties = getattr(tool, "params_json_schema")["properties"]

    assert set(properties) == set()
    assert not {
        "user_id",
        "organization_id",
        "project_id",
        "city_id",
        "inventory_id",
        "catalog_id",
        "capability_id",
        "route",
        "source_id",
        "storage_path",
        "token",
        "credentials",
    }.intersection(properties)


@pytest.mark.asyncio
async def test_selected_tool_removes_forbidden_fields_from_success_result() -> None:
    client = _StubClient(
        response={
            "action": "ghgi.inventory.status_overview",
            "success": True,
            "data": {
                "completion": {"filled": 31},
                "inventory_id": "private-inventory-id",
                "object_key": "private/raw/source.json",
                "safe_label": "Downtown inventory",
            },
        }
    )
    tool, _ = _build(client)

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload["success"] is True
    assert payload["data"] == {
        "completion": {"filled": 31},
        "safe_label": "Downtown inventory",
    }
    assert "private" not in output


@pytest.mark.asyncio
async def test_selected_tool_rejects_malicious_runtime_arguments_before_core_call() -> None:
    client = _StubClient()
    tool, _ = _build(client)
    malicious_arguments = json.dumps(
        {
            "user_id": "attacker-user",
            "catalog_id": "attacker-catalog",
            "capability_id": "forged.capability",
            "route": "/private/raw/source",
            "source_id": "private-source-id",
            "storage_path": "s3://private-bucket/object",
            "token": "private-token",
            "input": {"payload": "x" * 100_000},
        }
    )

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        malicious_arguments,
    )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "invalid_arguments"
    assert "attacker" not in output
    assert "private" not in output
    assert client.requests == []


@pytest.mark.asyncio
async def test_selected_tool_rejects_oversized_result_without_serializing_it() -> None:
    client = _StubClient(
        response={
            "action": "ghgi.inventory.status_overview",
            "success": True,
            "data": {"payload": "x" * 100_000, "object_key": "private/raw/object"},
        }
    )
    tool, _ = _build(client)

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "invalid_response"
    assert len(output) < 2_000
    assert "private/raw/object" not in output


@pytest.mark.asyncio
async def test_selected_tool_isolates_execution_failure_and_closes_client() -> None:
    client = _StubClient(error=RuntimeError("private upstream failure"))
    tool, _ = _build(client)

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "tool_error"
    assert "private upstream failure" not in output
    assert client.closed


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
async def test_selected_tool_rejects_non_finite_result_without_serializing_it(
    value: float,
) -> None:
    client = _StubClient(
        response={
            "action": "ghgi.inventory.status_overview",
            "success": True,
            "data": {"value": value},
        }
    )
    tool, _ = _build(client)

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "invalid_response"
    assert "NaN" not in output
    assert "Infinity" not in output
    assert client.closed


@pytest.mark.asyncio
async def test_selected_tool_failure_telemetry_does_not_include_upstream_exception_text(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _StubClient(error=RuntimeError("private upstream exception detail"))
    tool, _ = _build(client)

    with caplog.at_level(
        logging.WARNING,
        logger="app.tools.native_input_catalog_tools",
    ):
        output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
            _tool_context(getattr(tool, "name")),
            "{}",
        )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "tool_error"
    assert "private upstream exception detail" not in caplog.text
    assert client.closed


@pytest.mark.asyncio
async def test_selected_tool_cancellation_closes_client_without_widening_failure_scope() -> None:
    client = _StubClient(error=asyncio.CancelledError())
    tool, _ = _build(client)

    with pytest.raises(asyncio.CancelledError):
        await tool.on_invoke_tool(  # type: ignore[attr-defined]
            _tool_context(getattr(tool, "name")),
            "{}",
        )

    assert client.closed


def test_catalog_consumer_has_no_direct_storage_or_source_access() -> None:
    source = (
        Path(__file__).parents[1] / "app" / "tools" / "native_input_catalog_tools.py"
    ).read_text(encoding="utf-8")

    forbidden_patterns = (
        "import boto3",
        "from boto3",
        "import aioboto3",
        "from aioboto3",
        "s3://",
        "get_object(",
        "storage_client",
        "os.environ",
        "os.getenv(",
        "open(",
    )
    assert not [pattern for pattern in forbidden_patterns if pattern in source]


@pytest.mark.asyncio
async def test_selected_tool_maps_unavailable_read_without_upstream_error_text() -> None:
    client = _StubClient(
        error=CityCatalystClientError(
            "Requested capability is unavailable. private-source-secret",
            status_code=404,
        )
    )
    tool, _ = _build(client)

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload == {
        "action": "ghgi.inventory.status_overview",
        "success": False,
        "error_code": "capability_unavailable",
        "error": "Requested capability is unavailable.",
    }
    assert "private-source-secret" not in output


@pytest.mark.asyncio
async def test_missing_token_does_not_call_or_load_selected_capability() -> None:
    client = _StubClient()
    tool, _ = _build(client, token_ref={"value": None})

    output = await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "missing_token"
    assert client.requests == []
    assert not client.closed


@pytest.mark.asyncio
async def test_selected_tool_updates_token_reference_and_closes_client() -> None:
    client = _StubClient(last_refreshed_token="fresh-token")
    tool, token_ref = _build(client)

    await tool.on_invoke_tool(  # type: ignore[attr-defined]
        _tool_context(getattr(tool, "name")),
        "{}",
    )

    assert token_ref["value"] == "fresh-token"
    assert client.closed


def test_unknown_selected_capability_creates_no_tool() -> None:
    client = _StubClient()

    tools = build_native_input_catalog_tools(
        selection=_selection(capability_id="forged.capability"),
        discovery=NativeInputDiscovery(
            entries=(
                {
                    "catalog_id": "catalog-1",
                    "kind": "inventory_import",
                    "owning_module": "ghgi",
                    "source_type": "inventory",
                    "capability_ids": ("forged.capability",),
                },
            )
        ),
        token_ref={"value": "jwt-token"},
        client_factory=lambda: client,
    )

    assert tools == []
    assert client.requests == []
