from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.citycatalyst_client import CityCatalystClientError
from app.services.native_input_catalog_service import (
    ActiveRequestContext,
    NativeInputCatalogService,
)


@dataclass
class _CoreClientDouble:
    discover_native_inputs: AsyncMock
    read_native_input: AsyncMock


def _context(**overrides: Any) -> ActiveRequestContext:
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


def _client(response: Any) -> _CoreClientDouble:
    return _CoreClientDouble(
        discover_native_inputs=AsyncMock(return_value=response),
        read_native_input=AsyncMock(),
    )


def _discovery_response(catalog_id: str = "catalog-1") -> dict[str, Any]:
    return {
        "action": "native_input.discover",
        "success": True,
        "data": {
            "entries": [
                {
                    "catalog_id": catalog_id,
                    "kind": "inventory_import",
                    "owning_module": "ghgi",
                    "source_type": "inventory",
                    "capability_ids": ["ghgi.inventory.status_overview"],
                    "source_id": "private-source-id",
                    "organization_id": "private-organization-id",
                    "omission_reason": "must-not-cross-boundary",
                }
            ]
        },
    }


@pytest.mark.asyncio
async def test_discovery_calls_core_for_each_invocation_and_returns_current_entries() -> None:
    client = _client(_discovery_response())
    client.discover_native_inputs.side_effect = [
        _discovery_response(),
        _discovery_response(catalog_id="catalog-2"),
    ]
    service = NativeInputCatalogService(core_client=client)

    first = await service.discover(context=_context(), token="jwt-token")
    second = await service.discover(context=_context(), token="jwt-token")

    assert first.entries[0]["catalog_id"] == "catalog-1"
    assert second.entries[0]["catalog_id"] == "catalog-2"
    assert client.discover_native_inputs.await_count == 2
    client.discover_native_inputs.assert_awaited_with(
        request_payload={
            "userId": "user-1",
            "organizationId": "organization-1",
            "projectId": "project-1",
            "cityId": "city-1",
            "inventoryId": "inventory-1",
        },
        token="jwt-token",
        user_id="user-1",
        thread_id="thread-1",
    )
    client.read_native_input.assert_not_awaited()


@pytest.mark.asyncio
async def test_discovery_requires_resolved_context_and_does_not_call_core_without_it() -> None:
    client = _client(_discovery_response())
    service = NativeInputCatalogService(core_client=client)

    result = await service.discover(context=None, token="jwt-token")

    assert result.entries == ()
    client.discover_native_inputs.assert_not_awaited()
    client.read_native_input.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        {"action": "native_input.discover", "success": True, "data": {"entries": []}},
        {"action": "native_input.discover", "success": True, "data": {"entries": "bad"}},
    ],
)
async def test_empty_or_malformed_discovery_registers_no_catalog_state(
    response: dict[str, Any],
) -> None:
    client = _client(response)
    client.discover_native_inputs.side_effect = [_discovery_response(), response]
    service = NativeInputCatalogService(core_client=client)

    await service.discover(context=_context(), token="jwt-token")
    result = await service.discover(context=_context(), token="jwt-token")

    assert result.entries == ()
    client.read_native_input.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        CityCatalystClientError("Core unavailable", status_code=503),
        TimeoutError("Core discovery timed out"),
    ],
)
async def test_unavailable_or_timed_out_discovery_fails_closed_without_catalog_state(
    failure: Exception,
) -> None:
    client = _client(_discovery_response())
    client.discover_native_inputs.side_effect = [_discovery_response(), failure]
    service = NativeInputCatalogService(core_client=client)

    await service.discover(context=_context(), token="jwt-token")
    result = await service.discover(context=_context(), token="jwt-token")

    assert result.entries == ()
    client.read_native_input.assert_not_awaited()


@pytest.mark.asyncio
async def test_disabled_discovery_does_not_load_capabilities_or_call_core() -> None:
    client = _client(_discovery_response())
    service = NativeInputCatalogService(core_client=client, enabled=False)

    result = await service.discover(context=_context(), token="jwt-token")

    assert result.entries == ()
    client.discover_native_inputs.assert_not_awaited()
    client.read_native_input.assert_not_awaited()
