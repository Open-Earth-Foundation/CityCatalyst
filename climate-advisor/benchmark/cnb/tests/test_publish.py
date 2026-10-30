"""Manual publication keeps baseline selection and saved comparison consistent."""

from __future__ import annotations

import hashlib
import json
import zipfile

import pytest

from benchmark.cnb.golden_set.baseline import artifact_digest
from benchmark.cnb.golden_set.viewer import publish_run
from benchmark.cnb.scripts import publish
from benchmark.cnb.tests.test_viewer import STAGE_OK, make_run


@pytest.fixture
def review_runs(tmp_path):
    baseline = make_run(tmp_path, "approved", "2026-10-01", extraction=STAGE_OK)
    candidate = make_run(
        tmp_path,
        "candidate",
        "2026-10-02",
        extraction={**STAGE_OK, "semantic_failures": ["new quality failure"]},
    )
    publish_run(baseline, tmp_path)
    publish_run(candidate, tmp_path)
    fingerprints = {"corpus": "a" * 64, "judge_policy": "b" * 64}
    manifest = tmp_path / "baseline.json"
    manifest.write_text(
        json.dumps(
            {
                "status": "approved",
                "run_id": baseline.name,
                "report_sha256": hashlib.sha256(
                    (baseline / "report.json").read_bytes()
                ).hexdigest(),
                "artifact_sha256": artifact_digest(baseline),
                "fingerprints": fingerprints,
                "approval": {
                    "reviewer": "test-reviewer",
                    "approved_at": "2026-10-29",
                    "reference": "test-only",
                },
            }
        ),
        encoding="utf-8",
    )
    (candidate / "delivery.json").write_text(
        json.dumps(
            {
                "execution": "complete",
                "fingerprints": fingerprints,
                "baseline": {"status": "unavailable"},
                "publication": {"status": "failed"},
            }
        ),
        encoding="utf-8",
    )
    (candidate / "comparison.json").write_text(
        json.dumps(
            {
                "candidate_run_id": candidate.name,
                "baseline": {"status": "unavailable"},
                "rows": [],
                "quality_regression": None,
            }
        ),
        encoding="utf-8",
    )
    args = [
        "--results-dir",
        str(tmp_path),
        "--candidate",
        candidate.name,
        "--baseline-manifest",
        str(manifest),
        "--baseline-results-dir",
        str(tmp_path),
    ]
    return baseline, candidate, args


def test_republish_recomputes_pending_comparison_against_approved_baseline(review_runs):
    baseline, candidate, args = review_runs
    original_report = (candidate / "report.json").read_bytes()
    original_snapshot = (candidate / "viewer.js").read_bytes()
    baseline_digest = artifact_digest(baseline)

    assert publish.main(args) == 0
    comparison = json.loads((candidate / "comparison.json").read_text(encoding="utf-8"))
    delivery = json.loads((candidate / "delivery.json").read_text(encoding="utf-8"))
    assert comparison["baseline"]["baseline_run_id"] == baseline.name
    assert comparison["quality_regression"] is True
    assert comparison["rows"][0]["new_failures"] == ["new quality failure"]
    assert delivery["baseline"] == comparison["baseline"]
    assert delivery["publication"]["status"] == "published"
    with zipfile.ZipFile(candidate / "review-bundle.zip") as bundle:
        assert json.loads(bundle.read("comparison.json")) == comparison
        assert b"new quality failure" in bundle.read("comparison.md")
        assert json.loads(bundle.read("runs/candidate/delivery.json")) == delivery
    assert (candidate / "report.json").read_bytes() == original_report
    assert (candidate / "viewer.js").read_bytes() == original_snapshot
    assert artifact_digest(baseline) == baseline_digest


def test_republish_retains_failed_publication_status(review_runs, monkeypatch):
    _, candidate, args = review_runs

    def fail_bundle(*args, **kwargs):
        raise OSError("private filesystem detail")

    monkeypatch.setattr(publish, "publish_bundle", fail_bundle)
    assert publish.main(args) == 3
    delivery = json.loads((candidate / "delivery.json").read_text(encoding="utf-8"))
    assert delivery["publication"] == {"status": "failed", "error_type": "OSError"}
    summary = (candidate / "comparison.md").read_text(encoding="utf-8")
    assert "Publication: **failed**" in summary
    assert "private filesystem detail" not in summary
