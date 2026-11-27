"""Verify optional OCR, page mapping, credential separation, and context cleanup."""

import base64
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from extractor.api import create_app
from extractor.ocr import MistralOCR
from extractor.provider import ProviderError
from test_json_schema import SCHEMA
from test_service import AUTH, SETTINGS, adapter, pdf, run, session

OCR_SETTINGS = replace(SETTINGS, mistral_api_key="test-mistral-secret")


def ocr_adapter(handler, settings=OCR_SETTINGS):
    """Keep OCR calls on their own mocked client and credentials."""
    return MistralOCR(
        settings,
        httpx.AsyncClient(
            base_url="https://api.mistral.ai", transport=httpx.MockTransport(handler)
        ),
    )


def ocr_response(index=0) -> dict:
    """Return illustrative structured OCR, including a separate table payload."""
    return {
        "model": "mistral-ocr-4-1",
        "pages": [
            {
                "index": index,
                "markdown": "Electricity [tbl-0.html](tbl-0.html)",
                "tables": [
                    {
                        "id": "tbl-0.html",
                        "content": "<table><tr><td>12500 MWh</td></tr></table>",
                    }
                ],
                "blocks": [{"type": "text", "content": "Electricity"}],
            }
        ],
        "usage_info": {"pages_processed": 1},
    }


def test_ocr_off_does_not_call_mistral():
    """A configured key alone must never start paid OCR work."""

    def upstream(request):
        """Inspect the unchanged no-OCR session."""
        if request.url.path == "/v1/files":
            return httpx.Response(200, json={"id": "file_input"})
        body = json.loads(request.content)
        assert body["metadata"]["ocr_provider"] == "none"
        assert json.loads(body["input"][0]["content"][0]["text"])["ocr_context"] is None
        assert len(body["environment"]["files"]) == 3
        return httpx.Response(200, json=session("in_progress"))

    with TestClient(
        create_app(
            OCR_SETTINGS,
            adapter(upstream),
            ocr_adapter(lambda _: pytest.fail("OCR should remain off")),
        )
    ) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"data_schema": json.dumps(SCHEMA)},
            files={"city_pdf": ("report.pdf", pdf())},
        )
    assert response.status_code == 202


@pytest.mark.parametrize("pdf_definition", [False, True])
def test_ocr_on_attaches_extra_context_and_preserves_original_pdfs(pdf_definition):
    """Pass OCR as an extra file, never as a replacement PDF or agent credential."""
    ocr_calls, upload_calls, sessions = [], [], []

    def mistral(request):
        """Check the actual Mistral request without making an external call."""
        assert request.url.host == "api.mistral.ai"
        assert request.headers["Authorization"] == "Bearer test-mistral-secret"
        assert "OpenAI-Beta" not in request.headers
        body = json.loads(request.content)
        assert body["table_format"] == "html"
        assert body["include_image_base64"] is False
        assert base64.b64decode(
            body["document"]["document_url"].split(",", 1)[1]
        ).startswith(b"%PDF-")
        ocr_calls.append(body)
        return httpx.Response(200, json=ocr_response())

    def upstream(request):
        """Verify uploaded context and session file references."""
        assert "test-mistral-secret" not in request.content.decode(
            "utf-8", errors="ignore"
        )
        if request.url.path == "/v1/files":
            upload_calls.append(request)
            return httpx.Response(200, json={"id": f"file_{len(upload_calls)}"})
        body = json.loads(request.content)
        sessions.append(body)
        return httpx.Response(200, json=session("in_progress"))

    data = {"use_mistral_ocr": "true"}
    files = {"city_pdf": ("report.pdf", pdf())}
    if pdf_definition:
        files["taxonomy_pdf"] = ("taxonomy.pdf", pdf())
    else:
        data["data_schema"] = json.dumps(SCHEMA)
    with TestClient(
        create_app(OCR_SETTINGS, adapter(upstream), ocr_adapter(mistral))
    ) as client:
        config = client.get("/v1/config").json()
        assert config["mistral_ocr_ready"] is True
        assert "test-mistral-secret" not in json.dumps(config)
        assert (
            client.post(
                "/v1/extractions", headers=AUTH, data=data, files=files
            ).status_code
            == 202
        )
    assert len(ocr_calls) == (2 if pdf_definition else 1)
    assert len(upload_calls) == 3
    context_upload = upload_calls[-1].content
    assert b'"pdf_page": 1' in context_upload
    assert b"<table>" in context_upload
    assert (b"/workspace/taxonomy.pdf" in context_upload) is pdf_definition
    body = sessions[0]
    inputs = json.loads(body["input"][0]["content"][0]["text"])
    assert inputs["ocr_context"] == "/workspace/ocr-context.json"
    assert body["environment"]["files"][0]["path"] == "/workspace/city.pdf"
    assert body["environment"]["files"][-1] == {
        "type": "file_id",
        "file_id": "file_3",
        "path": "/workspace/ocr-context.json",
    }
    assert body["metadata"]["ocr_file_id"] == "file_3"


def test_missing_ocr_key_fails_before_any_paid_work():
    """Do not silently skip selected OCR or submit a partial OpenAI job."""
    with TestClient(
        create_app(
            SETTINGS, adapter(lambda _: pytest.fail("No upstream call expected"))
        )
    ) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"use_mistral_ocr": "true", "data_schema": json.dumps(SCHEMA)},
            files={"city_pdf": ("report.pdf", pdf())},
        )
        assert response.status_code == 503
        assert "MISTRAL_API_KEY" in response.json()["detail"]


def test_ocr_failure_does_not_start_openai_job():
    """A failed OCR request is visible and is not automatically retried."""
    calls = []

    def mistral(request):
        """Simulate one rate-limited OCR response."""
        calls.append(request)
        return httpx.Response(429, json={"error": "not exposed"})

    with TestClient(
        create_app(
            OCR_SETTINGS,
            adapter(lambda _: pytest.fail("No OpenAI calls expected")),
            ocr_adapter(mistral),
        )
    ) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"use_mistral_ocr": "true", "data_schema": json.dumps(SCHEMA)},
            files={"city_pdf": ("report.pdf", pdf())},
        )
        assert response.status_code == 502
    assert len(calls) == 1


@pytest.mark.parametrize("index", [-1, 1, True])
def test_invalid_ocr_page_mapping_is_rejected(index):
    """Do not let OCR indices point to the wrong physical PDF page."""
    with pytest.raises(ProviderError, match="invalid page data"):
        run(
            ocr_adapter(
                lambda _: httpx.Response(200, json=ocr_response(index))
            ).extract(pdf(), "/workspace/city.pdf", 1)
        )


def test_missing_ocr_pages_are_explicit_context():
    """Expose incomplete OCR coverage so the agent can return to the PDF."""
    result = run(
        ocr_adapter(lambda _: httpx.Response(200, json=ocr_response())).extract(
            pdf(), "/workspace/city.pdf", 2
        )
    )
    assert result["pages"][0]["pdf_page"] == 1
    assert result["missing_pages"] == [2]


def test_cleanup_includes_the_additional_ocr_file():
    """Delete OCR context together with the stopped session's PDF inputs."""
    deleted = []

    def upstream(request):
        """Return a stopped OCR job and record cleanup calls."""
        if request.method == "DELETE":
            deleted.append(request.url.path)
            return httpx.Response(200, json={"deleted": True})
        if request.url.path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "turn", "status": "completed", "subagent_id": None}
                    ],
                    "has_more": False,
                },
            )
        job = session()
        job["metadata"]["ocr_file_id"] = "file_ocr"
        return httpx.Response(200, json=job)

    assert run(adapter(upstream).delete("sess_test")) == []
    assert "/v1/files/file_ocr" in deleted
