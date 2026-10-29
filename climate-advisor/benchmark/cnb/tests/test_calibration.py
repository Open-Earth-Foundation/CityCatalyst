"""Judge calibration semantics with fake judgments, without provider calls."""

from datetime import date
import json
from pathlib import Path

import pytest
from app.config import get_settings

from benchmark.cnb.golden_set import calibration
from benchmark.cnb.golden_set.calibration import CalibrationApproval, CalibrationCase
from benchmark.cnb.golden_set.models import JudgeEvaluation
from benchmark.cnb.tests.helpers import load_all


@pytest.fixture
def fixtures():
    return load_all()


def case(**updates):
    values = dict(
        id="private-human-incorrect",
        fixture_id="harbor-point-heat-resilience",
        fact_id="programme-financing",
        chapter_ref="financing",
        candidate="The programme costs USD 26.5 million; USD 18.6 million has been secured.",
        human_verdict="incorrect",
        rationale="PRIVATE RATIONALE",
        serious_error=True,
        tags=["funding-status"],
    )
    return CalibrationCase(**(values | updates))


def judgment(payload, verdict="covered"):
    refs = (
        [{"unit_id": "retained/candidate", "quote": payload.outputs[0].text}]
        if payload.outputs
        else []
    )
    return JudgeEvaluation.model_validate(
        dict(
            facts=[
                dict(
                    id="requirement",
                    verdict=verdict,
                    output_refs=refs,
                    reason="judgment",
                )
            ],
            topics=[],
            claims=[],
            chapters=[],
            contradictions=[],
        )
    )


def test_human_labels_rationale_and_identifiers_are_blinded(fixtures):
    item = case()
    payload = calibration.calibration_input(item, fixtures[item.fixture_id])
    serialized = payload.model_dump_json()
    for private in (
        item.id,
        item.rationale,
        "human_verdict",
        "serious_error",
        "approval",
        "held_out",
    ):
        assert private not in serialized
    assert "has been secured" in serialized  # False candidates must reach the judge.
    assert payload.outputs[0].chapter_ref == "financing"


@pytest.mark.parametrize("judge_verdict,human", list(calibration.VERDICT_MAP.items()))
def test_four_class_mapping(fixtures, judge_verdict, human):
    payload = calibration.calibration_input(
        case(), fixtures["harbor-point-heat-resilience"]
    )
    assert calibration.verdict_from_judgment(judgment(payload, judge_verdict)) == human


def test_empty_calibration_corpus_cannot_pass(fixtures, tmp_path):
    path = tmp_path / "empty.json"
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="at least one"):
        calibration.load_calibration_cases(path, fixtures, "prompt")


def test_agreement_does_not_hide_serious_false_pass():
    rows = [
        dict(
            id=str(i),
            status="evaluated",
            human_verdict=human,
            judge_verdict=judge,
            serious_error=human == "incorrect",
            split="held_out",
            tags=["funding"],
            language="en",
        )
        for i, (human, judge) in enumerate(
            [
                ("correct", "correct"),
                ("partly_correct", "partly_correct"),
                ("incorrect", "correct"),
                ("missing", "missing"),
            ]
        )
    ]
    report = calibration.agreement_report(rows)
    assert report["agreement"] == 0.75
    assert report["serious_false_passes"] == ["2"]
    assert report["confusion_matrix"]["incorrect"]["correct"] == 1


async def test_only_approved_cases_call_judge_and_checkpoint(
    fixtures, monkeypatch, tmp_path
):
    item = case()
    loaded = fixtures[item.fixture_id]
    approved = item.model_copy(
        update={
            "approval": CalibrationApproval(
                reviewer="Test reviewer",
                reviewed_at=date(2026, 1, 1),
                case_sha256=calibration.case_fingerprint(item, loaded),
            )
        }
    )
    calls = []

    async def fake(payload, settings):
        calls.append(payload)
        return judgment(payload)

    monkeypatch.setattr(calibration, "judge_output", fake)
    pending = item.model_copy(update={"id": "pending"})
    report = await calibration.evaluate_calibration(
        [approved, pending], fixtures, get_settings(), tmp_path
    )
    assert len(calls) == 1
    assert report["pending"] == 1
    assert report["serious_false_passes"] == [item.id]
    assert json.loads((tmp_path / "calibration.json").read_text())["evaluated"] == 1


async def test_changed_candidate_invalidates_human_approval(
    fixtures, monkeypatch, tmp_path
):
    item = case()
    item.approval = CalibrationApproval(
        reviewer="Test reviewer",
        reviewed_at=date(2026, 1, 1),
        case_sha256=calibration.case_fingerprint(item, fixtures[item.fixture_id]),
    )
    item.candidate = "Different candidate"

    async def forbidden(*args):
        pytest.fail("Stale approvals must not trigger provider calls")

    monkeypatch.setattr(calibration, "judge_output", forbidden)
    report = await calibration.evaluate_calibration(
        [item], fixtures, get_settings(), tmp_path
    )
    assert report["pending"] == 1 and report["agreement"] is None


def test_missing_and_wrong_chapter_candidates_remain_isolated(fixtures):
    loaded = fixtures["harbor-point-heat-resilience"]
    empty = calibration.calibration_input(
        case(candidate="", human_verdict="missing", serious_error=False), loaded
    )
    assert empty.outputs == []
    wrong = calibration.calibration_input(
        case(candidate_chapter_ref="project_summary"), loaded
    )
    assert calibration.validate_judgment(wrong, judgment(wrong))


def test_held_out_cases_reject_prompt_leakage_and_split_families(fixtures, tmp_path):
    item = case()
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([item.model_dump(mode="json")]), encoding="utf-8")
    with pytest.raises(ValueError, match="overlaps"):
        calibration.load_calibration_cases(path, fixtures, item.candidate)
    second = item.model_copy(update={"id": "development", "split": "development"})
    path.write_text(
        json.dumps([item.model_dump(mode="json"), second.model_dump(mode="json")]),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="both splits"):
        calibration.load_calibration_cases(path, fixtures, "No worked examples")


def test_shipped_cases_are_pending_diverse_and_outside_prompt_examples(fixtures):
    prompt = get_settings().llm.prompts.get_prompt("cnb_golden_set_extraction_judge")
    path = Path(__file__).resolve().parents[1] / "calibration/cases.json"
    cases = calibration.load_calibration_cases(path, fixtures, prompt)
    assert len(cases) >= 24 and all(item.approval is None for item in cases)
    assert {item.human_verdict for item in cases} == set(calibration.VERDICTS)
    assert {"tables", "units", "currency", "dates", "responsibilities"} <= {
        tag for item in cases for tag in item.tags
    }


async def test_unavailable_judge_does_not_reduce_agreement_denominator(
    fixtures, monkeypatch, tmp_path
):
    item = case()
    item.approval = CalibrationApproval(
        reviewer="Test reviewer",
        reviewed_at=date(2026, 1, 1),
        case_sha256=calibration.case_fingerprint(item, fixtures[item.fixture_id]),
    )

    async def unavailable(*args):
        raise calibration.GoldenJudgeError("timeout")

    monkeypatch.setattr(calibration, "judge_output", unavailable)
    report = await calibration.evaluate_calibration(
        [item], fixtures, get_settings(), tmp_path
    )
    assert report["unavailable"] == 1 and report["evaluated"] == 0
    assert report["agreement"] is None
