"""Check scoring isolation, typed matching, case binding, and schema-cache recovery."""

import json
import shutil
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from examples.import_key_tables import table
from extractor.api import create_app
from extractor.benchmarks import BenchmarkCatalog, ROOT, matches
from extractor.provider import AgentsProvider, RESULT_PATH
from test_json_schema import SCHEMA, schema_candidate
from test_service import AUTH, SETTINGS, adapter, pdf, run, session


@pytest.fixture
def catalog(tmp_path):
    """Copy public definitions only; tests never depend on private Product answers."""
    for name in ["cases.json", "schemas", "prompts", "expected", "references"]:
        source = (
            Path(__file__).with_name("fixtures") / name
            if name == "cases.json"
            else ROOT / name
        )
        if source.is_dir():
            shutil.copytree(source, tmp_path / name)
        else:
            shutil.copyfile(source, tmp_path / name)
    (tmp_path / ".local/pdfs").mkdir(parents=True)
    (tmp_path / ".local/pdfs/small-ghgi.pdf").write_bytes(pdf())
    return BenchmarkCatalog(tmp_path)


@pytest.mark.parametrize(
    "actual,expected,tolerance,passed",
    [
        (None, 0, 0, False),
        (False, 0, 0, False),
        ("12", 12, 0, False),
        (12000, 12, 0.5, False),
        (12.05, 12, 0.05, True),
        ("Transport", "transport", 0, True),
        ("São Paulo", "Sao Paulo", 0, True),
    ],
)
def test_typed_expected_values(actual, expected, tolerance, passed):
    """Reject missing/string/bool values and unit-scale errors instead of coercing."""
    assert matches(actual, expected, tolerance) is passed


def install_expected(catalog, checks):
    """Replace one synthetic key with a minimal scenario-specific check list."""
    catalog.path("expected/small-ghgi.json").write_text(
        json.dumps({"checks": checks}), encoding="utf-8"
    )


def test_duplicate_rows_cannot_satisfy_multiple_expected_rows(catalog):
    """Distinct matching prevents one found value from inflating recovered-row counts."""
    check = {"row": {"gpc_ref": "I.1.1", "scope": 1}, "value": 12}
    install_expected(catalog, [check, check])
    row = {"gpc_ref": "I.1.1", "scope": 1, "emissions_tco2e": 12}
    result = catalog.evaluate("small-ghgi", {"result": {"data": {"rows": [row]}}})
    assert result["passed"] == 1 and result["total"] == 2
    row["scope"] = 2
    assert (
        catalog.evaluate("small-ghgi", {"result": {"data": {"rows": [row]}}})["passed"]
        == 0
    )


def test_inventory_total_uses_gpc_exclusions_and_keeps_removals(catalog):
    """The independently computed total is different from an arbitrary printed total."""
    install_expected(catalog, [{"aggregate": "inventory_total", "value": 80}])
    rows = [
        {"gpc_ref": code, "emissions_tco2e": value}
        for code, value in [
            ("I.1.1", 100),
            ("V.2", -20),
            ("I.4.4", 900),
            ("III.1.3", 150),
            ("VI.1", 200),
        ]
    ]
    assert (
        catalog.evaluate(
            "small-ghgi",
            {"result": {"data": {"reported_total_tco2e": 999, "rows": rows}}},
        )["status"]
        == "passed"
    )
    rows.append({"gpc_ref": None, "emissions_tco2e": 10})
    assert (
        catalog.evaluate("small-ghgi", {"result": {"data": {"rows": rows}}})["status"]
        == "failed"
    )


def test_unsplit_scope_group_sums_only_the_requested_subsector(catalog):
    """Group checks accept split outputs without mixing other subsectors."""
    install_expected(catalog, [{"group": "I.1", "value": 30}])
    rows = [
        {"gpc_ref": code, "emissions_tco2e": value}
        for code, value in [("I.1.1", 10), ("I.1.2", 20), ("I.2.1", 100)]
    ]
    assert (
        catalog.evaluate("small-ghgi", {"result": {"data": {"rows": rows}}})["status"]
        == "passed"
    )


def test_case_context_keeps_private_answers_out_of_agent_inputs(catalog):
    """Loading a case provides schema/guidance, never the independent expected values."""
    keys = {"files": {"C-008": {"year": 2021, "expectedTotal": 987654321, "rows": []}}}
    catalog.path(".local/answer-keys.json").write_text(json.dumps(keys))
    assert "987654321" not in json.dumps(catalog.load("C-008"))
    assert catalog.summary(catalog.get("C-008"))["answers_ready"]
    with pytest.raises(ValueError):
        catalog.path("../../private.env")


def test_benchmark_routes_require_auth_and_reject_wrong_pdf_before_upstream(catalog):
    """A scored case must use the selected local PDF bytes and normal access rules."""

    def unexpected(request):
        """Any paid request means input binding failed."""
        raise AssertionError("Upstream must not be called")

    app = create_app(SETTINGS, adapter(unexpected), benchmark_catalog=catalog)
    with TestClient(app) as client:
        assert client.get("/v1/benchmarks").status_code == 401
        assert (
            client.get("/v1/benchmarks/small-ghgi/pdf", headers=AUTH).content == pdf()
        )
        assert client.get("/v1/benchmarks/unknown/pdf", headers=AUTH).status_code == 404
        response = client.post(
            "/v1/extractions",
            headers=AUTH,
            data={"benchmark_case": "small-ghgi", "data_schema": json.dumps(SCHEMA)},
            files={"city_pdf": ("other.pdf", pdf() + b"\nDifferent input")},
        )
        assert response.status_code == 422


def test_schema_cache_survives_restart_without_downloading_user_data(tmp_path):
    """Live OpenAI rejects user_data downloads, so result checks must use the snapshot."""
    settings = replace(SETTINGS, state_path=str(tmp_path / "jobs.sqlite3"))
    first = AgentsProvider(settings, None)
    first.save_schema("file_schema", SCHEMA)

    def upstream(request):
        """Supply a completed candidate, failing any attempted input-file download."""
        path = request.url.path
        assert not path.startswith("/v1/files/")
        if path.endswith("/turns"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "turn", "status": "completed", "subagent_id": None}
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
                            "id": "artifact",
                            "turn_id": "turn",
                            "path": RESULT_PATH,
                            "size_bytes": 5000,
                        }
                    ],
                    "has_more": False,
                },
            )
        if path.endswith("/content"):
            return httpx.Response(200, json=schema_candidate())
        value = session()
        value["metadata"].update(
            definition_mode="json_schema", schema_file_id="file_schema"
        )
        return httpx.Response(200, json=value)

    restarted = AgentsProvider(
        settings,
        httpx.AsyncClient(
            base_url="https://api.openai.com", transport=httpx.MockTransport(upstream)
        ),
    )
    assert run(restarted.result("sess_test"))["validation"]["data_schema"] == "passed"


def test_key_table_import_does_not_silently_shift_columns():
    """Malformed exported keys must fail clearly instead of scoring the wrong values."""
    with pytest.raises(ValueError):
        table("| File ID | Value |\n| C-001 | 10 | unexpected |")
    assert table("| File ID | Value |\n| C-001 | 10 |") == [
        {"File ID": "C-001", "Value": "10"}
    ]
