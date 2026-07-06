from __future__ import annotations

import os

import pytest

pytest.importorskip("pgvector.sqlalchemy")

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)


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
