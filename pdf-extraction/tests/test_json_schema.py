"""Check both definition modes and protect schema validation from remote fetches."""

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from extractor.api import create_app
from extractor.config import Settings
from extractor.models import SchemaExtractionResult
from extractor.provider import ProviderError, RESULT_PATH
from extractor.schema import parse_schema, schema_errors
from test_service import AUTH, SETTINGS, adapter, candidate, pdf, run, session

SCHEMA = {
    "type": "object",
    "properties": {"electricity_mwh": {"type": ["number", "null"]}},
    "required": ["electricity_mwh"],
    "additionalProperties": False,
}


def schema_candidate() -> dict:
    """Build a typed value with source evidence at its JSON Pointer."""
    result = candidate()
    result.pop("taxonomy")
    result.pop("taxonomy_pages_reviewed")
    result["data"] = {"electricity_mwh": 12500}
    result["fields"][0]["field_id"] = "/electricity_mwh"
    return result


def test_json_mode_uploads_target_schema_and_result_contract():
    """Pass a user schema as a durable file, with the JSON-mode result wrapper."""
    calls = []

    def upstream(request):
        """Inspect the session after the two Files API uploads."""
        calls.append(request)
        if request.url.path == "/v1/files":
            return httpx.Response(200, json={"id": f"file_{len(calls)}"})
        body = json.loads(request.content)
        assert body["metadata"]["definition_mode"] == "json_schema"
        assert body["metadata"]["schema_file_id"] == "file_2"
        assert "taxonomy_file_id" not in body["metadata"]
        files = body["environment"]["files"]
        assert files[1]["path"] == "/workspace/data.schema.json"
        contract = json.loads(base64.b64decode(files[2]["data"]))
        assert "data" in contract["properties"]
        assert "taxonomy" not in contract["properties"]
        inputs = json.loads(body["input"][0]["content"][0]["text"])
        assert inputs["taxonomy_pdf"] is None
        return httpx.Response(200, json=session("in_progress"))

    with TestClient(create_app(SETTINGS, adapter(upstream))) as client:
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"data_schema": json.dumps(SCHEMA)},
            files={"city_pdf": ("report.pdf", pdf())},
        )
    assert response.status_code == 202
    assert len(calls) == 3


@pytest.mark.parametrize(
    "definition", ["neither", "both", "invalid_json", "invalid_schema", "external_ref"]
)
def test_invalid_definition_rejected_before_any_upload(definition):
    """Require one valid definition before starting any paid remote work."""
    data, files = {}, {"city_pdf": ("report.pdf", pdf())}
    if definition == "both":
        data["data_schema"] = json.dumps(SCHEMA)
        files["taxonomy_pdf"] = ("taxonomy.pdf", pdf())
    elif definition == "invalid_json":
        data["data_schema"] = "{broken"
    elif definition == "invalid_schema":
        data["data_schema"] = '{"type":"object","required":"bad"}'
    elif definition == "external_ref":
        data["data_schema"] = (
            '{"type":"object","properties":{"value":{"$ref":"https://example.com/private"}}}'
        )
    with TestClient(
        create_app(
            SETTINGS, adapter(lambda _: pytest.fail("no upstream call expected"))
        )
    ) as client:
        assert (
            client.post(
                "/v1/extractions", headers=AUTH, data=data, files=files
            ).status_code
            == 422
        )


def test_nested_local_refs_and_typed_validation():
    """Resolve local definitions and preserve standard number validation."""
    schema = parse_schema(
        json.dumps(
            {
                "type": "object",
                "$defs": {"reading": {"type": "number"}},
                "properties": {
                    "nested": {
                        "type": "object",
                        "properties": {"value": {"$ref": "#/$defs/reading"}},
                    }
                },
            }
        )
    )
    assert schema_errors({"nested": {"value": 42}}, schema) == []
    assert schema_errors({"nested": {"value": "42"}}, schema)


def test_partial_data_can_be_reviewed_without_claiming_schema_success():
    """An honest missing value remains visible with explicit schema errors."""
    output = schema_candidate()
    output["data"] = {}
    output["fields"][0].update(status="not_found_after_search", observations=[])

    def upstream(request):
        """Return a completed JSON-mode job and its durable schema file."""
        path = request.url.path
        if path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "turn_1", "status": "completed", "subagent_id": None}
                    ],
                    "has_more": False,
                },
            )
        if path.endswith("/artifacts"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "artifact_1",
                            "turn_id": "turn_1",
                            "path": RESULT_PATH,
                            "size_bytes": 2000,
                        }
                    ],
                    "has_more": False,
                },
            )
        if path.endswith("/artifacts/artifact_1/content"):
            return httpx.Response(200, json=output)
        if path == "/v1/files/file_schema/content":
            return httpx.Response(200, json=SCHEMA)
        job = session()
        job["metadata"].update(
            definition_mode="json_schema", schema_file_id="file_schema"
        )
        return httpx.Response(200, json=job)

    result = run(adapter(upstream).result("sess_test"))
    assert result["validation"]["data_schema"] == "failed"
    assert result["validation"]["data_schema_errors"]
    assert result["result"]["data"] == {}


def test_data_without_evidence_is_rejected():
    """Every populated leaf needs a matching evidence-bearing field record."""
    output = schema_candidate()
    output["data"]["unsupported"] = 12
    with pytest.raises(ValueError, match="requires a field outcome"):
        SchemaExtractionResult.model_validate(output).check_sources("Example City", 1)


def test_null_ambiguity_can_keep_source_evidence():
    """Keep evidence explaining a null without presenting its candidate as accepted."""
    output = schema_candidate()
    output["data"]["electricity_mwh"] = None
    output["fields"][0]["status"] = "ambiguous"
    result = SchemaExtractionResult.model_validate(output)
    assert result.check_sources("Example City", 1) == []
    output["fields"][0]["status"] = "found"
    with pytest.raises(ValueError, match="null value"):
        SchemaExtractionResult.model_validate(output).check_sources("Example City", 1)


def test_null_data_still_requires_a_field_outcome():
    """Nullable values cannot silently hide missing field-level accounting."""
    output = schema_candidate()
    output["data"] = {"electricity_mwh": None}
    output["fields"] = []
    with pytest.raises(ValueError, match="requires a field outcome"):
        SchemaExtractionResult.model_validate(output).check_sources("Example City", 1)


def test_frontend_loads_without_upstream_key():
    """Explore the UI and sample output before configuring paid API access."""
    settings = Settings("", "s" * 32)
    with TestClient(
        create_app(settings, adapter(lambda _: pytest.fail("no upstream")))
    ) as client:
        assert "Document lab" in client.get("/").text
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/v1/config").json()["ready"] is False
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"data_schema": json.dumps(SCHEMA)},
            files={"city_pdf": ("report.pdf", pdf())},
        )
        assert response.status_code == 503


def test_tokenless_demo_rejects_remote_hosts_and_cross_origin_posts():
    """The no-token convenience mode must stay on the local computer."""
    settings = Settings("", "")
    with TestClient(
        create_app(settings),
        client=("127.0.0.1", 12345),
        base_url="http://localhost:8080",
    ) as client:
        assert client.get("/").status_code == 200
        assert client.get("/", headers={"Host": "evil.example"}).status_code == 403
        assert (
            client.post(
                "/v1/extractions", headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
