"""Results folder, run IDs, and viewer publishing; no model calls."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from app.services.cnb import golden_set_viewer as publish
from service.scripts import evaluate_cnb_golden_set as evaluator

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
        "judge_prompt_versions": {"extraction": "f" * 64},
        "models": {"judge": {"name": "judge-model", "reasoning_effort": "high"}},
        "fixtures": [
            {
                "fixture_id": "harbor-point-heat-resilience",
                "source_sha256": "0" * 64,
                "source_format": "markdown",
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
    assert (tmp_path / "pdf" / "richfield-flood-risk.pdf").exists()
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
