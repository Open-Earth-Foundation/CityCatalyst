"""Blind, chapter-specific calibration of the configured extraction judge."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Literal

from app.config import Settings
from pydantic import Field

from benchmark.cnb.golden_set.core import (
    LoadedFixture,
    ground_truth_fingerprints,
    source_evidence,
    validate_judgment,
)
from benchmark.cnb.golden_set.judge import (
    GoldenJudgeError,
    judge_output,
    judge_prompt_versions,
)
from benchmark.cnb.golden_set.models import (
    ExpectedFact,
    GoldenContract,
    JudgeEvaluation,
    JudgeInput,
    TextUnit,
)

Verdict = Literal["correct", "partly_correct", "incorrect", "missing"]
VERDICTS = ("correct", "partly_correct", "incorrect", "missing")
VERDICT_MAP = {
    "covered": "correct",
    "partially_covered": "partly_correct",
    "contradicted": "incorrect",
    "missing": "missing",
}


class CalibrationApproval(GoldenContract):
    """A human sign-off bound to the complete case and reference versions."""

    reviewer: str = Field(min_length=1)
    reviewed_at: date
    case_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class CalibrationCase(GoldenContract):
    """A candidate with private human labels, never serialized into judge input."""

    id: str = Field(min_length=1)
    fixture_id: str
    fact_id: str
    chapter_ref: str
    candidate: str
    candidate_chapter_ref: str | None = None
    human_verdict: Verdict
    rationale: str = Field(min_length=1)
    serious_error: bool = False
    split: Literal["development", "held_out"] = "held_out"
    tags: list[str] = Field(default_factory=list)
    approval: CalibrationApproval | None = None


def case_fingerprint(case: CalibrationCase, loaded: LoadedFixture) -> str:
    """Bind approval to labels, candidate, chapter and reference versions."""
    value = {
        "case": case.model_dump(mode="json", exclude={"approval"}),
        "reference": ground_truth_fingerprints(loaded),
    }
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def calibration_input(case: CalibrationCase, loaded: LoadedFixture) -> JudgeInput:
    """Whitelist source, one requirement and candidate; withhold every human label.

    Candidates deliberately bypass exact-quotation filtering: detecting a false
    statement is the measurement, while production validation stays unchanged.
    """
    fact = next(
        (item for item in loaded.fixture.extraction.facts if item.id == case.fact_id),
        None,
    )
    if fact is None:
        raise ValueError(f"Unknown fact in calibration case {case.id}")
    requirement = next(
        (item for item in fact.requirements if item.chapter_ref == case.chapter_ref),
        None,
    )
    if requirement is None:
        raise ValueError(f"Unknown receiving chapter in calibration case {case.id}")
    return JudgeInput(
        stage="extraction",
        expected_facts=[
            ExpectedFact(
                id="requirement",
                statement=fact.statement,
                required=requirement.priority == "mandatory",
                chapters=[case.chapter_ref],
                fact_id="fact",
                chapter_ref=case.chapter_ref,
            )
        ],
        expected_topics=[],
        chapter_requirements=[],
        outputs=[
            TextUnit(
                id="retained/candidate",
                text=case.candidate,
                kind="output",
                chapter_ref=case.candidate_chapter_ref or case.chapter_ref,
            )
        ]
        if case.candidate
        else [],
        evidence=source_evidence(loaded),
    )


def load_calibration_cases(
    path: Path, fixtures: dict[str, LoadedFixture], prompt: str
) -> list[CalibrationCase]:
    """Validate case references, family splits and held-out prompt contamination."""
    cases = [
        CalibrationCase.model_validate(item)
        for item in json.loads(path.read_text(encoding="utf-8"))
    ]
    if not cases:
        raise ValueError("Calibration requires at least one labelled candidate")
    ids: set[str] = set()
    families: dict[tuple[str, str], str] = {}
    normalized_prompt = " ".join(prompt.casefold().split())
    for case in cases:
        if case.id in ids:
            raise ValueError(f"Duplicate calibration case: {case.id}")
        ids.add(case.id)
        loaded = fixtures.get(case.fixture_id)
        if loaded is None:
            raise ValueError(f"Unknown calibration fixture: {case.fixture_id}")
        calibration_input(case, loaded)
        family = (case.fixture_id, case.fact_id)
        if families.setdefault(family, case.split) != case.split:
            raise ValueError(f"Calibration family appears in both splits: {family}")
        if case.split == "held_out":
            fact = next(
                f for f in loaded.fixture.extraction.facts if f.id == case.fact_id
            )
            passages = [
                fact.statement,
                *(e.text for e in fact.evidence),
                case.candidate,
            ]
            if any(
                text.strip() and " ".join(text.casefold().split()) in normalized_prompt
                for text in passages
            ):
                raise ValueError(f"Held-out case overlaps the judge prompt: {case.id}")
        if case.serious_error and case.human_verdict != "incorrect":
            raise ValueError(
                f"Serious error requires an incorrect human verdict: {case.id}"
            )
    return cases


def verdict_from_judgment(judgment: JudgeEvaluation) -> str:
    """Keep claim support separate from fact coverage; both affect correctness."""
    verdict = VERDICT_MAP[judgment.facts[0].verdict]
    if judgment.contradictions or any(
        item.verdict in {"unsupported", "contradicted"} for item in judgment.claims
    ):
        return "incorrect"
    if verdict == "correct" and any(
        item.verdict in {"partially_supported", "uncertain"} or not item.self_contained
        for item in judgment.claims
    ):
        return "partly_correct"
    return verdict


def agreement_report(rows: list[dict]) -> dict:
    """Report denominators and serious false passes separately, including subgroups."""
    comparable = [row for row in rows if row["status"] == "evaluated"]
    confusion = {human: {judge: 0 for judge in VERDICTS} for human in VERDICTS}
    serious = []
    groups: dict[str, dict[str, int]] = {}
    for row in comparable:
        confusion[row["human_verdict"]][row["judge_verdict"]] += 1
        if row["serious_error"] and row["judge_verdict"] == "correct":
            serious.append(row["id"])
        for group in [row["split"], *row["tags"], row["language"]]:
            counts = groups.setdefault(group, {"evaluated": 0, "agree": 0})
            counts["evaluated"] += 1
            counts["agree"] += int(row["human_verdict"] == row["judge_verdict"])
    agree = sum(row["human_verdict"] == row["judge_verdict"] for row in comparable)
    return {
        "cases": rows,
        "evaluated": len(comparable),
        "agree": agree,
        "agreement": agree / len(comparable) if comparable else None,
        "confusion_matrix": confusion,
        "serious_false_passes": serious,
        "groups": groups,
        "pending": sum(r["status"] == "pending_approval" for r in rows),
        "unavailable": sum(r["status"] == "unavailable" for r in rows),
    }


async def evaluate_calibration(
    cases: list[CalibrationCase],
    fixtures: dict[str, LoadedFixture],
    settings: Settings,
    output: Path,
) -> dict:
    """Judge approved cases serially and checkpoint private labels only in reports."""
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    report = agreement_report(rows)
    for case in cases:
        loaded = fixtures[case.fixture_id]
        fingerprint = case_fingerprint(case, loaded)
        approval = case.approval
        row = {
            "id": case.id,
            "human_verdict": case.human_verdict,
            "rationale": case.rationale,
            "serious_error": case.serious_error,
            "split": case.split,
            "tags": case.tags,
            "language": loaded.fixture.source.language,
            "case_sha256": fingerprint,
            "status": "pending_approval",
            "judge_verdict": None,
        }
        if (
            approval
            and approval.case_sha256 == fingerprint
            and approval.reviewer.strip()
            and approval.reviewed_at <= date.today()
        ):
            try:
                payload = calibration_input(case, loaded)
                judgment = JudgeEvaluation.model_validate(
                    await judge_output(payload, settings)
                )
                errors = validate_judgment(payload, judgment)
                if errors:
                    raise GoldenJudgeError("invalid_judgment: " + "; ".join(errors))
                row.update(
                    status="evaluated",
                    judge_verdict=verdict_from_judgment(judgment),
                    judgment=judgment.model_dump(mode="json"),
                )
            except (GoldenJudgeError, ValueError) as exc:
                row.update(status="unavailable", error=type(exc).__name__)
        rows.append(row)
        report = {
            **agreement_report(rows),
            "judge_prompt_versions": judge_prompt_versions(settings, ["extraction"]),
            "judge_model": settings.llm.models.cnb_golden_set_judge.model_dump(
                mode="json"
            )
            if settings.llm.models.cnb_golden_set_judge
            else None,
        }
        (output / "calibration.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return report
