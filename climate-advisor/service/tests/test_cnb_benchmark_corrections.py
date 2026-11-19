"""Offline regression checks for the CNB answer key and comparison policy."""

from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

from benchmark.cnb.golden_set.baseline import compare_reports, repeat_problems
from benchmark.cnb.golden_set.calibration import load_calibration_cases
from benchmark.cnb.golden_set.chapters import transfer_records
from benchmark.cnb.golden_set.core import (
    fixture_problems, load_golden_fixtures, score_evidence_retention,
)
from benchmark.cnb.golden_set.judge import judge_example_problems
from benchmark.cnb.golden_set.models import StageReport, TextUnit
from benchmark.cnb.golden_set.verification import seed_defects

ROOT = Path(__file__).resolve().parents[2] / "benchmark/cnb"


def test_current_answer_key_is_executable_offline():
    fixtures = load_golden_fixtures(ROOT / "fixtures")
    prompts = {p.stem: p.read_text(encoding="utf8") for p in (ROOT / "prompts").glob("*.md")}
    assert not judge_example_problems(fixtures, prompts)
    for loaded in fixtures:
        assert not fixture_problems(loaded)
        _, errors = seed_defects(loaded.reference_draft.chapters, loaded.fixture.verification.defects)
        assert not errors
    cases = load_calibration_cases(ROOT / "calibration/cases.json",
                                   {f.fixture.fixture_id: f for f in fixtures}, prompts["extraction"])
    assert all(c.candidate for c in cases if c.human_verdict == "missing")


def test_richfield_evidence_credits_complete_alternatives_at_their_source_locations():
    loaded, = load_golden_fixtures(ROOT / "fixtures", ["richfield-flood-risk"])
    facts = {f.id: f for f in loaded.fixture.extraction.facts}
    chapter = "project_financing"
    passages = facts["cost-basis"].alternative_evidence[0]

    def score(locations):
        units = [TextUnit(id=f"retained/{chapter}/{i}/page-{page}", kind="output",
                          chapter_ref=chapter, text=text) for i, (page, text) in enumerate(locations)]
        report = StageReport()
        score_evidence_retention(loaded, units, report)
        return {r["id"]: r["status"] for r in report.details["evidence_retention"]}

    evidence = [(e.locators[0].page, e.text) for e in passages]
    assert score(evidence)["cost-basis::project_financing"] == "in_chapter"
    assert score([(1, t) for _, t in evidence])["cost-basis::project_financing"] == "not_extracted"
    assert score([(33, "$17,333,000"), (43, "$1,540,000")])[
        "concept-cost-figures::project_financing"] == "not_extracted"


def test_transfer_preserves_a_missed_mandatory_route():
    loaded, = load_golden_fixtures(ROOT / "fixtures", ["harbor-point-heat-resilience"])
    fact = "population"
    extraction = SimpleNamespace(facts=[
        SimpleNamespace(id=f"{fact}::climate_context", verdict="missing"),
        SimpleNamespace(id=f"{fact}::project_summary", verdict="covered"),
    ])
    draft = SimpleNamespace(facts=[SimpleNamespace(id=fact, verdict="covered")])
    rows = transfer_records(loaded, draft, extraction)
    row = next(r for r in rows if r["extraction_pair"] == "population::climate_context")
    assert (row["priority"], row["outcome"]) == ("mandatory", "recovered")
    assert row["draft_scope"] == "aggregate_allowed_chapters"


def report(run_id, status, failures=()):
    stage = {
        "judgment": {"facts": [{"id": "a", "verdict": "covered"}]},
        "integrity_failures": list(failures),
        "details": {"evidence_retention": [{"id": "a", "status": status}]},
        "metrics": {"pairs_misrouted": int(status == "misrouted"),
                    "pairs_not_extracted": int(status == "not_extracted")},
    }
    return {
        "run_id": run_id, "completed": True, "expected_fixture_ids": ["city"],
        "requested_stages": ["extraction"], "corpus_fingerprint": "corpus",
        "evaluator_fingerprint": "judge", "code_version": "commit", "analysis_contract_version": "v1",
        "models": {"reader": "model"}, "llm_config_sha256": "config", "dependency_lock_sha256": "lock",
        "producer_prompt_versions": {"reader": "prompt"},
        "fixtures": [{"fixture_id": "city", "approval_status": "approved", "extraction": stage}],
    }


@pytest.mark.parametrize(("before", "after", "failures", "outcome"), [
    ("not_extracted", "misrouted", [], "improved"),
    ("misrouted", "not_extracted", [], "regressed"),
    ("in_chapter", "in_chapter", ["invalid locator"], "regressed"),
])
def test_comparison_tracks_routing_and_integrity(before, after, failures, outcome):
    assert compare_reports(report("new", after, failures), report("base", before))["outcome"] == outcome


def test_missing_baseline_scope_and_changed_producer_repeats():
    base = report("base", "in_chapter")
    repeat = report("repeat", "misrouted")
    assert not repeat_problems(base, repeat)
    candidate = report("new", "not_extracted")
    assert compare_reports(candidate, base, [repeat])["outcome"] == "regressed"
    repeat["models"] = {"reader": "changed"}
    assert repeat_problems(base, repeat)
    candidate["requested_stages"].append("verification")
    candidate["fixtures"][0]["verification"] = deepcopy(candidate["fixtures"][0]["extraction"])
    assert compare_reports(candidate, base)["outcome"] == "unavailable"
