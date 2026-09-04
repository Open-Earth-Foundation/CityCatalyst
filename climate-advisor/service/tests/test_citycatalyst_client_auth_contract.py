from __future__ import annotations

import json
import os

import httpx
import pytest

pytest.importorskip("pgvector.sqlalchemy")

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)


DYNAMIC_CATALOG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DYNAMIC_USER_ID = "11111111-1111-4111-8111-111111111111"
DYNAMIC_CITY_ID = "22222222-2222-4222-8222-222222222222"
DYNAMIC_INVENTORY_ID = "33333333-3333-4333-8333-333333333333"
DYNAMIC_CAPABILITY_ID = "ghgi.inventory.status_overview"


def _contract_env() -> dict[str, str]:
    required = {
        "base_url": os.environ.get("CC_BASE_URL"),
        "api_key": os.environ.get("CC_API_KEY"),
        "user_id": os.environ.get("CA_AUTH_CONTRACT_USER_ID"),
        "other_user_id": os.environ.get("CA_AUTH_CONTRACT_OTHER_USER_ID"),
        "city_id": os.environ.get("CA_AUTH_CONTRACT_CITY_ID"),
        "inventory_id": os.environ.get("CA_AUTH_CONTRACT_INVENTORY_ID"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        pytest.skip(
            "CC/CA auth contract env is not configured: "
            + ", ".join(sorted(missing))
        )
    return {name: value for name, value in required.items() if value}


async def _withdraw_live_catalog_entries(
    *,
    base_url: str,
    api_key: str,
    catalog_ids: list[str],
) -> None:
    headers = {
        "Content-Type": "application/json",
        "X-Service-Name": "climate-advisor",
        "X-Service-Key": api_key,
    }
    async with httpx.AsyncClient() as client:
        for catalog_id in catalog_ids:
            response = await client.delete(
                f"{base_url.rstrip('/')}/api/v1/internal/native-input-catalog/{catalog_id}",
                headers=headers,
                follow_redirects=True,
            )
            response.raise_for_status()


def _dynamic_discovery_payload(
    *,
    user_id: str,
    city_id: str,
    inventory_id: str,
) -> dict[str, str]:
    return {
        "userId": user_id,
        "cityId": city_id,
        "inventoryId": inventory_id,
        "kind": "inventory_import",
        "owningModule": "ghgi",
        "capabilityId": DYNAMIC_CAPABILITY_ID,
    }


def _dynamic_registration_payload(
    *,
    user_id: str,
    city_id: str,
    inventory_id: str,
) -> dict[str, object]:
    return {
        "kind": "inventory_import",
        "owningModule": "ghgi",
        "sourceType": "inventory",
        "sourceId": inventory_id,
        "userId": user_id,
        "cityId": city_id,
        "inventoryId": inventory_id,
        "labels": {"display_name": "CC-737 dynamic contract fixture"},
    }


def _dynamic_read_payload(
    *,
    catalog_id: str,
    user_id: str,
    city_id: str,
    inventory_id: str,
) -> dict[str, object]:
    return {
        "catalogId": catalog_id,
        "capabilityId": DYNAMIC_CAPABILITY_ID,
        "userId": user_id,
        "cityId": city_id,
        "inventoryId": inventory_id,
        "input": {
            "city_id": city_id,
            "inventory_id": inventory_id,
        },
    }


@pytest.mark.asyncio
async def test_native_input_catalog_dynamic_runtime_sequence_uses_bounded_camel_case_contract() -> None:
    catalog_registered = False
    recorded_requests: list[tuple[str, dict[str, object]]] = []

    def core_handler(request: httpx.Request) -> httpx.Response:
        nonlocal catalog_registered
        payload = json.loads(request.content) if request.content else {}
        recorded_requests.append((request.url.path, payload))

        if request.url.path.endswith("/native-inputs/discover"):
            entries = []
            if catalog_registered:
                entries.append(
                    {
                        "catalog_id": DYNAMIC_CATALOG_ID,
                        "kind": "inventory_import",
                        "owning_module": "ghgi",
                        "source_type": "inventory",
                        "capability_ids": [DYNAMIC_CAPABILITY_ID],
                    }
                )
            return httpx.Response(
                200,
                json={
                    "action": "native_input.discover",
                    "success": True,
                    "data": {"entries": entries},
                },
            )

        if request.url.path == "/api/v1/internal/native-input-catalog":
            catalog_registered = True
            return httpx.Response(
                201,
                json={"data": {"id": DYNAMIC_CATALOG_ID}, "created": True},
            )

        if request.url.path.endswith("/native-inputs/read"):
            return httpx.Response(
                200,
                json={
                    "action": DYNAMIC_CAPABILITY_ID,
                    "success": True,
                    "data": {"status": "ready"},
                },
            )

        return httpx.Response(404)

    client = CityCatalystClient(
        base_url="https://core.example",
        api_key="test-service-key",
    )
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(core_handler))
    discovery_payload = _dynamic_discovery_payload(
        user_id=DYNAMIC_USER_ID,
        city_id=DYNAMIC_CITY_ID,
        inventory_id=DYNAMIC_INVENTORY_ID,
    )

    try:
        first_discovery = await client.discover_native_inputs(
            request_payload=discovery_payload,
            token="test-token",
            user_id=DYNAMIC_USER_ID,
            thread_id="dynamic-contract",
        )
        await client.post_internal_capability(
            "/api/v1/internal/native-input-catalog",
            json_data=_dynamic_registration_payload(
                user_id=DYNAMIC_USER_ID,
                city_id=DYNAMIC_CITY_ID,
                inventory_id=DYNAMIC_INVENTORY_ID,
            ),
            token="test-token",
            refresh_user_id=DYNAMIC_USER_ID,
        )
        second_discovery = await client.discover_native_inputs(
            request_payload=discovery_payload,
            token="test-token",
            user_id=DYNAMIC_USER_ID,
            thread_id="dynamic-contract",
        )
        selected_read = await client.read_native_input(
            request_payload=_dynamic_read_payload(
                catalog_id=DYNAMIC_CATALOG_ID,
                user_id=DYNAMIC_USER_ID,
                city_id=DYNAMIC_CITY_ID,
                inventory_id=DYNAMIC_INVENTORY_ID,
            ),
            token="test-token",
            user_id=DYNAMIC_USER_ID,
            thread_id="dynamic-contract",
        )
    finally:
        await client.close()

    assert first_discovery["data"]["entries"] == []
    assert second_discovery["data"]["entries"] == [
        {
            "catalog_id": DYNAMIC_CATALOG_ID,
            "kind": "inventory_import",
            "owning_module": "ghgi",
            "source_type": "inventory",
            "capability_ids": [DYNAMIC_CAPABILITY_ID],
        }
    ]
    assert selected_read == {
        "action": DYNAMIC_CAPABILITY_ID,
        "success": True,
        "data": {"status": "ready"},
    }

    read_requests = [
        payload
        for path, payload in recorded_requests
        if path.endswith("/native-inputs/read")
    ]
    assert read_requests == [
        _dynamic_read_payload(
            catalog_id=DYNAMIC_CATALOG_ID,
            user_id=DYNAMIC_USER_ID,
            city_id=DYNAMIC_CITY_ID,
            inventory_id=DYNAMIC_INVENTORY_ID,
        )
    ]
    serialized_request = json.dumps(read_requests[0]).lower()
    assert "catalogid" in serialized_request
    assert "capabilityid" in serialized_request
    assert "catalog_id" not in read_requests[0]
    assert "capability_id" not in read_requests[0]
    assert all(
        forbidden not in serialized_request
        for forbidden in (
            "credentials",
            "s3_key",
            "signed_url",
            "storage_path",
            "token",
        )
    )


@pytest.mark.asyncio
async def test_dynamic_runtime_sequence_against_running_core() -> None:
    env = _contract_env()
    discovery_payload = _dynamic_discovery_payload(
        user_id=env["user_id"],
        city_id=env["city_id"],
        inventory_id=env["inventory_id"],
    )
    registered_catalog_id: str | None = None

    async with CityCatalystClient(
        base_url=env["base_url"],
        api_key=env["api_key"],
    ) as client:
        token, _expires_in = await client.refresh_token(env["user_id"])

        # Reset only the configured local fixture scope so the first measured
        # discovery has a deterministic empty baseline.
        existing = await client.discover_native_inputs(
            request_payload=discovery_payload,
            token=token,
            user_id=env["user_id"],
            thread_id="dynamic-live-contract-setup",
        )
        existing_ids = [
            entry["catalog_id"]
            for entry in existing["data"]["entries"]
            if isinstance(entry.get("catalog_id"), str)
        ]
        await _withdraw_live_catalog_entries(
            base_url=env["base_url"],
            api_key=env["api_key"],
            catalog_ids=existing_ids,
        )

        try:
            first_discovery = await client.discover_native_inputs(
                request_payload=discovery_payload,
                token=token,
                user_id=env["user_id"],
                thread_id="dynamic-live-contract",
            )
            assert first_discovery["data"]["entries"] == []

            registration = await client.post_internal_capability(
                "/api/v1/internal/native-input-catalog",
                json_data=_dynamic_registration_payload(
                    user_id=env["user_id"],
                    city_id=env["city_id"],
                    inventory_id=env["inventory_id"],
                ),
                token=token,
                refresh_user_id=env["user_id"],
            )
            registered_catalog_id = registration["data"]["id"]

            second_discovery = await client.discover_native_inputs(
                request_payload=discovery_payload,
                token=token,
                user_id=env["user_id"],
                thread_id="dynamic-live-contract",
            )
            safe_entry = next(
                entry
                for entry in second_discovery["data"]["entries"]
                if entry["catalog_id"] == registered_catalog_id
            )
            assert safe_entry["capability_ids"] == [
                "ghgi.inventory.status_overview",
                "ghgi.inventory.emissions_context",
            ]
            assert all(
                forbidden not in json.dumps(safe_entry).lower()
                for forbidden in (
                    "credentials",
                    "s3_key",
                    "signed_url",
                    "source_id",
                    "storage_path",
                    "token",
                )
            )

            read_payload = _dynamic_read_payload(
                catalog_id=registered_catalog_id,
                user_id=env["user_id"],
                city_id=env["city_id"],
                inventory_id=env["inventory_id"],
            )
            assert "catalogId" in read_payload
            assert "capabilityId" in read_payload
            assert "catalog_id" not in read_payload
            assert "capability_id" not in read_payload
            assert "storage" not in json.dumps(read_payload).lower()

            selected_read = await client.read_native_input(
                request_payload=read_payload,
                token=token,
                user_id=env["user_id"],
                thread_id="dynamic-live-contract",
            )
            assert selected_read["action"] == DYNAMIC_CAPABILITY_ID
            assert selected_read["success"] is True
            assert isinstance(selected_read["data"], dict)
        finally:
            if registered_catalog_id:
                await _withdraw_live_catalog_entries(
                    base_url=env["base_url"],
                    api_key=env["api_key"],
                    catalog_ids=[registered_catalog_id],
                )


@pytest.mark.asyncio
async def test_refresh_token_against_running_cc_accepts_shared_key() -> None:
    env = _contract_env()

    async with CityCatalystClient(
        base_url=env["base_url"],
        api_key=env["api_key"],
    ) as client:
        token, expires_in = await client.refresh_token(env["user_id"])

    assert token
    assert expires_in == 3600


@pytest.mark.asyncio
async def test_allowed_capabilities_against_running_cc_accepts_service_headers() -> None:
    env = _contract_env()

    async with CityCatalystClient(
        base_url=env["base_url"],
        api_key=env["api_key"],
    ) as client:
        token, _expires_in = await client.refresh_token(env["user_id"])
        capabilities = await client.get_stationary_energy_allowed_capabilities(
            user_id=env["user_id"],
            city_id=env["city_id"],
            inventory_id=env["inventory_id"],
            workflow_step="draft",
            token=token,
        )

    assert "ghgi.stationary_energy.load_context" in capabilities


@pytest.mark.asyncio
async def test_wrong_cc_api_key_gets_real_401_from_running_cc() -> None:
    env = _contract_env()

    async with CityCatalystClient(
        base_url=env["base_url"],
        api_key="wrong-key",
    ) as client:
        with pytest.raises(TokenRefreshError, match="HTTP 401"):
            await client.refresh_token(env["user_id"])


@pytest.mark.asyncio
async def test_token_for_one_user_cannot_be_reused_for_other_user() -> None:
    env = _contract_env()

    async with CityCatalystClient(
        base_url=env["base_url"],
        api_key=env["api_key"],
    ) as client:
        token, _expires_in = await client.refresh_token(env["user_id"])
        with pytest.raises(CityCatalystClientError) as captured:
            await client.get_stationary_energy_allowed_capabilities(
                user_id=env["other_user_id"],
                city_id=env["city_id"],
                inventory_id=env["inventory_id"],
                workflow_step="draft",
                token=token,
            )

    assert captured.value.status_code == 403
