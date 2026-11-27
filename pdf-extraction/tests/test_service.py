"""Exercise upload boundaries, durable job outcomes, and extraction validation offline."""

import asyncio
import base64
import io
import json
from copy import deepcopy

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pypdf import PdfWriter

from extractor.api import create_app
from extractor.config import Settings
from extractor.models import ExtractionResult
from extractor.provider import AgentsProvider, ProviderError, RESULT_PATH, SERVICE

SETTINGS = Settings(openai_api_key="offline-test", service_api_key="s" * 32)
AUTH = {"Authorization": f"Bearer {SETTINGS.service_api_key}"}


def pdf() -> bytes:
    """Create a minimal valid one-page input without storing test PDFs."""
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def candidate() -> dict:
    """Return an illustrative result, not an accuracy benchmark."""
    return {
        "schema_version": "1.0",
        "city": "Example City",
        "taxonomy": [
            {
                "id": "energy.electricity",
                "label": "Electricity",
                "definition": "Annual electricity consumption",
                "allowed_units": ["MWh"],
                "taxonomy_pages": [1],
            }
        ],
        "taxonomy_pages_reviewed": [1],
        "city_pages_reviewed": [1],
        "fields": [
            {
                "field_id": "energy.electricity",
                "status": "found",
                "observations": [
                    {
                        "value": "12,500",
                        "unit": "MWh",
                        "year": "2025",
                        "geography": "Municipality",
                        "evidence": [
                            {
                                "pdf_page": 1,
                                "printed_page": None,
                                "quote": "Electricity: 12,500 MWh",
                            }
                        ],
                        "notes": [],
                    }
                ],
                "searched_pages": [1],
                "explanation": "The table reports annual electricity use.",
            }
        ],
        "warnings": [],
    }


def session(state: str = "idle") -> dict:
    """Create an owned session with metadata needed after server restarts."""
    return {
        "id": "sess_test",
        "status": state,
        "metadata": {
            "service": SERVICE,
            "city": "Example City",
            "city_pages": "1",
            "taxonomy_pages": "1",
            "city_file_id": "file_city",
            "taxonomy_file_id": "file_taxonomy",
        },
        "usage": None,
        "required_actions": [],
    }


def adapter(handler) -> AgentsProvider:
    """Build a real provider against an in-process mock HTTP transport."""
    return AgentsProvider(
        SETTINGS,
        httpx.AsyncClient(
            base_url="https://api.openai.com", transport=httpx.MockTransport(handler)
        ),
    )


def run(coro):
    """Execute an async provider operation from a plain pytest test."""
    return asyncio.run(coro)


def test_upload_builds_hosted_session_and_preserves_inputs():
    """Validate real multipart submission and hosted environment wiring together."""
    calls = []

    def upstream(request):
        """Return Files API IDs, then inspect the session creation request."""
        calls.append(request)
        if request.url.path == "/v1/files":
            return httpx.Response(200, json={"id": f"file_{len(calls)}"})
        body = json.loads(request.content)
        assert body["environment"]["type"] == "openai_hosted"
        assert body["environment"]["network"] == {"access": "disabled"}
        assert body["agent"]["multi_agent"] == {"enabled": False}
        assert body["agent"]["model"] == "gpt-6.1-sol"
        assert body["agent"]["reasoning"] == {"effort": "medium"}
        assert "api_key" not in body["environment"]
        files = body["environment"]["files"]
        assert [f["type"] for f in files] == ["file_id", "file_id", "inline"]
        schema = json.loads(base64.b64decode(files[2]["data"]))
        assert "taxonomy" in schema["properties"]
        assert (
            json.loads(body["input"][0]["content"][0]["text"])["city_page_count"] == 1
        )
        assert body["metadata"]["city_file_id"] == "file_1"
        return httpx.Response(200, json=session("in_progress"))

    with TestClient(create_app(SETTINGS, adapter(upstream))) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"city": "Example City"},
            files={"city_pdf": ("a.pdf", pdf()), "taxonomy_pdf": ("b.pdf", pdf())},
        )
    assert response.status_code == 202
    assert response.json()["job_id"] == "sess_test"
    assert len(calls) == 3


def test_unauthenticated_upload_does_not_call_provider():
    """Authentication is checked before any upload causes remote work."""

    def upstream(_):
        """Fail if an unauthenticated request reaches the provider."""
        pytest.fail("provider should not run")

    with TestClient(create_app(SETTINGS, adapter(upstream))) as client:
        assert client.post("/v1/extractions", content=b"invalid").status_code == 401
        assert client.get("/health").status_code == 200
        assert client.get("/openapi.json").status_code == 401


@pytest.mark.parametrize("bad_input", [b"not a PDF", b"%PDF-1.0 broken"])
def test_invalid_pdf_never_uploads(bad_input):
    """Both PDFs are validated before Files API submission."""

    def upstream(_):
        """Fail if invalid data reaches OpenAI."""
        pytest.fail("provider should not run")

    with TestClient(create_app(SETTINGS, adapter(upstream))) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"city": "City"},
            files={"city_pdf": ("a.pdf", pdf()), "taxonomy_pdf": ("b.pdf", bad_input)},
        )
    assert response.status_code == 422


def test_streamed_upload_limit():
    """Bound a body with no trusted content-length before it can fill disk."""
    settings = Settings("offline", "s" * 32, max_file_bytes=1)
    with TestClient(
        create_app(settings, adapter(lambda _: pytest.fail("upstream"))),
        raise_server_exceptions=False,
    ) as client:
        response = client.post(
            "/v1/extractions",
            headers={**AUTH, "Content-Type": "multipart/form-data; boundary=test"},
            content=iter([b"--test\r\n", b"x" * (1024 * 1024)]),
        )
    assert response.status_code == 413


@pytest.mark.parametrize(
    "turn_status,expected",
    [
        (None, "queued"),
        ("in_progress", "running"),
        ("failed", "failed"),
        ("cancelled", "cancelled"),
        ("completed", "completed"),
    ],
)
def test_idle_session_does_not_mean_success(turn_status, expected):
    """A stopped, failed, or not-yet-started root turn cannot become success."""

    def upstream(request):
        """Return a session and its actual turn outcome."""
        if request.url.path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": (
                        []
                        if turn_status is None
                        else [
                            {"id": "turn_1", "status": turn_status, "subagent_id": None}
                        ]
                    ),
                    "has_more": False,
                },
            )
        return httpx.Response(200, json=session())

    assert run(adapter(upstream).inspect("sess_test"))[2] == expected


def test_result_uses_matching_turn_paginates_and_validates():
    """Ignore stale artifacts and return only the completed turn's validated output."""

    def upstream(request):
        """Simulate artifacts across two pages, including an older same-name file."""
        path = request.url.path
        if path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "turn_new", "status": "completed", "subagent_id": None}
                    ],
                    "has_more": False,
                },
            )
        if path.endswith("/artifacts"):
            if "after" not in request.url.params:
                return httpx.Response(
                    200,
                    json={
                        "data": [
                            {"id": "old", "turn_id": "turn_old", "path": RESULT_PATH}
                        ],
                        "last_id": "old",
                        "has_more": True,
                    },
                )
            assert request.url.params["after"] == "old"
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "new",
                            "turn_id": "turn_new",
                            "path": RESULT_PATH,
                            "size_bytes": 2000,
                        }
                    ],
                    "has_more": False,
                },
            )
        if path.endswith("/artifacts/new/content"):
            return httpx.Response(200, json=candidate())
        return httpx.Response(200, json=session())

    result = run(adapter(upstream).result("sess_test"))
    assert result["requires_review"] is True
    assert result["validation"]["source_accuracy"] == "not_independently_verified"


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_field",
        "duplicate_field",
        "empty_found",
        "missing_evidence",
        "out_of_bounds",
    ],
)
def test_invalid_candidate_is_rejected(mutation):
    """Check consequential contract failures, not just JSON syntax."""
    data = candidate()
    if mutation == "missing_field":
        data["fields"] = []
    elif mutation == "duplicate_field":
        data["fields"].append(deepcopy(data["fields"][0]))
    elif mutation == "empty_found":
        data["fields"][0]["observations"] = []
    elif mutation == "missing_evidence":
        data["fields"][0]["observations"][0]["evidence"] = []
    else:
        data["fields"][0]["observations"][0]["evidence"][0]["pdf_page"] = 2
    with pytest.raises((ValidationError, ValueError)):
        ExtractionResult.model_validate(data).check_sources("Example City", 1, 1)


def test_unrelated_project_session_is_not_exposed():
    """Do not expose other agents sharing the upstream project credentials."""
    data = session()
    data["metadata"]["service"] = "another-service"
    with pytest.raises(ProviderError) as error:
        run(adapter(lambda _: httpx.Response(200, json=data)).session("sess_other"))
    assert error.value.status == 404


def test_upload_failure_cleans_known_files():
    """Remove the first uploaded input if uploading the second input fails."""
    calls = []

    def upstream(request):
        """Fail the second upload and record the cleanup request."""
        calls.append((request.method, request.url.path))
        if request.method == "DELETE":
            return httpx.Response(200, json={"deleted": True})
        if len(calls) == 1:
            return httpx.Response(200, json={"id": "file_first"})
        return httpx.Response(429, json={"error": "rate limited"})

    with pytest.raises(ProviderError):
        run(adapter(upstream).submit("City", pdf(), pdf(), 1, 1))
    assert calls[-1] == ("DELETE", "/v1/files/file_first")


def test_delete_running_job_is_rejected():
    """Do not destroy session state before running execution has stopped."""

    def upstream(request):
        """Return a running root turn and reject unexpected mutations."""
        assert request.method == "GET"
        if request.url.path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "turn", "status": "in_progress", "subagent_id": None}
                    ],
                    "has_more": False,
                },
            )
        return httpx.Response(200, json=session("in_progress"))

    with pytest.raises(ProviderError) as error:
        run(adapter(upstream).delete("sess_test"))
    assert error.value.status == 409


@pytest.mark.parametrize(
    "outcome,should_cleanup", [(400, True), (500, False), ("timeout", False)]
)
def test_session_failure_distinguishes_rejection_from_uncertain_acceptance(
    outcome, should_cleanup
):
    """Keep inputs after uncertain acceptance but remove them after rejection."""
    deleted = []
    uploaded = []

    def upstream(request):
        """Supply known file IDs and simulate session submission failure."""
        if request.method == "DELETE":
            deleted.append(request.url.path)
            return httpx.Response(200, json={"deleted": True})
        if request.url.path == "/v1/files":
            file_id = f"file_{len(uploaded)}"
            uploaded.append(file_id)
            return httpx.Response(200, json={"id": file_id})
        if outcome == "timeout":
            raise httpx.ReadTimeout("uncertain", request=request)
        return httpx.Response(outcome, json={"error": "not exposed"})

    with pytest.raises(ProviderError):
        run(adapter(upstream).submit("City", pdf(), pdf(), 1, 1))
    assert bool(deleted) is should_cleanup
    if should_cleanup:
        assert len(deleted) == 2
