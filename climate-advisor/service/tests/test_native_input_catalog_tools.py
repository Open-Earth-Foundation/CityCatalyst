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
        """Record one selected-read request or raise the configured failure."""
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
        """Record client cleanup."""
        self.closed = True


@dataclass
class _StubCoreClient:
    last_refreshed_token: Optional[str] = None


@dataclass
class _StubService:
    discovery: NativeInputDiscovery
    core_client: _StubCoreClient = field(default_factory=_StubCoreClient)
    discover: AsyncMock = field(init=False)

    def __post_init__(self) -> None:
        """Expose an awaitable discovery double with configurable responses."""
        self.discover = AsyncMock(return_value=self.discovery)


def _context(**overrides: Any) -> ActiveRequestContext:
    """Build a complete captured request context for tool tests."""
    values = {
        "user_id": "user-1",
        "thread_id": "thread-1",
        "organization_id": "organization-1",
        "project_id": "project-1",
        "city_id": "city-1",
        "inventory_id": "inventory-1",
    }
    values.update(overrides)
    return ActiveRequestContext(**values)


def _discovery(
    *,
    catalog_id: str = "catalog-1",
    capability_ids: tuple[str, ...] = ("ghgi.inventory.status_overview",),
) -> NativeInputDiscovery:
    """Build one safe Core discovery result."""
    return NativeInputDiscovery(
        entries=(
            {
                "catalog_id": catalog_id,
                "kind": "inventory_import",
                "owning_module": "ghgi",
                "source_type": "inventory",
                "capability_ids": capability_ids,
            },
        )
    )


def _tool_context(name: str) -> ToolContext:
    """Build the minimum Agents SDK invocation context."""
    return ToolContext(
        context=None,
        tool_call_id="test-call",
        tool_name=name,
        tool_arguments={},
    )


def _build(
    client: _StubClient,
    *,
    service: _StubService | None = None,
    token_ref: Optional[dict[str, Optional[str]]] = None,
) -> tuple[dict[str, object], _StubService, dict[str, Optional[str]]]:
    """Build stable tools and index them by fixed name."""
    actual_service = service or _StubService(_discovery())
    ref = token_ref or {"value": "jwt-token"}
    tools = build_native_input_catalog_tools(
        service=actual_service,
        context=_context(),
        token_ref=ref,
        client_factory=lambda: client,
    )
    return ({getattr(tool, "name"): tool for tool in tools}, actual_service, ref)


def _tool(tools: dict[str, object], name: str) -> object:
    """Return one named tool while keeping test failures descriptive."""
    try:
        return tools[name]
    except KeyError as error:
        raise AssertionError(f"missing tool {name}") from error


def test_builder_registers_two_stable_tools_without_discovery_snapshot() -> None:
    """Stable tools register without discovering or selecting a catalog pair."""
    client = _StubClient()
    service = _StubService(_discovery())

    tools, _, _ = _build(client, service=service)

    assert list(tools) == ["native_input_discover", "native_input_read"]
    service.discover.assert_not_awaited()
    assert client.requests == []
    assert not client.closed


def test_tools_expose_only_fixed_discovery_and_finite_read_schemas() -> None:
    """Tool schemas leave no source, scope, storage, or arbitrary-input escape hatch."""
    tools, _, _ = _build(_StubClient())

    discover_tool = _tool(tools, "native_input_discover")
    read_tool = _tool(tools, "native_input_read")
    discover_schema = getattr(discover_tool, "params_json_schema")
    read_schema = getattr(read_tool, "params_json_schema")

    assert discover_schema == {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    }
    assert read_schema == {
        "type": "object",
        "properties": {
            "catalogId": {"type": "string", "minLength": 1},
            "capabilityId": {"type": "string", "minLength": 1},
            "language": {"type": "string", "maxLength": 16},
        },
        "required": ["catalogId", "capabilityId"],
        "additionalProperties": False,
    }
    assert getattr(discover_tool, "strict_json_schema") is False
    assert getattr(read_tool, "strict_json_schema") is False


@pytest.mark.asyncio
async def test_discovery_is_fresh_filters_unsupported_capabilities_and_exposes_safe_camelcase() -> None:
    """Each discover call returns only current, locally supported safe entries."""
    first = _discovery(catalog_id="catalog-1")
    second = NativeInputDiscovery(
        entries=(
            {
                "catalog_id": "catalog-unsupported",
                "kind": "private_kind",
                "owning_module": "private_module",
                "source_type": "private_source",
                "capability_ids": ("unsupported.capability",),
            },
            {
                "catalog_id": "catalog-2",
                "kind": "inventory_import",
                "owning_module": "ghgi",
                "source_type": "inventory",
                "capability_ids": (
                    "unsupported.capability",
                    "ghgi.inventory.status_overview",
                ),
                "source_id": "private-source-id",
                "storage_path": "private/path",
            },
        )
    )
    service = _StubService(first)
    service.discover.side_effect = [first, second]
    tools, _, _ = _build(_StubClient(), service=service)
    discover = _tool(tools, "native_input_discover")

    await getattr(discover, "on_invoke_tool")(
        _tool_context("native_input_discover"), "{}"
    )
    payload = json.loads(
        await getattr(discover, "on_invoke_tool")(
            _tool_context("native_input_discover"), "{}"
        )
    )

    assert payload == {
        "action": "native_input_discover",
        "success": True,
        "data": {
            "entries": [
                {
                    "catalogId": "catalog-2",
                    "kind": "inventory_import",
                    "owningModule": "ghgi",
                    "sourceType": "inventory",
                    "capabilityIds": ["ghgi.inventory.status_overview"],
                }
            ]
        },
    }
    assert service.discover.await_count == 2
    service.discover.assert_awaited_with(context=_context(), token="jwt-token")
    assert "private" not in json.dumps(payload)


@pytest.mark.asyncio
async def test_discovery_updates_shared_token_reference() -> None:
    """A refreshed discovery token is available to the subsequent bounded read."""
    service = _StubService(_discovery())
    service.core_client.last_refreshed_token = "fresh-token"
    tools, _, token_ref = _build(_StubClient(), service=service)
    discover = _tool(tools, "native_input_discover")

    output = await getattr(discover, "on_invoke_tool")(
        _tool_context("native_input_discover"), "{}"
    )

    assert json.loads(output)["success"] is True
    assert token_ref["value"] == "fresh-token"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "arguments",
    [
        {},
        {"catalogId": "catalog-1"},
        {"catalogId": "", "capabilityId": "ghgi.inventory.status_overview"},
        {"catalogId": "catalog-1", "capabilityId": ""},
        {"catalogId": 1, "capabilityId": "ghgi.inventory.status_overview"},
        {"catalogId": "catalog-1", "capabilityId": 1},
        {"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview", "input": {"unbounded": True}},
        {"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview", "cityId": "attacker-city"},
        {"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview", "storagePath": "private/path"},
        {"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview", "token": "private-token"},
        {"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview", "sourceId": "private-source"},
        {"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview", "language": "en"},
        {"catalogId": "catalog-1", "capabilityId": "unsupported.capability"},
    ],
)
async def test_read_rejects_invalid_or_unbounded_arguments_before_core(arguments: dict[str, Any]) -> None:
    """Only the approved finite v1 schema may reach Core."""
    client = _StubClient()
    tools, _, _ = _build(client)
    read = _tool(tools, "native_input_read")

    output = await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"), json.dumps(arguments)
    )

    payload = json.loads(output)
    assert payload["success"] is False
    assert payload["error_code"] == "invalid_arguments"
    assert client.requests == []
    assert "attacker" not in output
    assert "private" not in output


@pytest.mark.asyncio
async def test_read_rejects_oversized_or_malformed_json_before_core() -> None:
    """Raw tool arguments remain bounded and must be an object."""
    client = _StubClient()
    tools, _, _ = _build(client)
    read = _tool(tools, "native_input_read")

    malformed = await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"), "[not-an-object]"
    )
    oversized = await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"), "x" * (16 * 1024 + 1)
    )

    assert json.loads(malformed)["error_code"] == "invalid_arguments"
    assert json.loads(oversized)["error_code"] == "invalid_arguments"
    assert client.requests == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("capability_id", "arguments", "expected_input"),
    [
        ("ghgi.inventory.status_overview", {}, {"city_id": "city-1", "inventory_id": "inventory-1"}),
        ("ghgi.inventory.emissions_context", {}, {"city_id": "city-1", "inventory_id": "inventory-1"}),
        ("hiap.inventory.context", {"language": "pt-BR"}, {"city_id": "city-1", "inventory_id": "inventory-1", "language": "pt-BR"}),
    ],
)
async def test_read_builds_capability_bounded_core_request(
    capability_id: str, arguments: dict[str, Any], expected_input: dict[str, str]
) -> None:
    """Known capabilities receive only captured scope and their reviewed input."""
    client = _StubClient()
    tools, _, _ = _build(client)
    read = _tool(tools, "native_input_read")

    output = await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"),
        json.dumps({"catalogId": "catalog-1", "capabilityId": capability_id, **arguments}),
    )

    assert json.loads(output)["success"] is True
    assert client.requests == [{
        "request_payload": {
            "userId": "user-1", "organizationId": "organization-1", "projectId": "project-1",
            "cityId": "city-1", "inventoryId": "inventory-1", "catalogId": "catalog-1",
            "capabilityId": capability_id, "input": expected_input,
        },
        "token": "jwt-token", "user_id": "user-1", "thread_id": "thread-1",
    }]
    assert client.closed


@pytest.mark.asyncio
async def test_read_hiap_rejects_invalid_language_before_core() -> None:
    """HIAP permits only a non-empty language of at most sixteen characters."""
    client = _StubClient()
    tools, _, _ = _build(client)
    read = _tool(tools, "native_input_read")

    output = await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"),
        json.dumps({"catalogId": "catalog-1", "capabilityId": "hiap.inventory.context", "language": "x" * 17}),
    )

    assert json.loads(output)["error_code"] == "invalid_arguments"
    assert client.requests == []


@pytest.mark.asyncio
async def test_read_keeps_core_as_revalidation_authority_for_stale_pairs() -> None:
    """The client forwards an undiscovered pair and maps Core's 404 without disclosure."""
    client = _StubClient(error=CityCatalystClientError("Requested capability is unavailable. private-source-secret", status_code=404))
    tools, service, _ = _build(client)
    read = _tool(tools, "native_input_read")
    raw = json.dumps({"catalogId": "fabricated-catalog", "capabilityId": "ghgi.inventory.status_overview"})

    output = await getattr(read, "on_invoke_tool")(_tool_context("native_input_read"), raw)

    assert json.loads(output) == {
        "action": "native_input_read", "success": False, "error_code": "capability_unavailable",
        "error": "Requested capability is unavailable.",
    }
    assert client.requests == []
    assert client.closed
    service.discover.assert_not_awaited()
    assert "fabricated-catalog" not in output
    assert "ghgi.inventory.status_overview" not in output
    assert "private-source-secret" not in output


@pytest.mark.asyncio
async def test_read_redacts_forbidden_fields_and_rejects_oversized_results() -> None:
    """Read output remains safe and bounded independently of Core's response."""
    safe_client = _StubClient(response={
        "action": "ghgi.inventory.status_overview", "success": True,
        "data": {"completion": {"filled": 31}, "inventory_id": "private-inventory-id", "object_key": "private/raw/source.json", "safe_label": "Downtown inventory"},
    })
    tools, _, _ = _build(safe_client)
    read = _tool(tools, "native_input_read")
    arguments = json.dumps({"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview"})

    output = await getattr(read, "on_invoke_tool")(_tool_context("native_input_read"), arguments)

    assert json.loads(output)["data"] == {"completion": {"filled": 31}, "safe_label": "Downtown inventory"}
    assert "private" not in output

    oversized_client = _StubClient(response={"action": "ghgi.inventory.status_overview", "success": True, "data": {"payload": "x" * 100_000}})
    oversized_tools, _, _ = _build(oversized_client)
    oversized = await getattr(_tool(oversized_tools, "native_input_read"), "on_invoke_tool")(_tool_context("native_input_read"), arguments)

    assert json.loads(oversized)["error_code"] == "invalid_response"
    assert len(oversized) < 2_000
    assert oversized_client.closed


@pytest.mark.asyncio
async def test_read_isolates_failures_without_rotating_tokens_and_closes_client(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Read errors neither expose upstream text nor leak a short-lived client."""
    client = _StubClient(error=RuntimeError("private upstream failure"), last_refreshed_token="fresh-token")
    tools, _, token_ref = _build(client)
    read = _tool(tools, "native_input_read")

    with caplog.at_level(logging.WARNING, logger="app.tools.native_input_catalog_tools"):
        output = await getattr(read, "on_invoke_tool")(
            _tool_context("native_input_read"),
            json.dumps({"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview"}),
        )

    assert json.loads(output)["error_code"] == "tool_error"
    assert "private upstream failure" not in output
    assert "private upstream failure" not in caplog.text
    assert client.closed
    assert token_ref["value"] == "jwt-token"


@pytest.mark.asyncio
async def test_read_updates_token_after_successful_core_call() -> None:
    """A Core refresh advances the shared token only after a completed read."""
    client = _StubClient(last_refreshed_token="fresh-token")
    tools, _, token_ref = _build(client)
    read = _tool(tools, "native_input_read")

    await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"),
        json.dumps({"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview"}),
    )

    assert token_ref["value"] == "fresh-token"
    assert client.closed


@pytest.mark.asyncio
async def test_read_propagates_cancellation_after_closing_client() -> None:
    """Cancellation remains visible to the caller while cleanup is guaranteed."""
    client = _StubClient(error=asyncio.CancelledError())
    tools, _, _ = _build(client)
    read = _tool(tools, "native_input_read")

    with pytest.raises(asyncio.CancelledError):
        await getattr(read, "on_invoke_tool")(
            _tool_context("native_input_read"),
            json.dumps({"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview"}),
        )

    assert client.closed


@pytest.mark.asyncio
async def test_missing_token_fails_closed_without_creating_read_client() -> None:
    """Runtime reads do not open Core clients without a current access token."""
    client = _StubClient()
    tools, _, _ = _build(client, token_ref={"value": None})
    read = _tool(tools, "native_input_read")

    output = await getattr(read, "on_invoke_tool")(
        _tool_context("native_input_read"),
        json.dumps({"catalogId": "catalog-1", "capabilityId": "ghgi.inventory.status_overview"}),
    )

    assert json.loads(output)["error_code"] == "missing_token"
    assert client.requests == []
    assert not client.closed


def test_catalog_consumer_has_no_direct_storage_or_source_access() -> None:
    """Climate Advisor remains isolated from raw storage and source pointers."""
    source = (Path(__file__).parents[1] / "app" / "tools" / "native_input_catalog_tools.py").read_text(encoding="utf-8")
    forbidden_patterns = (
        "import boto3", "from boto3", "import aioboto3", "from aioboto3", "s3://",
        "get_object(", "storage_client", "os.environ", "os.getenv(", "open(",
    )
    assert not [pattern for pattern in forbidden_patterns if pattern in source]
