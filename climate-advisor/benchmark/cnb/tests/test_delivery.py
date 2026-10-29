"""Offline evidence retention, baseline trust and downloadable review regressions."""

from __future__ import annotations

import hashlib
import json
import zipfile

from benchmark.cnb.golden_set.baseline import (
    artifact_digest,
    compare_reports,
    content_digest,
    load_approved_baseline,
)
from benchmark.cnb.golden_set.models import FixtureReport, StageReport
from benchmark.cnb.golden_set.viewer import publish_bundle, publish_run
from benchmark.cnb.scripts import evaluate as evaluator
from benchmark.cnb.tests.test_viewer import STAGE_OK, make_run


def test_baseline_requires_explicit_approval_and_rejects_changed_content(tmp_path):
    run = make_run(tmp_path, "approved", "2026-10-01", extraction=STAGE_OK)
    publish_run(run, tmp_path)
    fingerprints = {"corpus": "a" * 64, "judge_policy": "b" * 64}
    manifest = tmp_path / "baseline.json"
    manifest.write_text('{"status":"pending"}', encoding="utf-8")
    assert (
        load_approved_baseline(manifest, tmp_path, fingerprints)[1]["status"]
        == "unavailable"
    )
    value = {
        "status": "approved",
        "run_id": run.name,
        "report_sha256": hashlib.sha256((run / "report.json").read_bytes()).hexdigest(),
        "artifact_sha256": artifact_digest(run),
        "fingerprints": fingerprints,
        "approval": {
            "reviewer": "test-reviewer",
            "approved_at": "2026-10-29",
            "reference": "test-fixture-only",
        },
    }
    manifest.write_text(json.dumps(value), encoding="utf-8")
    assert load_approved_baseline(manifest, tmp_path, fingerprints)[0] == run
    assert (
        load_approved_baseline(
            manifest, tmp_path, {**fingerprints, "corpus": "different"}
        )[1]["status"]
        == "incompatible"
    )
    (run / "viewer.js").write_text("tampered", encoding="utf-8")
    assert (
        load_approved_baseline(manifest, tmp_path, fingerprints)[1]["status"]
        == "incompatible"
    )
    assert content_digest({"fact": "yes"}) != content_digest({"fact": "not"})


def test_mixed_regression_and_unavailable_never_resolves_missing_coverage():
    prior = {
        "fixtures": [
            {
                "fixture_id": "f",
                "extraction": {**STAGE_OK, "semantic_failures": ["old failure"]},
                "verification": STAGE_OK,
            }
        ]
    }
    candidate = {
        "fixtures": [
            {
                "fixture_id": "f",
                "extraction": None,
                "verification": {**STAGE_OK, "semantic_failures": ["new failure"]},
            }
        ]
    }
    comparison = compare_reports(candidate, prior)
    assert comparison["quality_regression"] and comparison["evaluation_unavailable"]
    extraction = next(row for row in comparison["rows"] if row["stage"] == "extraction")
    assert extraction["resolved_failures"] == []


def test_bundle_preserves_snapshots_defaults_to_pair_and_includes_raw_outputs(tmp_path):
    baseline = make_run(tmp_path, "baseline", "2026-10-01", extraction=STAGE_OK)
    candidate = make_run(tmp_path, "candidate", "2026-10-02", extraction=STAGE_OK)
    publish_run(baseline, tmp_path)
    publish_run(candidate, tmp_path)
    original = (baseline / "viewer.js").read_bytes()
    (candidate / "comparison.json").write_text(
        json.dumps(
            {
                "candidate_run_id": "candidate",
                "baseline": {"status": "comparable", "baseline_run_id": "baseline"},
                "rows": [],
            }
        ),
        encoding="utf-8",
    )
    (candidate / "comparison.md").write_text("summary", encoding="utf-8")
    archive = publish_bundle(candidate, tmp_path, baseline_dir=baseline)
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.read("runs/baseline/viewer.js") == original
        assert (
            "runs/candidate/outputs/harbor-point-heat-resilience/extraction/judgment.json"
            in bundle.namelist()
        )
        assert b'"baseline_run_id": "baseline"' in bundle.read("comparison.js")
        assert b"comparison.js" in bundle.read("index.html")
        assert bundle.read("comparison.md") == b"summary"


def test_setup_failure_still_writes_report_comparison_and_delivery(
    tmp_path, monkeypatch
):
    async def broken(args):
        raise ValueError("private setup detail")

    monkeypatch.setattr(evaluator, "evaluate", broken)
    monkeypatch.setattr(evaluator, "publish_run", lambda *args, **kwargs: None)
    monkeypatch.setattr(evaluator, "publish_bundle", lambda *args, **kwargs: None)
    assert evaluator.main(["--run-id", "setup", "--results-dir", str(tmp_path)]) == 3
    run = tmp_path / "runs" / "setup"
    assert json.loads((run / "delivery.json").read_text())["execution"] == "incomplete"
    assert json.loads((run / "comparison.json").read_text())["evaluation_unavailable"]
    assert (run / "report.json").exists() and (run / "report.md").exists()
    assert "private setup detail" not in (run / "delivery.json").read_text()


def test_timeout_retains_completed_stage_and_publication_failure(tmp_path, monkeypatch):
    async def timeout(args):
        args.report.fixtures.append(
            FixtureReport(
                fixture_id="f",
                source_sha256="0" * 64,
                source_format="markdown",
                extraction=StageReport(semantic_failures=["found defect"]),
            )
        )
        evaluator._write_report(args, args.report)
        raise TimeoutError

    def fail_publication(*args, **kwargs):
        raise OSError("disk")

    monkeypatch.setattr(evaluator, "evaluate", timeout)
    monkeypatch.setattr(evaluator, "publish_run", fail_publication)
    assert evaluator.main(["--run-id", "partial", "--results-dir", str(tmp_path)]) == 3
    run = tmp_path / "runs" / "partial"
    report = json.loads((run / "report.json").read_text())
    assert report["fixtures"][0]["extraction"]["semantic_failures"] == ["found defect"]
    delivery = json.loads((run / "delivery.json").read_text())
    assert delivery["publication"]["status"] == "failed"
    assert delivery["execution"] == "incomplete"


def test_partial_run_directory_is_not_overwritten(tmp_path):
    (tmp_path / "runs" / "partial").mkdir(parents=True)
    assert evaluator.main(["--run-id", "partial", "--results-dir", str(tmp_path)]) == 2


def test_swapped_missing_pairs_regress_even_when_aggregate_coverage_is_unchanged():
    stage = {
        **STAGE_OK,
        "metrics": {"required_fact_coverage": 0.5},
        "semantic_failures": ["coverage below threshold"],
    }

    def report(missing):
        return {
            "fixtures": [
                {
                    "fixture_id": "f",
                    "extraction": {
                        **stage,
                        "details": {"missing_mandatory_pairs": [missing]},
                    },
                }
            ]
        }

    result = compare_reports(report("cost::financing"), report("date::summary"))
    assert result["quality_regression"]
    assert result["rows"][0]["new_failures"] == ["mandatory_pair:cost::financing"]
    assert result["rows"][0]["resolved_failures"] == ["mandatory_pair:date::summary"]
