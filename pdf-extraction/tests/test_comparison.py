"""Offline benchmark comparison: preserve failures, unknowns and scorer semantics."""

import json
import shutil
from pathlib import Path

import pytest

from examples.compare_benchmarks import (
    ROOT,
    collect_attempts,
    render_report,
    run_bridge,
    verify_sources,
)


def write_json(path: Path, value) -> None:
    """Write an isolated runner artifact for a test."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def test_revalidation_preserves_original_failure_and_deduplicates_jobs(tmp_path):
    """Revalidating one job must never count as another successful attempt."""
    write_json(
        tmp_path / "cases.json", [{"id": "public-test", "related_case": "C-010"}]
    )
    write_json(
        tmp_path / "references/real-cases.json",
        [{"id": "C-010", "city": "Test", "year": 2020, "totalOnly": False}],
    )
    run = tmp_path / "run"
    write_json(run / "run.json", {"cases": ["public-test"]})
    write_json(
        run / "public-test/result.json",
        {"job_id": "one-job", "result": None, "repair": {"repairs": 1}},
    )
    write_json(
        run / "public-test/revalidated-result.json",
        {"job_id": "one-job", "result": {"data": {"rows": []}}},
    )
    attempts, fixtures = collect_attempts(tmp_path, [run, run])
    assert not fixtures
    assert len(attempts) == 1
    assert attempts[0]["revalidated"] is True
    assert attempts[0]["originalPipelineAccepted"] is False
    assert attempts[0]["repair"]["repairs"] == 1


def test_modified_upstream_scorer_is_rejected(tmp_path):
    """Changing cached scoring logic must invalidate the pinned comparison."""
    source = tmp_path / ".local/upstream/app/src/backend/ingestion-benchmark/score.ts"
    source.parent.mkdir(parents=True)
    source.write_text("modified", encoding="utf-8")
    with pytest.raises(ValueError, match="checksum mismatch"):
        verify_sources(
            tmp_path,
            {"scorer_files": {"score.ts": "different"}, "notation_sha": "unused"},
        )


@pytest.fixture
def cached_scorer():
    """Use the pinned real scorer if its private local snapshot is prepared."""
    manifest = ROOT / ".local/comparison-source.json"
    tsx = ROOT.parents[1] / "app/node_modules/tsx/dist/cli.mjs"
    if not manifest.exists() or not tsx.exists() or not shutil.which("node"):
        pytest.skip(
            "Offline comparison needs the prepared local scorer and app tsx dependency"
        )
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    verify_sources(ROOT, metadata)
    return metadata


def test_adapter_keeps_unknowns_removals_and_scope_abstentions(tmp_path, cached_scorer):
    """Correct printed totals cannot hide extra rows or unresolved scope mappings."""
    key = {
        "id": "test",
        "expectedTotal": 100,
        "tolerance": 0,
        "totalTolerance": 0,
        "rows": [
            {
                "gpc": "I.1.1",
                "scope": "1",
                "value": 100,
                "scored": True,
                "notation": "",
                "rowType": "Value",
            }
        ],
    }
    candidates = [
        ("exact", [{"gpc_ref": "I.1.1", "scope": 1, "emissions_tco2e": 100}]),
        ("scope-unknown", [{"gpc_ref": "I.1", "scope": None, "emissions_tco2e": 100}]),
        (
            "unmapped-extra",
            [
                {"gpc_ref": "I.1.1", "scope": 1, "emissions_tco2e": 100},
                {"gpc_ref": None, "scope": None, "emissions_tco2e": 50},
            ],
        ),
        (
            "removal",
            [
                {"gpc_ref": "I.1.1", "scope": 1, "emissions_tco2e": 100},
                {"gpc_ref": "V.2", "scope": 1, "emissions_tco2e": -10},
            ],
        ),
    ]
    demo = [
        {
            "caseId": name,
            "canonicalId": "test",
            "envelope": {
                "result": {"data": {"reported_total_tco2e": 100, "rows": rows}}
            },
        }
        for name, rows in candidates
    ]
    demo.append(
        {"caseId": "failed", "canonicalId": "test", "envelope": {"result": None}}
    )
    payload = {"demo": demo, "keys": {"test": key}, "baseline": {"results": []}}
    result = run_bridge(payload, tmp_path)
    scored = {item["caseId"]: item for item in result["comparisons"]}
    assert scored["exact"]["score"]["rowRecall"] == 1
    assert scored["scope-unknown"]["score"]["valueAccuracy"] is None
    assert scored["scope-unknown"]["score"]["classificationAccuracy"] == 0
    assert scored["scope-unknown"]["score"]["rowRecall"] == 0
    assert scored["unmapped-extra"]["score"]["rowPrecision"] == 0.5
    assert scored["unmapped-extra"]["score"]["storedTotal"] == 150
    assert scored["unmapped-extra"]["adapted"]["stored"][1]["gpc"].startswith(
        "UNMAPPED-"
    )
    assert scored["removal"]["score"]["storedTotal"] == 90
    assert scored["removal"]["score"]["totalMatched"] is False
    assert scored["removal"]["reportedTotalMatched"] is True
    assert scored["failed"]["score"] is None


def test_recorded_baseline_replays_without_metric_drift(tmp_path, cached_scorer):
    """Current keys/scorer must reproduce the reference scores for compared cities."""
    attempts, fixtures = collect_attempts(
        ROOT,
        [ROOT / "runs/initial-chart-and-toronto", ROOT / "runs/initial-kyoto-mistral"],
    )
    baseline = json.loads(
        (ROOT / ".local/recorded-benchmark.json").read_text(encoding="utf-8")
    )
    keys = json.loads((ROOT / ".local/answer-keys.json").read_text(encoding="utf-8"))[
        "files"
    ]
    result = run_bridge(
        {"demo": attempts, "keys": keys, "baseline": baseline}, tmp_path
    )
    for attempt in result["comparisons"]:
        for run in attempt["baseline"]:
            for metric in [
                "rowRecall",
                "rowPrecision",
                "valueAccuracy",
                "classificationAccuracy",
                "storedTotal",
                "totalWithinTolerance",
            ]:
                assert run["rescored"][metric] == run["recordedScore"][metric]
    toronto, kyoto = result["comparisons"]
    assert toronto["score"]["rowRecall"] == pytest.approx(5 / 6)
    assert toronto["score"]["valueAccuracy"] == 1
    assert kyoto["score"]["rowRecall"] is None
    assert kyoto["score"]["storedTotal"] == 5676000
    report = render_report(result, cached_scorer, baseline, fixtures)
    assert report.index("| Kyoto") < report.index("### public-toronto")
    assert "83.3%" in report
    assert "not an original end-to-end success" in report
    assert "0/1" in report


@pytest.mark.parametrize(
    "key_ref,key_scope,stored_ref,stored_scope,expected_recall",
    [
        ("I.1.x (all scopes)", "", "I.1", None, 1),
        ("III.3.x", "", "III.3", None, 1),
        ("I.1.x", "", "I.1.2", 2, 1),
        ("I.1.1", "1", "I.1", None, 0),
        ("I.1.1", "1", "I.1", 1, 0),
        ("I.1.x", "2", "I.1", None, 0),
        ("I.1.x", "", None, None, 0),
    ],
)
def test_parent_aggregate_matches_only_compatible_key_boundaries(
    tmp_path,
    cached_scorer,
    key_ref,
    key_scope,
    stored_ref,
    stored_scope,
    expected_recall,
):
    """An unsplit subsector must match all-scopes keys without fabricating a scope."""
    key = {
        "id": "aggregate",
        "expectedTotal": 100,
        "tolerance": 0,
        "totalTolerance": 0,
        "distractors": [],
        "rows": [
            {
                "gpc": key_ref,
                "scope": key_scope,
                "value": 100,
                "scored": True,
                "ambiguous": True,
                "notation": "",
                "rowType": "Value",
            }
        ],
    }
    row = {
        "gpc_ref": stored_ref,
        "scope": stored_scope,
        "emissions_tco2e": 100,
        "scope_basis": "combined" if stored_scope is None else "inferred",
    }
    stored = {
        "gpc": stored_ref or "UNMAPPED-0",
        "scope": None if stored_scope is None else str(stored_scope),
        "valueT": 100,
        "omit": False,
        "notation": None,
    }
    result = run_bridge(
        {
            "demo": [
                {
                    "canonicalId": "aggregate",
                    "envelope": {"result": {"data": {"rows": [row]}}},
                }
            ],
            "keys": {"aggregate": key},
            "baseline": {
                "results": [
                    {
                        "id": "aggregate",
                        "runs": [{"run": 1, "ok": True, "stored": [stored]}],
                    }
                ]
            },
        },
        tmp_path,
    )
    attempt = result["comparisons"][0]
    assert attempt["score"]["rowRecall"] == expected_recall
    assert attempt["baseline"][0]["rescored"]["rowRecall"] == expected_recall
    assert attempt["score"]["storedTotal"] == 100
    assert attempt["adapted"]["stored"][0]["scope"] == (
        None if stored_scope is None else str(stored_scope)
    )
    assert attempt["adapted"]["stored"][0]["gpc"] == (stored_ref or "UNMAPPED-0")
