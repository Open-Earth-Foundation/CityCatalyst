from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import AsyncMock, patch

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

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
