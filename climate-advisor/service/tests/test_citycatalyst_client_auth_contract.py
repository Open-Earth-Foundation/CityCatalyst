from __future__ import annotations

import json
import os
from ipaddress import ip_address
from urllib.parse import urlsplit

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
DYNAMIC_FIXTURE_LABEL = "CC-737 dynamic contract fixture"
SAFE_DISCOVERY_KEYS = frozenset(
    {
        "catalog_id",
        "kind",
        "owning_module",
        "source_type",
        "capability_ids",
        "labels",
    }
)
REQUIRED_DISCOVERY_KEYS = SAFE_DISCOVERY_KEYS - {"labels"}
FORBIDDEN_CONTRACT_KEYS = frozenset(
    {
        "accesskeyid",
        "authorization",
        "bearertoken",
        "clientsecret",
        "credentials",
        "objectkey",
        "password",
        "privatekey",
        "s3key",
        "secretaccesskey",
        "signedurl",
        "sourceid",
        "storagepath",
        "token",
    }
)
FORBIDDEN_DISCOVERY_KEYS = FORBIDDEN_CONTRACT_KEYS | {
    "cityid",
    "inventoryid",
    "organizationid",
    "projectid",
    "userid",
}


def _normalized_keys(value: object) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(str(key).lower().replace("_", "").replace("-", ""))
            keys.update(_normalized_keys(child))
    elif isinstance(value, list):
        for child in value:
            keys.update(_normalized_keys(child))
    return keys


def _assert_no_forbidden_contract_fields(
    value: object,
    *,
    forbidden: frozenset[str] = FORBIDDEN_CONTRACT_KEYS,
) -> None:
    assert _normalized_keys(value).isdisjoint(forbidden)


def _assert_safe_discovery_entry(entry: dict[str, object]) -> None:
    assert REQUIRED_DISCOVERY_KEYS <= entry.keys()
    assert entry.keys() <= SAFE_DISCOVERY_KEYS
    _assert_no_forbidden_contract_fields(
        entry,
        forbidden=FORBIDDEN_DISCOVERY_KEYS,
    )


def _fixture_catalog_ids(discovery: dict[str, object]) -> list[str]:
    data = discovery.get("data")
    if not isinstance(data, dict):
        return []
    entries = data.get("entries")
    if not isinstance(entries, list):
        return []

    catalog_ids: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        labels = entry.get("labels")
        catalog_id = entry.get("catalog_id")
        if (
            isinstance(labels, dict)
            and labels.get("display_name") == DYNAMIC_FIXTURE_LABEL
            and isinstance(catalog_id, str)
        ):
            catalog_ids.append(catalog_id)
    return catalog_ids


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


def _dynamic_contract_env() -> dict[str, str]:
    env = _contract_env()
    hostname = urlsplit(env["base_url"]).hostname
    try:
        is_loopback = bool(hostname) and ip_address(hostname).is_loopback
    except ValueError:
        is_loopback = hostname == "localhost"
    if not is_loopback:
        pytest.skip("Dynamic catalog mutation requires a loopback Core hostname")
    if os.environ.get("CA_AUTH_CONTRACT_ALLOW_CATALOG_MUTATION") != "1":
        pytest.skip("Dynamic catalog mutation requires explicit opt-in")
    return env


@pytest.mark.parametrize(
    ("base_url", "mutation_opt_in", "expected_reason"),
    [
        ("https://core.example", "1", "loopback"),
        ("http://localhost:3000", None, "explicit opt-in"),
    ],
)
def test_dynamic_contract_rejects_unsafe_execution_context(
    monkeypatch: pytest.MonkeyPatch,
    base_url: str,
    mutation_opt_in: str | None,
    expected_reason: str,
) -> None:
    contract_env = {
        "CC_BASE_URL": base_url,
        "CC_API_KEY": "test-service-key",
        "CA_AUTH_CONTRACT_USER_ID": DYNAMIC_USER_ID,
        "CA_AUTH_CONTRACT_OTHER_USER_ID": "other-user",
        "CA_AUTH_CONTRACT_CITY_ID": DYNAMIC_CITY_ID,
        "CA_AUTH_CONTRACT_INVENTORY_ID": DYNAMIC_INVENTORY_ID,
    }
    for name, value in contract_env.items():
        monkeypatch.setenv(name, value)
    if mutation_opt_in is None:
        monkeypatch.delenv(
            "CA_AUTH_CONTRACT_ALLOW_CATALOG_MUTATION",
            raising=False,
        )
    else:
        monkeypatch.setenv(
            "CA_AUTH_CONTRACT_ALLOW_CATALOG_MUTATION",
            mutation_opt_in,
        )

    with pytest.raises(pytest.skip.Exception, match=expected_reason):
        _dynamic_contract_env()


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
        "labels": {"display_name": DYNAMIC_FIXTURE_LABEL},
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
    _assert_safe_discovery_entry(second_discovery["data"]["entries"][0])
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
    assert "catalogId" in read_requests[0]
    assert "capabilityId" in read_requests[0]
    assert "catalog_id" not in read_requests[0]
    assert "capability_id" not in read_requests[0]
    _assert_no_forbidden_contract_fields(read_requests[0])


@pytest.mark.asyncio
async def test_dynamic_runtime_sequence_against_running_core() -> None:
    env = _dynamic_contract_env()
    discovery_payload = _dynamic_discovery_payload(
        user_id=env["user_id"],
        city_id=env["city_id"],
        inventory_id=env["inventory_id"],
    )
    registered_catalog_id: str | None = None
    registration_attempted = False

    async with CityCatalystClient(
        base_url=env["base_url"],
        api_key=env["api_key"],
    ) as client:
        token, _expires_in = await client.refresh_token(env["user_id"])

        try:
            first_discovery = await client.discover_native_inputs(
                request_payload=discovery_payload,
                token=token,
                user_id=env["user_id"],
                thread_id="dynamic-live-contract",
            )
            assert first_discovery["data"]["entries"] == [], (
                "Dynamic catalog mutation requires an isolated empty local "
                "fixture scope; reset the configured fixture explicitly"
            )

            registration_attempted = True
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
            registration_data = registration.get("data")
            assert isinstance(registration_data, dict)
            registered_catalog_id = registration_data.get("id")
            assert isinstance(registered_catalog_id, str)

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
            _assert_safe_discovery_entry(safe_entry)

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
            _assert_no_forbidden_contract_fields(read_payload)

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
            cleanup_ids = (
                [registered_catalog_id] if registered_catalog_id else []
            )
            if registration_attempted and not cleanup_ids:
                cleanup_discovery = await client.discover_native_inputs(
                    request_payload=discovery_payload,
                    token=token,
                    user_id=env["user_id"],
                    thread_id="dynamic-live-contract-cleanup",
                )
                cleanup_ids = _fixture_catalog_ids(cleanup_discovery)
            if cleanup_ids:
                await _withdraw_live_catalog_entries(
                    base_url=env["base_url"],
                    api_key=env["api_key"],
                    catalog_ids=cleanup_ids,
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
