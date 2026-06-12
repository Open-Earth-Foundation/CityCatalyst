"""Smoke test for the OpenRouter credential used by Climate Advisor deploys."""

from __future__ import annotations

import os

import pytest
import requests

OPENROUTER_AUTH_URL = "https://openrouter.ai/api/v1/auth/key"


def test_openrouter_api_key_is_present_and_valid() -> None:
    """Validate the deployed OpenRouter key without issuing a chat completion."""
    if os.getenv("OPENROUTER_SMOKE_TEST") != "1":
        pytest.skip("OpenRouter credential smoke test is enabled only in CI/CD")

    api_key = os.getenv("OPENROUTER_API_KEY")
    assert api_key, "OPENROUTER_API_KEY must be configured for Climate Advisor deploys"

    try:
        response = requests.get(
            OPENROUTER_AUTH_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            },
            timeout=10,
        )
    except requests.RequestException as error:
        pytest.fail(
            "OpenRouter credential smoke test could not reach auth endpoint: "
            f"{type(error).__name__}"
        )

    assert (
        response.status_code == 200
    ), f"OpenRouter rejected OPENROUTER_API_KEY with status {response.status_code}"
