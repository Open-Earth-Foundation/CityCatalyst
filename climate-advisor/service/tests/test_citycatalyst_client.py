from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.utils.request_token_refresh import RequestTokenRefreshContext

BASE_URL = "https://cc.example"
CAPABILITIES = "/api/v1/internal/ca/capabilities"


class _StubAsyncClient:
    """Minimal stub of httpx.AsyncClient returning canned responses."""

    def __init__(self, responses: List[httpx.Response]) -> None:
        self._responses = responses
        self.requests: List[Dict[str, Any]] = []

    async def get(
        self, url: str, *, headers: Optional[Dict[str, str]] = None, **kwargs: Any
    ) -> httpx.Response:
        self.requests.append({"method": "GET", "url": url, "headers": headers})
        return self._responses.pop(0)

    async def post(
        self,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> httpx.Response:
        self.requests.append(
            {"method": "POST", "url": url, "headers": headers, "json": json}
        )
        return self._responses.pop(0)


class _FailingPostClient:
    """HTTP double that fails with a transport error carrying a secret."""

    async def post(self, *args: Any, **kwargs: Any) -> httpx.Response:
        raise httpx.ReadTimeout("private upstream transport detail")


def _response(status_code: int, *, json_data: Optional[Any] = None) -> httpx.Response:
    request = httpx.Request("GET", f"{BASE_URL}/api")
    return httpx.Response(status_code, json=json_data, request=request)


def _unsigned_jwt(claims: Dict[str, Any]) -> str:
    def encode_json(payload: Dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return (
        f"{encode_json({'alg': 'none', 'typ': 'JWT'})}."
        f"{encode_json(claims)}."
        "signature"
    )


def _client(**kwargs: Any) -> CityCatalystClient:
    return CityCatalystClient(base_url=BASE_URL, api_key="test-api-key", **kwargs)


async def test_concept_note_source_deletion_batches_authenticated_requests() -> None:
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(204)

    client = CityCatalystClient(base_url=BASE_URL, api_key="test-service-key")
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        await client.delete_concept_note_sources([str(i) for i in range(1001)])
    finally:
        await client.close()
    assert [len(json.loads(request.content)["upload_ids"]) for request in requests] == [1000, 1]
    for request in requests:
        assert request.method == "DELETE"
        # The canonical trailing-slash URL is called directly, so no redirect carries the key.
        assert request.url.path == "/api/v1/internal/ca/concept-note-sources/"
        assert request.headers["X-CA-Service-Key"] == "test-service-key"


async def test_concept_note_source_deletion_propagates_failure() -> None:
    client = CityCatalystClient(base_url=BASE_URL, api_key="test-service-key")
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(503)))
    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.delete_concept_note_sources(["upload"])
    finally:
        await client.close()


NATIVE_INPUT_ARGS = {"user_id": "user-1", "thread_id": "thread-1"}


@pytest.mark.parametrize(
    ("method", "extra_kwargs", "path"),
    [
        ("load_inventory_list_accessible", {}, "/ghgi/inventory/list-accessible"),
        ("load_inventory_status_overview", {}, "/ghgi/inventory/status-overview"),
        ("load_inventory_emissions_context", {}, "/ghgi/inventory/emissions-context"),
        ("load_hiap_context", {}, "/hiap/inventory/context"),
        ("commit_stationary_energy_accepted", {}, "/ghgi/stationary-energy/commit-accepted"),
        ("commit_stationary_energy_notation_keys", {}, "/ghgi/stationary-energy/commit-notation-keys"),
        ("discover_native_inputs", NATIVE_INPUT_ARGS, "/native-inputs/discover"),
        ("read_native_input", NATIVE_INPUT_ARGS, "/native-inputs/read"),
    ],
)
async def test_internal_capabilities_post_payload_to_core_route_with_service_headers(
    method: str, extra_kwargs: dict[str, str], path: str
) -> None:
    client = _client()
    payload = {"user_id": "user-1", "city_id": "city-1", "inventory_id": "inventory-1"}
    stub = _StubAsyncClient([_response(200, json_data={"success": True, "data": {"value": 42}})])

    with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
        result = await getattr(client, method)(
            request_payload=payload, token="jwt-token", **extra_kwargs
        )

    assert result == {"success": True, "data": {"value": 42}}
    recorded = stub.requests[0]
    assert recorded["url"] == f"{BASE_URL}{CAPABILITIES}{path}"
    assert recorded["json"] == payload
    assert recorded["headers"]["Authorization"] == "Bearer jwt-token"
    assert recorded["headers"]["X-Service-Name"] == "climate-advisor"
    assert recorded["headers"]["X-Service-Key"] == "test-api-key"


async def test_get_inventory_reads_the_inventory_route() -> None:
    client = _client()
    stub = _StubAsyncClient([_response(200, json_data={"data": {"inventoryId": "inv-123"}})])

    with (
        patch("app.services.citycatalyst_client.is_token_expired", return_value=False),
        patch.object(client, "_get_client", new=AsyncMock(return_value=stub)),
    ):
        result = await client.get_inventory("inv-123", token="jwt-token", user_id="user-1")

    assert result["data"]["inventoryId"] == "inv-123"
    assert stub.requests[0]["url"] == f"{BASE_URL}/api/v1/inventory/inv-123"
    assert stub.requests[0]["headers"]["Authorization"] == "Bearer jwt-token"


async def test_get_inventory_not_found_raises() -> None:
    client = _client()
    stub = _StubAsyncClient([_response(404, json_data={"error": "not found"})])

    with (
        patch("app.services.citycatalyst_client.is_token_expired", return_value=False),
        patch.object(client, "_get_client", new=AsyncMock(return_value=stub)),
    ):
        with pytest.raises(CityCatalystClientError):
            await client.get_inventory("missing", token="jwt-token", user_id="user-1")


@pytest.mark.parametrize(
    ("method", "kwargs"),
    [
        (
            "load_inventory_status_overview",
            {"request_payload": {"user_id": "claimed-user", "inventory_id": "inventory-1"}},
        ),
        (
            "discover_native_inputs",
            {"request_payload": {"userId": "claimed-user"}, **NATIVE_INPUT_ARGS},
        ),
        (
            "read_native_input",
            {
                "request_payload": {"userId": "claimed-user", "catalogId": "catalog-1"},
                **NATIVE_INPUT_ARGS,
            },
        ),
        ("get_user_inventories", {"user_id": "claimed-user", "auto_refresh": False}),
    ],
)
async def test_401_never_refreshes_a_token_from_claimed_identity(
    method: str, kwargs: dict[str, Any]
) -> None:
    """Without a validated turn context, a 401 surfaces instead of minting a token."""
    client = _client()
    stub = _StubAsyncClient([_response(401, json_data={"error": "Unauthorized"})])
    refresh_token = AsyncMock(return_value=("fresh-token", 3600))

    with (
        patch("app.services.citycatalyst_client.is_token_expired", return_value=True),
        patch.object(client, "_get_client", new=AsyncMock(return_value=stub)),
        patch.object(client, "refresh_token", new=refresh_token),
    ):
        with pytest.raises(CityCatalystClientError) as captured:
            await getattr(client, method)(token="presented-token", **kwargs)

    assert captured.value.status_code == 401
    refresh_token.assert_not_awaited()
    assert len(stub.requests) == 1
    assert stub.requests[0]["headers"]["Authorization"] == "Bearer presented-token"


async def test_allowed_capabilities_preserves_auth_failure_status() -> None:
    client = _client()
    stub = _StubAsyncClient([_response(401, json_data={"error": "Unauthorized"})])

    with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
        with pytest.raises(CityCatalystClientError) as captured:
            await client.get_stationary_energy_allowed_capabilities(
                user_id="user-1",
                city_id="city-1",
                inventory_id="inventory-1",
                workflow_step="draft",
                token="jwt-token",
            )

    assert captured.value.status_code == 401


async def test_read_native_input_normalizes_selection_failure_without_upstream_text() -> None:
    client = _client()
    stub = _StubAsyncClient(
        [
            _response(
                404,
                json_data={
                    "code": "capability_unavailable",
                    "message": "Requested capability is unavailable.",
                    "catalog_id": "private-catalog-id",
                    "source_id": "private-source-id",
                    "debug": "private-upstream-detail",
                },
            )
        ]
    )

    with patch.object(client, "_get_client", new=AsyncMock(return_value=stub)):
        with pytest.raises(CityCatalystClientError) as captured:
            await client.read_native_input(
                request_payload={"catalogId": "stale-catalog", "capabilityId": "stale"},
                token="jwt-token",
                **NATIVE_INPUT_ARGS,
            )

    assert captured.value.status_code == 404
    assert str(captured.value) == "Requested capability is unavailable."
    assert "private" not in str(captured.value)


async def test_read_native_input_normalizes_transport_failure_without_upstream_text() -> None:
    client = _client()

    with patch.object(client, "_get_client", new=AsyncMock(return_value=_FailingPostClient())):
        with pytest.raises(CityCatalystClientError) as captured:
            await client.read_native_input(
                request_payload={"catalogId": "catalog-1", "capabilityId": "capability-1"},
                token="jwt-token",
                **NATIVE_INPUT_ARGS,
            )

    assert "private upstream transport detail" not in str(captured.value)


async def test_post_internal_capability_rejects_refresh_before_any_request() -> None:
    client = _client()
    stub = _StubAsyncClient([_response(200, json_data={"success": True})])
    refresh_token = AsyncMock(return_value=("fresh-token", 3600))

    with (
        patch.object(client, "_get_client", new=AsyncMock(return_value=stub)),
        patch.object(client, "refresh_token", new=refresh_token),
    ):
        with pytest.raises(ValueError):
            await client.post_internal_capability(
                f"{CAPABILITIES}/ghgi/inventory/status-overview",
                json_data={"user_id": "claimed-user", "userId": "other-claimed-user"},
                token="presented-token",
                allow_token_refresh=True,
            )

    refresh_token.assert_not_awaited()
    assert stub.requests == []


@pytest.mark.parametrize(
    ("method", "extra_kwargs"),
    [
        ("load_inventory_status_overview", {}),
        ("read_native_input", {"user_id": "untrusted-argument-user", "thread_id": "thread-1"}),
    ],
)
async def test_request_context_renews_with_canonical_identity_and_never_replays(
    method: str, extra_kwargs: dict[str, str]
) -> None:
    """61 seconds left renews before the request; a 401 is not replayed."""
    context = RequestTokenRefreshContext(
        canonical_user_id="canonical-user",
        token=_unsigned_jwt({"exp": int(time.time()) + 61}),
    )
    client = _client(request_token_refresh_context=context)
    stub = _StubAsyncClient([_response(401, json_data={"error": "Unauthorized"})])
    refresh_token = AsyncMock(return_value=("renewed-token", 3600))

    with (
        patch.object(client, "_get_client", new=AsyncMock(return_value=stub)),
        patch.object(client, "refresh_token", new=refresh_token),
    ):
        with pytest.raises(CityCatalystClientError) as captured:
            await getattr(client, method)(
                request_payload={"user_id": "payload-user", "userId": "other-payload-user"},
                token="stale-caller-token",
                **extra_kwargs,
            )

    assert captured.value.status_code == 401
    refresh_token.assert_awaited_once_with("canonical-user")
    assert context.token_ref["value"] == "renewed-token"
    assert len(stub.requests) == 1
    assert stub.requests[0]["headers"]["Authorization"] == "Bearer renewed-token"


async def test_request_context_keeps_a_valid_token_without_refresh() -> None:
    valid_token = _unsigned_jwt({"exp": int(time.time()) + 3600})
    context = RequestTokenRefreshContext(canonical_user_id="canonical-user", token=valid_token)
    client = _client(request_token_refresh_context=context)
    stub = _StubAsyncClient([_response(200, json_data={"success": True})])
    refresh_token = AsyncMock(return_value=("unexpected-token", 3600))

    with (
        patch.object(client, "_get_client", new=AsyncMock(return_value=stub)),
        patch.object(client, "refresh_token", new=refresh_token),
    ):
        await client.load_inventory_status_overview(
            request_payload={"user_id": "canonical-user"}, token=valid_token
        )

    refresh_token.assert_not_awaited()
    assert context.token_ref["value"] == valid_token
    assert stub.requests[0]["headers"]["Authorization"] == f"Bearer {valid_token}"


async def test_request_context_coalesces_concurrent_refreshes() -> None:
    """Parallel tool calls share one refresh and observe the replacement token."""
    context = RequestTokenRefreshContext(
        canonical_user_id="canonical-user", token="near-expiry-token"
    )

    async def renew(_user_id: str) -> tuple[str, int]:
        await asyncio.sleep(0)
        return "renewed-token", 3600

    refresh = AsyncMock(side_effect=renew)

    with patch(
        "app.utils.request_token_refresh.is_token_expired",
        side_effect=lambda token, buffer_seconds: token == "near-expiry-token",
    ):
        active_tokens = await asyncio.gather(
            context.token_for_request(refresh),
            context.token_for_request(refresh),
        )

    assert active_tokens == ["renewed-token", "renewed-token"]
    refresh.assert_awaited_once_with("canonical-user")
