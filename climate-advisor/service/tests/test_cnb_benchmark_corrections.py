"""Offline regression checks for the CNB answer key and comparison policy."""

import json
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
from benchmark.cnb.scripts.compare import main as compare_main
from benchmark.cnb.scripts.mlflow_log import RUN_DESCRIPTION, golden_rows, review_tags

ROOT = Path(__file__).resolve().parents[2] / "benchmark/cnb"


def test_mlflow_description_distinguishes_quality_failures_from_unavailable_scores():
    score = {"judgment": {"facts": []}, "metrics": {"fact_evidence_retained": 1.0}}
    fixtures = [
        {"fixture_id": "harbor-point-heat-resilience", "extraction": score},
        {"fixture_id": "krakow-flood-drainage-plan", "extraction": {
            **score, "semantic_failures": ["A fact reached the wrong chapter"],
        }},
        {"fixture_id": "richfield-flood-risk", "extraction": {
            **score, "evaluation_errors": ["Judgment unavailable"],
        }},
    ]
    note, tags = review_tags({"fixtures": fixtures, "expected_fixture_ids": ["absent"]}, ["extraction"])
    assert "Harbor Point (Passed)" in note
    assert "Kraków (Issues found)" in note
    assert "Richfield (Unavailable)" in note
    assert "Absent (Unavailable)" in note
    assert note.count("100.0% required facts retained") == 2
    assert "\n- **Extraction (Unavailable)**" in tags["richfield-flood-risk"][RUN_DESCRIPTION]
    assert tags["krakow-flood-drainage-plan"]["fixture_result"] == "Issues found"
    assert tags["harbor-point-heat-resilience"]["approval_state"] == "unapproved"


def test_mlflow_rows_cover_golden_items_only_with_run_stable_inputs():
    item = {"verdict": "partially_covered", "reason": "Year missing",
            "output_refs": [{"unit_id": "u", "quote": "2035"}]}
    fixture = {"fixture_id": "krakow-flood-drainage-plan",
               "extraction": {"judgment": {"facts": [{**item, "id": "horizon"}],
                                           "claims": [{**item, "id": "output-dependent"}]}},
               "chapter_writing": {"judgment": {"chapters": [{**item, "chapter_ref": "budget"}]}},
               "verification": {"judgment": {"defects": [{"id": "d", "verdict": "detected",
                                                          "finding_refs": []}]}},
               "editing": {"judgment": {"cases": [{"case_id": "fill", "changes": [item],
                   "expected_changes": [{**item, "id": "c", "verdict": "applied"}],
                   "preserved": [{**item, "id": "p", "verdict": "altered"}]}]}}}
    rows = golden_rows({"fixtures": [fixture]})
    assert [row["inputs"]["check"] for row in rows] == [
        "Kraków · extraction · fact · horizon",
        "Kraków · chapter writing · chapter · budget",
        "Kraków · verification · defect · d",
        "Kraków · editing · fill change · c",
        "Kraków · editing · fill preserved · p",
    ]
    assert rows[0]["outputs"] == {"verdict": "partially_covered", "reason": "Year missing",
                                  "evidence": ["2035"]}


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


def test_selection_and_programme_evidence_require_context():
    fixtures = {f.fixture.fixture_id: f for f in load_golden_fixtures(ROOT / "fixtures")}
    for fid, fact_id, chapter, omitted in [
        ("richfield-flood-risk", "selected-sites", "project_activities", "For these reasons"),
        ("krakow-flood-drainage-plan", "small-retention-programme", "zadania", "JP –"),
        ("krakow-flood-drainage-plan", "small-retention-programme", "zadania", "Nakłady finansowe"),
    ]:
        loaded = fixtures[fid]
        fact = next(f for f in loaded.fixture.extraction.facts if f.id == fact_id)
        units = [TextUnit(id=f"retained/{chapter}/{i}/page-{e.locators[0].page}",
                          kind="output", chapter_ref=chapter, text=e.text)
                 for i, e in enumerate(fact.evidence)]
        for retained, expected in [(units, "in_chapter"),
                                   ([u for u in units if omitted not in u.text], "not_extracted")]:
            stage = StageReport()
            score_evidence_retention(loaded, retained, stage)
            rows = {row["id"]: row["status"] for row in stage.details["evidence_retention"]}
            assert rows[f"{fact_id}::{chapter}"] == expected


def test_comparison_tracks_conflicts_without_judge_wording_or_excerpt_order():
    base = report("base", "in_chapter")
    candidate = report("candidate", "in_chapter")
    judgment = candidate["fixtures"][0]["extraction"]["judgment"]
    refs = [{"unit_id": "retained/finance/0/page-2", "quote": "A"},
            {"unit_id": "retained/finance/1/page-3", "quote": "B"}]
    judgment["contradictions"] = [{"reason": "Conflict", "output_refs": refs}]
    assert compare_reports(candidate, base)["outcome"] == "regressed"
    previous = deepcopy(candidate)
    refs.reverse()
    refs[0]["unit_id"] = "retained/finance/0/page-3"
    judgment["contradictions"][0]["reason"] = "Different explanation"
    assert compare_reports(candidate, previous)["outcome"] == "unchanged"


def test_claim_support_change_compares_regions_even_with_same_rate():
    base = report("base", "in_chapter")
    claims = [{"output": {"unit_id": f"chapter/{name}"}, "verdict": verdict,
               "self_contained": True, "supplied_verdict": "supported"}
              for name, verdict in [("scope", "supported"), ("budget", "unsupported")]]
    base["fixtures"][0]["extraction"]["judgment"]["claims"] = claims
    candidate = deepcopy(base)
    shifted = candidate["fixtures"][0]["extraction"]["judgment"]["claims"]
    shifted[0]["verdict"], shifted[1]["verdict"] = "unsupported", "supported"
    assert compare_reports(candidate, base)["outcome"] == "mixed"


@pytest.mark.parametrize(("completed", "errors", "exit_code"), [
    (False, [], 3), (True, ["interrupted"], 3), (True, [], 0),
])
def test_compare_cli_validates_execution_independently_of_approval(tmp_path, completed, errors, exit_code):
    for run_id in ("base", "candidate"):
        folder = tmp_path / run_id
        folder.mkdir()
        data = report(run_id, "in_chapter")
        data["fixtures"][0]["approval_status"] = "pending"
        if run_id == "base":
            data.update(completed=completed, run_errors=errors)
        (folder / "report.json").write_text(json.dumps(data), encoding="utf8")
        (folder / "viewer.js").write_text("window.GOLDEN_RUN = {};", encoding="utf8")
    out = tmp_path / "comparison"
    assert compare_main(["--baseline-run", str(tmp_path / "base"),
                         "--candidate-run", str(tmp_path / "candidate"), "--output", str(out)]) == exit_code
    result = json.loads((out / "comparison.json").read_text(encoding="utf8"))
    assert result["evaluation_unavailable"] == (exit_code == 3)
    assert result["outcome"] == ("unavailable" if exit_code == 3 else "unchanged")
