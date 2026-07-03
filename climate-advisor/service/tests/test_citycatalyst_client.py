from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import AsyncMock, patch

import httpx
import pytest

pytest.importorskip("pgvector.sqlalchemy")

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)


class _StubAsyncClient:
    """Minimal stub of httpx.AsyncClient returning canned responses."""

    def __init__(self, responses: List[httpx.Response]) -> None:
        self._responses = responses
        self.requests: List[Dict[str, Any]] = []

    async def get(
        self,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        **kwargs: Any,
    ) -> httpx.Response:  # type: ignore[override]
        self.requests.append(
            {"method": "GET", "url": url, "headers": headers, "extra": kwargs}
        )
        return self._responses.pop(0)

    async def post(
        self,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> httpx.Response:  # type: ignore[override]
        self.requests.append(
            {
                "method": "POST",
                "url": url,
                "headers": headers,
                "json": json,
                "extra": kwargs,
            },
        )
        return self._responses.pop(0)

    async def aclose(self) -> None:  # pragma: no cover - part of httpx interface
        return None


def _response(
    status_code: int,
    *,
    json_data: Optional[Dict[str, Any]] = None,
) -> httpx.Response:
    request = httpx.Request("GET", "https://cc.example/api")
    return httpx.Response(status_code, json=json_data, request=request)


class CityCatalystClientTests(unittest.IsolatedAsyncioTestCase):
    """Unit tests for the CityCatalystClient helper methods."""

    async def test_load_inventory_list_accessible_posts_internal_capability(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(
                base_url="https://cc.example", api_key="test-api-key"
            )
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={
                            "action": "ghgi.inventory.list_accessible",
                            "success": True,
                            "data": {"cities": []},
                        },
                    )
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                result = await client.load_inventory_list_accessible(
                    request_payload={
                        "user_id": "user-1",
                        "city_query": "New York",
                        "year": 2024,
                    },
                    token="jwt-token",
                )

        self.assertEqual(result["action"], "ghgi.inventory.list_accessible")
        recorded = stub.requests[0]
        self.assertEqual(
            recorded["url"],
            "https://cc.example/api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible",
        )
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")
        self.assertEqual(recorded["json"]["city_query"], "New York")

    async def test_load_inventory_status_overview_posts_internal_capability(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={
                            "action": "ghgi.inventory.status_overview",
                            "success": True,
                            "data": {"completion": {"required": 43}},
                        },
                    )
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                result = await client.load_inventory_status_overview(
                    request_payload={
                        "user_id": "user-1",
                        "city_id": "city-1",
                        "inventory_id": "inventory-1",
                    },
                    token="jwt-token",
                )

        self.assertEqual(result["action"], "ghgi.inventory.status_overview")
        recorded = stub.requests[0]
        self.assertEqual(
            recorded["url"],
            "https://cc.example/api/v1/internal/ca/capabilities/ghgi/inventory/status-overview",
        )
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")
        self.assertEqual(recorded["json"]["inventory_id"], "inventory-1")

    async def test_load_inventory_emissions_context_posts_internal_capability(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={
                            "action": "ghgi.inventory.emissions_context",
                            "success": True,
                            "data": {"total_emissions_tco2e": "12500000"},
                        },
                    )
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                result = await client.load_inventory_emissions_context(
                    request_payload={
                        "user_id": "user-1",
                        "city_id": "city-1",
                        "inventory_id": "inventory-1",
                    },
                    token="jwt-token",
                )

        self.assertEqual(result["action"], "ghgi.inventory.emissions_context")
        recorded = stub.requests[0]
        self.assertEqual(
            recorded["url"],
            "https://cc.example/api/v1/internal/ca/capabilities/ghgi/inventory/emissions-context",
        )
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")
        self.assertEqual(recorded["json"]["city_id"], "city-1")

    async def test_inventory_capability_retries_with_refreshed_token_on_401(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(
                cc_base_url="https://cc.example",
                cc_api_key="test-api-key",
            ),
        ), patch("app.services.citycatalyst_client.is_token_expired", return_value=False):
            client = CityCatalystClient()
            stub = _StubAsyncClient(
                [
                    _response(401, json_data={"error": "Unauthorized"}),
                    _response(
                        200,
                        json_data={
                            "access_token": "fresh-token",
                            "expires_in": 3600,
                        },
                    ),
                    _response(
                        200,
                        json_data={
                            "action": "ghgi.inventory.status_overview",
                            "success": True,
                        },
                    ),
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                result = await client.load_inventory_status_overview(
                    request_payload={
                        "user_id": "user-1",
                        "city_id": "city-1",
                        "inventory_id": "inventory-1",
                    },
                    token="expired-token",
                )

        self.assertTrue(result["success"])
        self.assertEqual(client.last_refreshed_token, "fresh-token")
        self.assertEqual(len(stub.requests), 3)
        self.assertEqual(
            stub.requests[0]["url"],
            "https://cc.example/api/v1/internal/ca/capabilities/ghgi/inventory/status-overview",
        )
        self.assertEqual(
            stub.requests[0]["headers"]["Authorization"],
            "Bearer expired-token",
        )
        self.assertEqual(
            stub.requests[1]["url"],
            "https://cc.example/api/v1/internal/ca/user-token",
        )
        self.assertEqual(stub.requests[1]["json"]["user_id"], "user-1")
        self.assertEqual(
            stub.requests[2]["headers"]["Authorization"],
            "Bearer fresh-token",
        )

    async def test_commit_stationary_energy_accepted_posts_internal_capability(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={"results": [{"proposal_id": "proposal-1", "status": "committed"}]},
                    )
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                result = await client.commit_stationary_energy_accepted(
                    request_payload={
                        "draft_run_id": "draft-1",
                        "user_id": "user-1",
                        "city_id": "city-1",
                        "inventory_id": "inventory-1",
                        "rows": [
                            {
                                "row_type": "selected_source",
                                "proposal_id": "proposal-1",
                                "decision_version": 1,
                                "target_ref": {"subsector_id": "I.1", "scope_id": "1"},
                                "selected_source_id": "ds-1",
                            }
                        ],
                    },
                    token="jwt-token",
                )

        self.assertEqual(result["results"][0]["status"], "committed")
        recorded = stub.requests[0]
        self.assertEqual(
            recorded["url"],
            "https://cc.example/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted",
        )
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")
        self.assertEqual(recorded["json"]["rows"][0]["row_type"], "selected_source")
        self.assertEqual(recorded["json"]["rows"][0]["selected_source_id"], "ds-1")

    async def test_commit_stationary_energy_accepted_posts_manual_override_rows(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={"results": [{"proposal_id": "proposal-2", "status": "committed"}]},
                    )
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                await client.commit_stationary_energy_accepted(
                    request_payload={
                        "draft_run_id": "draft-1",
                        "user_id": "user-1",
                        "city_id": "city-1",
                        "inventory_id": "inventory-1",
                        "rows": [
                            {
                                "row_type": "manual_override",
                                "proposal_id": "proposal-2",
                                "decision_version": 2,
                                "target_ref": {"subsector_id": "I.2", "scope_id": "1"},
                                "manual_value": 12.5,
                                "manual_unit": "tCO2e",
                                "note": "Manual reviewer correction",
                            }
                        ],
                    },
                    token="jwt-token",
                )

        recorded = stub.requests[0]
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")
        self.assertEqual(recorded["json"]["rows"][0]["row_type"], "manual_override")
        self.assertEqual(recorded["json"]["rows"][0]["manual_value"], 12.5)
        self.assertEqual(recorded["json"]["rows"][0]["manual_unit"], "tCO2e")

    async def test_get_inventory_success(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ), patch("app.services.citycatalyst_client.is_token_expired", return_value=False):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={"data": {"inventoryId": "inv-123", "name": "Test Inventory"}},
                    )
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                result = await client.get_inventory(
                    "inv-123",
                    token="jwt-token",
                    user_id="user-1",
                )

        self.assertTrue(result)
        self.assertEqual(result["data"]["inventoryId"], "inv-123")

        recorded = stub.requests[0]
        self.assertEqual(recorded["url"], "https://cc.example/api/v1/inventory/inv-123")
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")

    async def test_get_inventory_not_found_raises(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ), patch("app.services.citycatalyst_client.is_token_expired", return_value=False):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(404, json_data={"error": "not found"}),
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                with self.assertRaises(CityCatalystClientError):
                    await client.get_inventory(
                        "missing",
                        token="jwt-token",
                        user_id="user-1",
                    )

    async def test_refresh_token_success(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(
                cc_base_url="https://cc.example",
                cc_api_key="test-api-key",
            ),
        ):
            client = CityCatalystClient()
            stub = _StubAsyncClient(
                [
                    _response(200, json_data={"access_token": "new-token", "expires_in": 3600}),
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                token, expires_in = await client.refresh_token("user-123")

            self.assertEqual(token, "new-token")
            self.assertEqual(expires_in, 3600)
            recorded = stub.requests[0]
            self.assertEqual(
                recorded["url"],
                "https://cc.example/api/v1/internal/ca/user-token"
            )
            self.assertEqual(recorded["headers"]["X-CA-Service-Key"], "test-api-key")
            self.assertEqual(recorded["json"]["user_id"], "user-123")

    async def test_allowed_capabilities_preserves_auth_failure_status(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(base_url="https://cc.example", api_key="test-api-key")
            stub = _StubAsyncClient(
                [
                    _response(401, json_data={"error": "Unauthorized"}),
                ]
            )

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                with self.assertRaises(CityCatalystClientError) as captured:
                    await client.get_stationary_energy_allowed_capabilities(
                        user_id="user-1",
                        city_id="city-1",
                        inventory_id="inventory-1",
                        workflow_step="draft",
                        token="jwt-token",
                    )

        self.assertEqual(captured.exception.status_code, 401)
