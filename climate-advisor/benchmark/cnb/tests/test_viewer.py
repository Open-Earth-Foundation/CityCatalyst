"""Results folder, run IDs, and viewer publishing; no model calls."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from benchmark.cnb.golden_set import viewer as publish
from benchmark.cnb.golden_set.judge import judge_prompt_versions
from benchmark.cnb.scripts import evaluate as evaluator

STAGE_OK = {
    "metrics": {"required_fact_coverage": 0.8, "required_facts_covered": 4},
    "integrity_failures": [],
    "semantic_failures": [],
    "evaluation_errors": [],
    "details": {},
    "judgment": {"facts": []},
}


def make_run(results: Path, run_id: str, generated_at: str, **stages) -> Path:
    """Write a minimal saved run with one fixture and the given stage reports."""
    run_dir = results / "runs" / run_id
    out = run_dir / "outputs" / "harbor-point-heat-resilience" / "extraction"
    out.mkdir(parents=True)
    (out / "judgment.json").write_text(json.dumps({"facts": []}), encoding="utf-8")
    report = {
        "run_id": run_id,
        "label": f"label {run_id}",
        "code_version": "abc1234",
        "generated_at": generated_at,
        "analysis_contract_version": "contract",
        "judge_prompt_versions": judge_prompt_versions(publish.get_settings(), ["extraction"]),
        "models": {"judge": {"name": "judge-model", "reasoning_effort": "high"}},
        "corpus_fingerprint": "a" * 64,
        "evaluator_fingerprint": "b" * 64,
        "completed": True,
        "run_errors": [],
        "expected_fixture_ids": ["harbor-point-heat-resilience"],
        "requested_stages": list(stages),
        "fixtures": [
            {
                "fixture_id": "harbor-point-heat-resilience",
                "source_sha256": "0" * 64,
                "source_format": "markdown",
                "approval_status": "approved",
                "approval_errors": [],
                **stages,
            }
        ],
        "passed": False,
    }
    (run_dir / "report.json").write_text(json.dumps(report), encoding="utf-8")
    return run_dir


def read_viewer(path: Path) -> dict:
    """Parse the JSON payload out of a run's viewer.js."""
    return json.loads(path.read_text(encoding="utf-8").split("] = ", 1)[1].rstrip(";\n"))


def test_snapshot_uses_configured_prompt_and_rejects_changed_prompt(tmp_path, monkeypatch):
    prompt_type = type(publish.get_settings().llm.prompts)
    original = prompt_type.get_prompt
    configured = "Configured alternate extraction judge"
    monkeypatch.setattr(
        prompt_type, "get_prompt",
        lambda self, key: configured if key == "cnb_golden_set_extraction_judge" else original(self, key),
    )
    run = make_run(tmp_path, "alternate-prompt", "2026-10-01", extraction=STAGE_OK)
    assert publish.build_run_payload(run)["prompts"]["extraction"] == configured
    configured = "Changed after evaluation"
    with pytest.raises(ValueError, match="prompt digest mismatch"):
        publish.build_run_payload(run)
    assert publish.build_run_payload(run, rebuilt=True)["prompts"]["extraction"] == configured


def test_viewer_retains_conversion_time_and_unknown_cost(tmp_path):
    run = make_run(tmp_path, "pdf-candidate", "2026-10-01", extraction=STAGE_OK)
    report = json.loads((run / "report.json").read_text(encoding="utf-8"))
    provenance = {"input_path": "pdf", "conversion": {"elapsed_seconds": 3.5, "cost": {"status": "unavailable", "usd": None}}}
    report["fixtures"][0]["input_provenance"] = provenance
    report["fixtures"][0]["usage"] = {"extraction": {"seconds": 1, "requests": 2, "cost_usd": 0, "cost_complete": False, "unpriced_requests": 2}}
    (run / "report.json").write_text(json.dumps(report), encoding="utf-8")
    publish.publish_run(run, tmp_path)
    assert read_viewer(run / "viewer.js")["fixtures"][0]["input_provenance"] == provenance
    summary = publish.run_summary(run)["fixtures"]["harbor-point-heat-resilience"]
    assert summary["input_provenance"] == provenance
    assert summary["usage"]["extraction"]["cost_complete"] is False
    assert summary["usage"]["extraction"]["unpriced_requests"] == 2


def test_stage_status_mirrors_stage_report_passed():
    assert publish.stage_status(None) == "notrun"
    assert publish.stage_status(STAGE_OK) == "pass"
    assert publish.stage_status({**STAGE_OK, "semantic_failures": ["x"]}) == "fail"
    assert publish.stage_status({**STAGE_OK, "evaluation_errors": ["x"]}) == "error"
    assert publish.stage_status({**STAGE_OK, "judgment": None}) == "error"


def test_publish_builds_viewer_index_and_missing_snapshots(tmp_path):
    older = make_run(tmp_path, "older", "2026-10-01T10:00:00+00:00", extraction=STAGE_OK)
    newer = make_run(
        tmp_path, "newer", "2026-10-02T10:00:00+00:00",
        extraction={**STAGE_OK, "semantic_failures": ["coverage below gate"]},
    )
    index = publish.publish_viewer(tmp_path)

    assert index == tmp_path / "index.html" and index.exists()
    assert (tmp_path / "app.js").exists()
    html = index.read_text(encoding="utf-8")
    # Versioned script URLs, so a republished viewer is never served stale from cache.
    assert re.search(r'src="app\.js\?v=[0-9a-f]{12}"', html)
    assert re.search(r'src="runs/index\.js\?v=[0-9a-f]{12}"', html)
    assert not (tmp_path / "pdf").exists()  # PDFs belong to immutable per-run snapshots.
    entries = json.loads(
        (tmp_path / "runs" / "index.js").read_text(encoding="utf-8").split(" = ", 1)[1].rstrip(";\n")
    )
    assert [e["id"] for e in entries] == ["newer", "older"]  # newest first
    stage = entries[0]["fixtures"]["harbor-point-heat-resilience"]["stages"]["extraction"]
    assert stage["status"] == "fail"
    assert stage["metrics"] == {"required_fact_coverage": 0.8}  # headline metrics only
    assert entries[0]["code_version"] == "abc1234" and entries[0]["label"] == "label newer"

    payload = read_viewer(older / "viewer.js")
    assert payload["run"]["id"] == "older"
    assert payload["run"]["snapshot"] == "rebuilt_with_current_fixtures"
    assert [f["golden"]["fixture_id"] for f in payload["fixtures"]] == ["harbor-point-heat-resilience"]
    fixture = payload["fixtures"][0]
    assert fixture["stages"]["extraction"]["judgment"] == {"facts": []}
    assert fixture["stages"]["verification"] is None
    assert set(payload["prompts"]) == {"extraction", "chapter_writing", "verification", "editing"}
    assert payload["examples"]["extraction"]
    assert (newer / "viewer.js").read_text(encoding="utf-8").startswith(
        '(window.GOLDEN_RUNS = window.GOLDEN_RUNS || {})["newer"] = '
    )


def test_publish_run_snapshots_at_run_time_and_keeps_old_snapshots(tmp_path):
    first = make_run(tmp_path, "first", "2026-10-01T10:00:00+00:00", extraction=STAGE_OK)
    publish.publish_run(first, tmp_path)
    assert read_viewer(first / "viewer.js")["run"]["snapshot"] == "at_run_time"
    second = make_run(tmp_path, "second", "2026-10-02T10:00:00+00:00", extraction=STAGE_OK)
    before = (first / "viewer.js").read_text(encoding="utf-8")
    publish.publish_run(second, tmp_path)
    # Republishing never rewrites an existing run's snapshot unless asked.
    assert (first / "viewer.js").read_text(encoding="utf-8") == before
    publish.publish_viewer(tmp_path, rebuild=True)
    assert read_viewer(first / "viewer.js")["run"]["snapshot"] == "rebuilt_with_current_fixtures"


def test_run_ids_default_to_utc_time_plus_label_and_reject_unsafe_names(tmp_path):
    args = evaluator.parse_args(["--results-dir", str(tmp_path), "--label", "PR 3295 / rerun"])
    assert re.fullmatch(r"\d{8}-\d{6}-PR-3295-rerun", args.run_id)
    assert args.output_dir == tmp_path / "runs" / args.run_id
    args = evaluator.parse_args(["--results-dir", str(tmp_path), "--run-id", "ci-krakow"])
    assert args.output_dir == tmp_path / "runs" / "ci-krakow"
    with pytest.raises(SystemExit):
        evaluator.parse_args(["--run-id", "../escape"])
    with pytest.raises(SystemExit):
        evaluator.parse_args(["--output-dir", "somewhere"])  # replaced by --results-dir


def test_existing_run_is_never_overwritten(tmp_path, monkeypatch):
    make_run(tmp_path, "taken", "2026-10-01T10:00:00+00:00", extraction=STAGE_OK)

    def must_not_run(args):
        raise AssertionError("evaluation must not start")

    monkeypatch.setattr(evaluator, "evaluate", must_not_run)
    assert evaluator.main(["--results-dir", str(tmp_path), "--run-id", "taken"]) == 2


def test_viewer_assets_reference_the_run_index():
    html = (publish.VIEWER_DIR / "index.html").read_text(encoding="utf-8")
    script = (publish.VIEWER_DIR / "app.js").read_text(encoding="utf-8")
    assert '<script src="runs/index.js"></script>' in html
    assert "runs/${encodeURIComponent(id)}/viewer.js" in script
    assert "comparePage" in script


def test_pdf_snapshot_remains_per_run_when_republishing(tmp_path):
    run = make_run(tmp_path, "pdf-snapshot", "2026-10-01", extraction=STAGE_OK)
    report = json.loads((run / "report.json").read_text(encoding="utf-8"))
    report["fixtures"][0]["fixture_id"] = "richfield-flood-risk"
    (run / "report.json").write_text(json.dumps(report), encoding="utf-8")
    publish.publish_run(run, tmp_path)
    pdf = run / "pdf" / "richfield-flood-risk.pdf"
    original = pdf.read_bytes()
    assert read_viewer(run / "viewer.js")["fixtures"][0]["pdf"] == "runs/pdf-snapshot/pdf/richfield-flood-risk.pdf"
    publish.publish_viewer(tmp_path)
    assert pdf.read_bytes() == original


def test_legacy_pdf_snapshot_uses_only_matching_historical_bytes(tmp_path):
    run = make_run(tmp_path, "legacy", "2026-10-01", extraction=STAGE_OK)
    report = json.loads((run / "report.json").read_text(encoding="utf-8"))
    report["fixtures"][0]["fixture_id"] = "richfield-flood-risk"
    (run / "report.json").write_text(json.dumps(report), encoding="utf-8")
    publish.publish_run(run, tmp_path)
    payload = read_viewer(run / "viewer.js")
    payload["fixtures"][0]["pdf"] = "pdf/richfield-flood-risk.pdf"
    publish.write_run_viewer(run, payload)
    before = (run / "viewer.js").read_bytes()
    publish.publish_viewer(tmp_path)
    assert (tmp_path / "pdf" / "richfield-flood-risk.pdf").read_bytes() == (run / "pdf" / "richfield-flood-risk.pdf").read_bytes()
    assert (run / "viewer.js").read_bytes() == before
    (tmp_path / "pdf" / "richfield-flood-risk.pdf").write_bytes(b"different historical PDF")
    with pytest.raises(ValueError, match="Historical snapshot PDF"):
        publish.publish_viewer(tmp_path)
    assert (tmp_path / "pdf" / "richfield-flood-risk.pdf").read_bytes() == b"different historical PDF"
