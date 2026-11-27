"""Verify prompt roles, defaults, bounds, and per-job isolation without API calls."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from extractor.api import create_app
from extractor.prompting import MAX_PROMPT_BYTES, default_prompts
from test_service import AUTH, SETTINGS, adapter, pdf, session


def test_custom_prompts_reach_the_correct_roles_without_changing_defaults():
    """Use custom instructions and user text while preserving runtime context."""
    payloads = []

    def upstream(request):
        """Record hosted session payloads after supplying fixture input IDs."""
        if request.url.path == "/v1/files":
            return httpx.Response(200, json={"id": "file_fixture"})
        payloads.append(json.loads(request.content))
        return httpx.Response(200, json=session("in_progress"))

    with TestClient(create_app(SETTINGS, adapter(upstream))) as client:
        defaults_before = client.get("/v1/config").json()["default_prompts"]
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={
                "system_prompt": "Prioritize city-wide emissions totals.",
                "user_prompt": "Extract 2023 only; flag estimates.",
            },
            files={
                "city_pdf": ("report.pdf", pdf()),
                "taxonomy_pdf": ("taxonomy.pdf", pdf()),
            },
        )
        assert response.status_code == 202
        assert client.get("/v1/config").json()["default_prompts"] == defaults_before
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            files={
                "city_pdf": ("report.pdf", pdf()),
                "taxonomy_pdf": ("taxonomy.pdf", pdf()),
            },
        )
        assert response.status_code == 202
    custom, default = payloads
    assert custom["agent"]["instructions"].startswith(
        "Prioritize city-wide emissions totals."
    )
    assert "result_path" in custom["agent"]["instructions"]
    user_message = custom["input"][0]
    assert user_message["role"] == "user"
    assert (
        json.loads(user_message["content"][0]["text"])["city_pdf"]
        == "/workspace/city.pdf"
    )
    assert user_message["content"][1]["text"] == "Extract 2023 only; flag estimates."
    assert "Extract 2023 only" not in custom["agent"]["instructions"]
    assert default["agent"]["instructions"].startswith(
        default_prompts()["system_prompt"]
    )
    assert default["input"][0]["content"][1]["text"] == default_prompts()["user_prompt"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("system_prompt", "   "),
        ("system_prompt", "é" * (MAX_PROMPT_BYTES // 2 + 1)),
        ("user_prompt", "x" * (MAX_PROMPT_BYTES + 1)),
    ],
)
def test_invalid_prompt_rejected_before_paid_work(field, value):
    """Reject blank or oversized prompts before either input is uploaded."""
    with TestClient(
        create_app(
            SETTINGS, adapter(lambda _: pytest.fail("No upstream work expected"))
        )
    ) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={field: value},
            files={
                "city_pdf": ("report.pdf", pdf()),
                "taxonomy_pdf": ("taxonomy.pdf", pdf()),
            },
        )
        assert response.status_code == 422
