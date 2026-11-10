"""Approved-baseline trust boundaries and unavailable comparison coverage."""

from __future__ import annotations

import copy
import hashlib
import json

import pytest

from benchmark.cnb.golden_set.baseline import (
    artifact_digest,
    compare_reports,
    load_approved_baseline,
)
from benchmark.cnb.tests.test_viewer import STAGE_OK, make_run


def test_policy_fingerprint_ignores_checkout_line_endings(tmp_path, monkeypatch):
    from benchmark.cnb.golden_set import baseline

    monkeypatch.setattr(baseline, "__file__", str(tmp_path / "baseline.py"))
    scorers = ["core.py", "chapters.py", "verification.py", "editing.py", "models.py"]
    for name in scorers:
        (tmp_path / name).write_bytes(b"# scorer\npass\n")
    linux = baseline.evaluation_fingerprints([], {}, ["extraction"])
    for name in scorers:
        (tmp_path / name).write_bytes(b"# scorer\r\npass\r\n")
    assert baseline.evaluation_fingerprints([], {}, ["extraction"]) == linux
    (tmp_path / "core.py").write_bytes(b"# changed scorer\npass\n")
    assert baseline.evaluation_fingerprints([], {}, ["extraction"]) != linux


@pytest.fixture
def approved_run(tmp_path):
    run = make_run(tmp_path, "approved", "2026-10-01", extraction=STAGE_OK)
    (run / "viewer.js").write_text("// immutable test snapshot\n", encoding="utf-8")
    report = json.loads((run / "report.json").read_text(encoding="utf-8"))
    fingerprints = {"corpus": "a" * 64, "judge_policy": "b" * 64}
    manifest = {
        "status": "approved",
        "run_id": run.name,
        "fingerprints": fingerprints.copy(),
        "approval": {
            "reviewer": "Test reviewer",
            "approved_at": "2000-01-01",
            "reference": "test-only approval",
        },
    }

    def save_and_load():
        # Re-pin edited files so tests reach semantic checks, not digest failures.
        (run / "report.json").write_text(json.dumps(report), encoding="utf-8")
        manifest["report_sha256"] = hashlib.sha256(
            (run / "report.json").read_bytes()
        ).hexdigest()
        manifest["artifact_sha256"] = artifact_digest(run)
        path = tmp_path / "baseline.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        return load_approved_baseline(path, tmp_path, fingerprints)

    assert save_and_load()[0] == run
    return report, manifest, save_and_load


@pytest.mark.parametrize(
    "field,value,manifest_field",
    [
        ("run_id", "another-run", None),
        ("corpus_fingerprint", "c" * 64, None),
        ("evaluator_fingerprint", "c" * 64, None),
        ("evaluator_fingerprint", "unversioned", "judge_policy"),
    ],
)
def test_manifest_must_match_saved_identity_and_valid_fingerprints(
    approved_run, field, value, manifest_field
):
    report, manifest, load = approved_run
    report[field] = value
    if manifest_field:
        manifest["fingerprints"][manifest_field] = value
    directory, selection = load()
    assert directory is None
    assert selection["status"] == "incompatible"
    assert "fingerprints" in selection["reason"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("completed", False),
        ("run_errors", ["Fixture execution interrupted"]),
        ("expected_fixture_ids", ["missing-fixture"]),
        ("fixtures", []),
        ("requested_stages", []),
        ("requested_stages", ["unknown-stage"]),
        ("requested_stages", ["extraction", "verification"]),
    ],
)
def test_approved_baseline_requires_complete_recorded_scope(approved_run, field, value):
    report, _, load = approved_run
    report[field] = value
    directory, selection = load()
    assert directory is None
    assert selection["status"] == "incompatible"


@pytest.mark.parametrize(
    "mutation",
    [
        "pending_truth",
        "stale_truth",
        "unavailable_judgment",
        "no_applicable_fixtures",
        "blank_reviewer",
        "future_approval",
    ],
)
def test_approval_cannot_bypass_truth_judgment_or_provenance_checks(
    approved_run, mutation
):
    report, manifest, load = approved_run
    fixture = report["fixtures"][0]
    if mutation == "pending_truth":
        fixture["approval_status"] = "pending"
    elif mutation == "stale_truth":
        fixture["approval_errors"] = ["Source changed after approval"]
    elif mutation == "unavailable_judgment":
        fixture["extraction"]["evaluation_errors"] = ["Judge unavailable"]
    elif mutation == "no_applicable_fixtures":
        fixture["inapplicable_reason"] = "No pinned PDF"
    elif mutation == "blank_reviewer":
        manifest["approval"]["reviewer"] = "  "
    else:
        manifest["approval"]["approved_at"] = "9999-01-01T00:00:00+00:00"
    directory, selection = load()
    assert directory is None
    assert selection["status"] == "incompatible"


def test_missing_expected_fixture_and_requested_stage_remain_unavailable():
    candidate = {
        "completed": True,
        "expected_fixture_ids": ["present", "omitted"],
        "requested_stages": ["extraction", "verification"],
        "fixtures": [{"fixture_id": "present", "extraction": STAGE_OK}],
    }
    result = compare_reports(candidate, None)
    assert result["evaluation_unavailable"] is True
    rows = {(row["fixture_id"], row["stage"]): row for row in result["rows"]}
    assert set(rows) == {
        ("present", "extraction"),
        ("present", "verification"),
        ("omitted", "extraction"),
        ("omitted", "verification"),
    }
    for key in set(rows) - {("present", "extraction")}:
        assert rows[key]["evaluation_errors"]
        assert rows[key]["resolved_failures"] == []
        assert rows[key]["resolved_mandatory_ids"] == []


@pytest.mark.parametrize("value", [[], "invalid", None])
def test_malformed_manifest_is_reported_as_incompatible(tmp_path, value):
    manifest = tmp_path / "baseline.json"
    manifest.write_text(json.dumps(value), encoding="utf-8")
    directory, selection = load_approved_baseline(manifest, tmp_path, {})
    assert directory is None and selection["status"] == "incompatible"


def test_malformed_stage_is_unavailable_baseline(approved_run):
    report, _, load = approved_run
    report["fixtures"][0]["extraction"] = ["invalid stage"]
    directory, selection = load()
    assert directory is None and selection["status"] == "incompatible"


@pytest.mark.parametrize("invalid_judgment", [None, {"facts": []}])
def test_unavailable_candidate_cannot_resolve_failures_or_produce_metric_deltas(
    invalid_judgment,
):
    prior = copy.deepcopy(STAGE_OK)
    prior["semantic_failures"] = ["coverage below threshold"]
    prior["details"] = {"missing_mandatory_pairs": ["cost::financing"]}
    after = {
        **STAGE_OK,
        "metrics": {"required_fact_coverage": 1.0, "required_facts_covered": 5},
        "judgment": invalid_judgment,
        "evaluation_errors": ["Invalid judgment"] if invalid_judgment else [],
    }
    result = compare_reports(
        {"fixtures": [{"fixture_id": "f", "extraction": after}]},
        {"fixtures": [{"fixture_id": "f", "extraction": prior}]},
    )
    row = result["rows"][0]
    assert result["evaluation_unavailable"] is True
    assert row["resolved_failures"] == []
    assert row["resolved_mandatory_ids"] == []
    assert row["new_failures"] == []
    assert all(metric["delta"] is None for metric in row["metrics"].values())
