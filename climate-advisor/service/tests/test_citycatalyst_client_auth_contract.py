from __future__ import annotations

import os
from ipaddress import ip_address
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
import pytest

pytest.importorskip("pgvector.sqlalchemy")

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)


DYNAMIC_CAPABILITY_ID = "ghgi.inventory.status_overview"
DYNAMIC_FIXTURE_LABEL = "CC-737 dynamic contract fixture"
DYNAMIC_FIXTURE_MARKER_LABEL = "cc_737_dynamic_contract_marker"
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


def _fixture_catalog_id(
    discovery: dict[str, object],
    fixture_marker: str,
) -> str | None:
    data = discovery.get("data")
    if not isinstance(data, dict):
        return None
    entries = data.get("entries")
    if not isinstance(entries, list):
        return None

    marked_entries: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        labels = entry.get("labels")
        if (
            isinstance(labels, dict)
            and labels.get(DYNAMIC_FIXTURE_MARKER_LABEL) == fixture_marker
        ):
            marked_entries.append(entry)

    if len(marked_entries) != 1:
        return None
    catalog_id = marked_entries[0].get("catalog_id")
    return catalog_id if isinstance(catalog_id, str) else None


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
    fixture_marker: str,
) -> dict[str, object]:
    return {
        "kind": "inventory_import",
        "owningModule": "ghgi",
        "sourceType": "inventory",
        "sourceId": inventory_id,
        "userId": user_id,
        "cityId": city_id,
        "inventoryId": inventory_id,
        "labels": {
            "display_name": DYNAMIC_FIXTURE_LABEL,
            DYNAMIC_FIXTURE_MARKER_LABEL: fixture_marker,
        },
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
async def test_dynamic_runtime_sequence_against_running_core() -> None:
    env = _dynamic_contract_env()
    discovery_payload = _dynamic_discovery_payload(
        user_id=env["user_id"],
        city_id=env["city_id"],
        inventory_id=env["inventory_id"],
    )
    registered_catalog_id: str | None = None
    registration_created = False
    fixture_marker = uuid4().hex

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

            registration = await client.post_internal_capability(
                "/api/v1/internal/native-input-catalog",
                json_data=_dynamic_registration_payload(
                    user_id=env["user_id"],
                    city_id=env["city_id"],
                    inventory_id=env["inventory_id"],
                    fixture_marker=fixture_marker,
                ),
                token=token,
            )
            registration_created = registration.get("created") is True
            assert registration_created, (
                "Dynamic catalog registration must create a new catalog entry"
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
            cleanup_catalog_id = registered_catalog_id if registration_created else None
            if registration_created and cleanup_catalog_id is None:
                cleanup_discovery = await client.discover_native_inputs(
                    request_payload=discovery_payload,
                    token=token,
                    user_id=env["user_id"],
                    thread_id="dynamic-live-contract-cleanup",
                )
                cleanup_catalog_id = _fixture_catalog_id(
                    cleanup_discovery,
                    fixture_marker,
                )
            if cleanup_catalog_id:
                await _withdraw_live_catalog_entries(
                    base_url=env["base_url"],
                    api_key=env["api_key"],
                    catalog_ids=[cleanup_catalog_id],
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
