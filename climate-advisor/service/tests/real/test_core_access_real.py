"""Inventory access boundary against a real local Core; no model calls.

Needs local Core, the CC-1021 seed fixture and CC_SERVICE_API_KEY (or CC_API_KEY):

    RUN_REAL_LLM=1 uv run --directory service pytest tests/real
"""

from __future__ import annotations

import os
import uuid

import pytest
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError

from evals.real.harness import issue_token, load_fixture, normalized_response

pytestmark = [
    pytest.mark.real_llm,
    pytest.mark.skipif(
        os.getenv("RUN_REAL_LLM") != "1",
        reason="needs RUN_REAL_LLM=1, local Core and the CC-1021 seed",
    ),
]

UNKNOWN_INVENTORY = "00000000-0000-4000-8fff-ffffffffffff"


async def test_unknown_and_no_access_inventories_are_indistinguishable() -> None:
    """Against the real local Core: unknown and no-access inventories look identical."""
    fixture = load_fixture()
    token = issue_token(fixture.user_id)
    thread_id = str(uuid.uuid4())
    client = CityCatalystClient()
    try:
        results = []
        for inventory_id in (UNKNOWN_INVENTORY, fixture.inventory("B1", 2022)):
            discovery = await client.discover_native_inputs(
                request_payload={"userId": fixture.user_id, "inventoryId": inventory_id},
                token=token,
                user_id=fixture.user_id,
                thread_id=thread_id,
            )
            try:
                read = await client.read_native_input(
                    request_payload={
                        "userId": fixture.user_id,
                        "inventoryId": inventory_id,
                        "catalogId": str(uuid.uuid4()),
                        "capabilityId": "hiap.inventory.context",
                        "input": {"inventory_id": inventory_id},
                    },
                    token=token,
                    user_id=fixture.user_id,
                    thread_id=thread_id,
                )
                read_outcome = ("ok", read)
            except CityCatalystClientError as error:
                read_outcome = ("error", error.status_code, str(error))
            results.append((normalized_response(discovery), read_outcome))
    finally:
        await client.close()

    assert results[0] == results[1], results
    assert results[0][0]["data"]["entries"] == []
