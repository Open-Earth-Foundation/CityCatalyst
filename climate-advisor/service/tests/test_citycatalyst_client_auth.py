from __future__ import annotations

import asyncio
import base64
import json
import time
import unittest
from types import SimpleNamespace
from typing import Any, Optional
from unittest.mock import AsyncMock, patch

import httpx
import pytest

pytest.importorskip("pgvector.sqlalchemy")

from app.services import citycatalyst_client as citycatalyst_client_module
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)
from app.utils.single_flight_cache import SingleFlightTTLCache


class _StubAsyncClient:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self._responses = list(responses)
        self.requests: list[dict[str, Any]] = []

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        self.requests.append({"url": url, **kwargs})
        await asyncio.sleep(0)
        if not self._responses:
            raise AssertionError("No stubbed responses left")
        return self._responses.pop(0)


def _response(status_code: int, *, json_data: Optional[Any] = None) -> httpx.Response:
    request = httpx.Request("POST", "https://cc.example/api")
    return httpx.Response(status_code, json=json_data, request=request)


def _unsigned_jwt(claims: dict[str, Any]) -> str:
    def encode_json(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return (
        f"{encode_json({'alg': 'none', 'typ': 'JWT'})}."
        f"{encode_json(claims)}."
        "signature"
    )


def _refresh_payload(
    *,
    user_id: str = "user-123",
    base_url: str = "https://cc.example",
    token_overrides: Optional[dict[str, Any]] = None,
    payload_overrides: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    claims: dict[str, Any] = {
        "aud": base_url.rstrip("/"),
        "exp": int(time.time()) + 3600,
        "iss": "climate-advisor-service",
        "sub": user_id,
    }
    claims.update(token_overrides or {})
    payload: dict[str, Any] = {
        "access_token": _unsigned_jwt(claims),
        "expires_in": 3600,
        "token_type": "Bearer",
    }
    payload.update(payload_overrides or {})
    return payload


class CityCatalystClientAuthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        """Give every test isolated process-local authorization caches."""
        identity_patch = patch.object(
            citycatalyst_client_module,
            "_IDENTITY_CACHE",
            SingleFlightTTLCache[str](max_entries=16),
        )
        city_patch = patch.object(
            citycatalyst_client_module,
            "_CITY_CACHE",
            SingleFlightTTLCache[dict[str, Any]](max_entries=16),
        )
        identity_patch.start()
        city_patch.start()
        self.addCleanup(identity_patch.stop)
        self.addCleanup(city_patch.stop)

    async def test_identity_validation_is_shared_and_cached_across_clients(
        self,
    ) -> None:
        token = _unsigned_jwt({"exp": int(time.time()) + 3600})
        stub = _StubAsyncClient(
            [_response(200, json_data={"user_id": "user-123"})]
        )
        first_client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="test-api-key",
        )
        second_client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="test-api-key",
        )

        with patch.object(
            first_client,
            "_get_client",
            new=AsyncMock(return_value=stub),
        ), patch.object(
            second_client,
            "_get_client",
            new=AsyncMock(return_value=stub),
        ):
            users = await asyncio.gather(
                first_client.validate_user_identity(token),
                second_client.validate_user_identity(token),
            )
            cached_user = await second_client.validate_user_identity(token)

        self.assertEqual(users, ["user-123", "user-123"])
        self.assertEqual(cached_user, "user-123")
        self.assertEqual(len(stub.requests), 1)

    async def test_identity_validation_failure_is_not_cached(self) -> None:
        token = _unsigned_jwt({"exp": int(time.time()) + 3600})
        stub = _StubAsyncClient(
            [
                _response(503, json_data={"error": "Unavailable"}),
                _response(200, json_data={"user_id": "user-123"}),
            ]
        )
        client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="test-api-key",
        )

        with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
            with self.assertRaises(CityCatalystClientError):
                await client.validate_user_identity(token)
            user_id = await client.validate_user_identity(token)

        self.assertEqual(user_id, "user-123")
        self.assertEqual(len(stub.requests), 2)

    async def test_expired_identity_token_is_not_retained(self) -> None:
        token = _unsigned_jwt({"exp": int(time.time()) - 1})
        stub = _StubAsyncClient(
            [
                _response(200, json_data={"user_id": "user-123"}),
                _response(200, json_data={"user_id": "user-123"}),
            ]
        )
        client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="test-api-key",
        )

        with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
            await client.validate_user_identity(token)
            await client.validate_user_identity(token)

        self.assertEqual(len(stub.requests), 2)

    async def test_city_reads_are_shared_cached_and_copied(self) -> None:
        token = _unsigned_jwt({"exp": int(time.time()) + 3600})
        client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="test-api-key",
        )
        get_with_auto_refresh = AsyncMock(
            return_value=_response(
                200,
                json_data={"city_id": "city-1", "metadata": {"name": "Krakow"}},
            )
        )

        with patch.object(
            client,
            "get_with_auto_refresh",
            new=get_with_auto_refresh,
        ):
            first, second = await asyncio.gather(
                client.get_city("city-1", token, "user-123"),
                client.get_city("city-1", token, "user-123"),
            )
            first["metadata"]["name"] = "Changed"
            cached = await client.get_city("city-1", token, "user-123")

        self.assertEqual(second["metadata"]["name"], "Krakow")
        self.assertEqual(cached["metadata"]["name"], "Krakow")
        get_with_auto_refresh.assert_awaited_once()

    async def test_city_cache_is_isolated_by_token_user_and_city(self) -> None:
        token_one = _unsigned_jwt({"exp": int(time.time()) + 3600, "jti": "one"})
        token_two = _unsigned_jwt({"exp": int(time.time()) + 3600, "jti": "two"})
        client = CityCatalystClient(
            base_url="https://cc.example",
            api_key="test-api-key",
        )
        get_with_auto_refresh = AsyncMock(
            side_effect=[
                _response(200, json_data={"request": 1}),
                _response(200, json_data={"request": 2}),
                _response(200, json_data={"request": 3}),
                _response(200, json_data={"request": 4}),
            ]
        )

        with patch.object(
            client,
            "get_with_auto_refresh",
            new=get_with_auto_refresh,
        ):
            results = [
                await client.get_city("city-1", token_one, "user-1"),
                await client.get_city("city-1", token_two, "user-1"),
                await client.get_city("city-1", token_one, "user-2"),
                await client.get_city("city-2", token_one, "user-1"),
            ]

        self.assertEqual([result["request"] for result in results], [1, 2, 3, 4])
        self.assertEqual(get_with_auto_refresh.await_count, 4)

    async def test_refresh_token_normalizes_base_url_and_validates_payload(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(
                cc_base_url="https://cc.example/",
                cc_api_key="test-api-key",
            ),
        ):
            client = CityCatalystClient()
            token_payload = _refresh_payload()
            stub = _StubAsyncClient([_response(200, json_data=token_payload)])

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                token, expires_in = await client.refresh_token("user-123")

        self.assertEqual(token, token_payload["access_token"])
        self.assertEqual(expires_in, 3600)
        recorded = stub.requests[0]
        self.assertEqual(
            recorded["url"],
            "https://cc.example/api/v1/internal/ca/user-token",
        )
        self.assertEqual(recorded["headers"]["X-CA-Service-Key"], "test-api-key")
        self.assertEqual(recorded["json"]["user_id"], "user-123")

    async def test_refresh_token_requires_api_key_before_request(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(
                cc_base_url="https://cc.example",
                cc_api_key=None,
            ),
        ):
            client = CityCatalystClient()
            get_client = AsyncMock()

            with patch.object(client, "_get_client", new=get_client):
                with self.assertRaises(TokenRefreshError) as captured:
                    await client.refresh_token("user-123")

        self.assertIn("CC_API_KEY not configured", str(captured.exception))
        get_client.assert_not_awaited()

    async def test_refresh_token_preserves_unauthorized_status_and_key_used(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(
                cc_base_url="https://cc.example",
                cc_api_key="wrong-key",
            ),
        ):
            client = CityCatalystClient()
            stub = _StubAsyncClient([_response(401, json_data={"error": "Unauthorized"})])

            with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                with self.assertRaises(TokenRefreshError) as captured:
                    await client.refresh_token("user-123")

        self.assertIn("HTTP 401", str(captured.exception))
        self.assertEqual(stub.requests[0]["headers"]["X-CA-Service-Key"], "wrong-key")

    async def test_refresh_token_rejects_malformed_or_mismatched_payloads(self) -> None:
        cases = [
            ({"expires_in": 3600, "token_type": "Bearer"}, "No token in refresh response"),
            (_refresh_payload(payload_overrides={"token_type": "Basic"}), "Invalid token type"),
            (_refresh_payload(payload_overrides={"expires_in": 0}), "Invalid token expiry"),
            (_refresh_payload(payload_overrides={"expires_in": "3600"}), "Invalid token expiry"),
            (_refresh_payload(token_overrides={"sub": "other-user"}), "subject does not match"),
            (_refresh_payload(token_overrides={"iss": "wrong-service"}), "Invalid token issuer"),
            (
                _refresh_payload(token_overrides={"aud": "https://wrong.example"}),
                "Invalid token audience",
            ),
        ]

        for payload, expected_message in cases:
            with patch(
                "app.services.citycatalyst_client.get_settings",
                return_value=SimpleNamespace(
                    cc_base_url="https://cc.example",
                    cc_api_key="test-api-key",
                ),
            ):
                client = CityCatalystClient()
                stub = _StubAsyncClient([_response(200, json_data=payload)])

                with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
                    with self.assertRaises(TokenRefreshError) as captured:
                        await client.refresh_token("user-123")

            self.assertIn(expected_message, str(captured.exception))

    async def test_internal_capability_calls_include_service_headers(self) -> None:
        with patch(
            "app.services.citycatalyst_client.get_settings",
            return_value=SimpleNamespace(cc_base_url=None, cc_api_key=None),
        ):
            client = CityCatalystClient(
                base_url="https://cc.example",
                api_key="test-api-key",
            )
            stub = _StubAsyncClient(
                [
                    _response(
                        200,
                        json_data={"results": [{"proposal_id": "proposal-1", "status": "committed"}]},
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
                                "proposal_id": "proposal-1",
                                "decision_version": 1,
                                "row_type": "selected_source",
                                "selected_source_id": "ds-1",
                            }
                        ],
                    },
                    token="jwt-token",
                )

        recorded = stub.requests[0]
        self.assertEqual(
            recorded["url"],
            "https://cc.example/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted",
        )
        self.assertEqual(recorded["headers"]["Authorization"], "Bearer jwt-token")
        self.assertEqual(recorded["headers"]["X-Service-Name"], "climate-advisor")
        self.assertEqual(recorded["headers"]["X-Service-Key"], "test-api-key")
