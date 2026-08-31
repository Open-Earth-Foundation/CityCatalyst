from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.citycatalyst_client import CityCatalystClientError
from app.services.native_input_catalog_service import (
    ActiveRequestContext,
    NativeInputCatalogService,
    NativeInputSelectionError,
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


def _discovery_response() -> dict[str, Any]:
    return {
        "action": "native_input.discover",
        "success": True,
        "data": {
            "entries": [
                {
                    "catalog_id": "catalog-1",
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
async def test_discovery_runs_once_after_context_and_keeps_only_safe_projection() -> None:
    client = _client(_discovery_response())
    service = NativeInputCatalogService(core_client=client)

    first = await service.discover(context=_context(), token="jwt-token")
    second = await service.discover(context=_context(), token="jwt-token")

    assert first.entries == second.entries
    assert first.entries == (
        {
            "catalog_id": "catalog-1",
            "kind": "inventory_import",
            "owning_module": "ghgi",
            "source_type": "inventory",
            "capability_ids": ("ghgi.inventory.status_overview",),
        },
    )
    client.discover_native_inputs.assert_awaited_once_with(
        request_payload={
            "user_id": "user-1",
            "organization_id": "organization-1",
            "project_id": "project-1",
            "city_id": "city-1",
            "inventory_id": "inventory-1",
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
    service = NativeInputCatalogService(core_client=client)

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
    client.discover_native_inputs.side_effect = failure
    service = NativeInputCatalogService(core_client=client)

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


@pytest.mark.asyncio
async def test_selection_binding_requires_exact_current_catalog_and_capability_pair() -> None:
    client = _client(_discovery_response())
    service = NativeInputCatalogService(core_client=client)
    await service.discover(context=_context(), token="jwt-token")

    binding = service.bind_selection(
        catalog_id="catalog-1",
        capability_id="ghgi.inventory.status_overview",
    )

    assert binding.catalog_id == "catalog-1"
    assert binding.capability_id == "ghgi.inventory.status_overview"
    assert binding.context == _context()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "catalog_id,capability_id",
    [
        ("stale-catalog", "ghgi.inventory.status_overview"),
        ("catalog-1", "forged.capability"),
        ("catalog-1", "ghgi.inventory.other"),
        ("catalog-2", "forged.capability"),
    ],
)
async def test_stale_forged_unknown_or_mismatched_selection_is_rejected_without_disclosure(
    catalog_id: str,
    capability_id: str,
) -> None:
    client = _client(_discovery_response())
    service = NativeInputCatalogService(core_client=client)

    await service.discover(context=_context(), token="jwt-token")

    with pytest.raises(NativeInputSelectionError) as captured:
        service.bind_selection(catalog_id=catalog_id, capability_id=capability_id)

    assert str(captured.value) == "Requested capability is unavailable."
    assert "private" not in str(captured.value)
