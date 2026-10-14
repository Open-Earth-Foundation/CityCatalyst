"""Verification stage tests: seeded defects, validator plumbing, and scoring."""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock

import pytest
from app.models.cnb.concept_note_chapter_validation import (
    ChapterValidationDecision,
    ChapterValidationFinding,
)
from app.models.cnb.golden_set import (
    DefectJudgment,
    FindingJudgment,
    GapAddition,
    GapRef,
    ReferenceChapter,
    ReferenceGap,
    SeededDefect,
    TextEdit,
    TextReference,
    VerificationEvaluation,
)
from app.services.cnb import golden_set_verification as module
from app.services.cnb.chapter_validation import select_chapter_validation_profile
from app.services.cnb.golden_set_verification import (
    finding_records,
    score_verification,
    seed_defects,
    validate_verification_judgment,
    validation_requests,
    verification_judge_input,
)
from app.services.cnb.golden_set_workspace import (
    build_workspace,
    frozen_selected_source,
    reference_snapshots,
)

from app.config import get_settings

from tests.cnb.golden_set_helpers import load_all

QUESTION = "Confirm the contact person for the application."


@pytest.fixture(scope="module")
def fixtures():
    return load_all()


def reference() -> list[ReferenceChapter]:
    return [
        ReferenceChapter(chapter_ref="a", body_markdown="## A\n\nThe project costs USD 10 million."),
        ReferenceChapter(
            chapter_ref="b",
            body_markdown=f"## B\n\nThe budget is USD 10 million.\n\n[Information needed: {QUESTION}]",
            gaps=[
                ReferenceGap(
                    field_key="contact", question=QUESTION, why_asking="Required.", severity="critical"
                )
            ],
        ),
    ]


def defect(**values) -> SeededDefect:
    return SeededDefect(
        id=values.pop("id", "cost-conflict"),
        kind=values.pop("kind", "cross_chapter_conflict"),
        description="Chapter A now says USD 12 million while B says USD 10 million.",
        expected_chapters=values.pop("expected_chapters", ["a", "b"]),
        expected_categories=values.pop("expected_categories", ["cross_chapter_conflict"]),
        **values,
    )


def test_seeding_applies_exact_edits_and_keeps_marker_parity():
    seeded, problems = seed_defects(
        reference(),
        [
            defect(edits=[TextEdit(chapter_ref="a", find="USD 10 million", replace="USD 12 million")]),
            defect(
                id="gap-flip",
                kind="gap_inconsistency",
                expected_chapters=["b"],
                expected_categories=["internal_conflict", "missing_information"],
                edits=[TextEdit(chapter_ref="b", find=f"\n\n[Information needed: {QUESTION}]", replace="")],
                remove_gaps=[GapRef(chapter_ref="b", field_key="contact")],
            ),
        ],
    )
    assert problems == []
    assert "USD 12 million" in seeded[0].body_markdown
    assert seeded[1].gaps == [] and "Information needed" not in seeded[1].body_markdown
    # The reference itself is never mutated.
    assert reference()[0].body_markdown.endswith("USD 10 million.")


@pytest.mark.parametrize("mutation", ["ambiguous", "absent", "unknown_gap", "parity"])
def test_seeding_rejects_invalid_defects(mutation):
    chapters = reference()
    if mutation == "ambiguous":
        chapters[0].body_markdown += " USD 10 million again."
        defects = [defect(edits=[TextEdit(chapter_ref="a", find="USD 10 million", replace="USD 12 million")])]
    elif mutation == "absent":
        defects = [defect(edits=[TextEdit(chapter_ref="a", find="EUR 5 million", replace="x")])]
    elif mutation == "unknown_gap":
        defects = [defect(remove_gaps=[GapRef(chapter_ref="a", field_key="nope")])]
    else:
        defects = [
            defect(
                add_gaps=[
                    GapAddition(
                        chapter_ref="a",
                        gap=ReferenceGap(field_key="x", question="Orphan?", why_asking="w", severity="noncritical"),
                    )
                ]
            )
        ]
    assert seed_defects(chapters, defects)[1]


def test_fixture_defects_seed_cleanly_and_validator_templates_are_valid(fixtures):
    settings = get_settings()
    for loaded in fixtures.values():
        reference_draft = loaded.reference_draft
        seeded, problems = seed_defects(reference_draft.chapters, loaded.fixture.verification.defects)
        assert problems == [], loaded.fixture.fixture_id
        assert len(loaded.fixture.verification.defects) >= 3
        workspace = build_workspace(
            loaded, settings, frozen_selected_source(loaded, reference_draft.selected_source)
        )
        snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, seeded)
        requests = validation_requests(loaded, workspace, snapshots)
        assert len(requests) == len(seeded)
        for request in requests:
            target = next(c for c in request.chapters if c.chapter_id == request.target_chapter_id)
            # Raises if the template's field ownership would block production validation.
            assert select_chapter_validation_profile(request.template, target) is not None


def finding(chapter_ids, category="cross_chapter_conflict", message="Costs differ between chapters."):
    return ChapterValidationFinding(
        phase="consistency",
        category=category,
        severity="blocking",
        message=message,
        suggested_action="Align the cost.",
        involved_chapter_ids=chapter_ids,
    )


@pytest.fixture
def verification_case(fixtures):
    loaded = fixtures["harbor-point-heat-resilience"]
    reference_draft = loaded.reference_draft
    fixture = loaded.fixture.model_copy(deep=True)
    fixture.verification.defects = fixture.verification.defects[:1]
    loaded = replace(loaded, fixture=fixture)
    seeded, problems = seed_defects(reference_draft.chapters, fixture.verification.defects)
    assert problems == []
    workspace = build_workspace(
        loaded, get_settings(), frozen_selected_source(loaded, reference_draft.selected_source)
    )
    snapshots = reference_snapshots(workspace, fixture.fixture_id, seeded)
    requests = validation_requests(loaded, workspace, snapshots)
    ids = {s.chapter_ref: s.chapter_id for s in snapshots}
    expected = fixture.verification.defects[0]
    decisions = [
        ChapterValidationDecision(
            target_chapter_id=request.target_chapter_id,
            validation_input_fingerprint=request.validation_input_fingerprint,
            status="ready",
            findings=[],
        )
        for request in requests
    ]
    decisions[0] = decisions[0].model_copy(
        update={
            "status": "needs_review",
            "findings": [
                finding(
                    [ids[ref] for ref in expected.expected_chapters],
                    category=expected.expected_categories[0],
                ),
                finding([ids[seeded[0].chapter_ref]], category="logic_error", message="Unrelated claim."),
            ],
        }
    )
    ref_by_id = {s.chapter_id: s.chapter_ref for s in snapshots}
    records = finding_records(requests, decisions, ref_by_id)
    payload = verification_judge_input(loaded, seeded, records)
    judgment = VerificationEvaluation(
        defects=[
            DefectJudgment(
                id=expected.id,
                verdict="detected",
                finding_refs=[TextReference(unit_id="finding/0", quote="Costs differ between chapters.")],
                reason="Mocked verdict",
            )
        ],
        findings=[
            FindingJudgment(unit_id="finding/1", verdict="false_alarm", evidence=[], reason="Mocked verdict")
        ],
    )
    return loaded, payload, judgment, records


def test_open_gap_findings_are_policy_owned_not_model_findings(fixtures):
    loaded = fixtures["richfield-flood-risk"]
    reference_draft = loaded.reference_draft
    workspace = build_workspace(
        loaded, get_settings(), frozen_selected_source(loaded, reference_draft.selected_source)
    )
    snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, reference_draft.chapters)
    requests = validation_requests(loaded, workspace, snapshots)
    with_gaps = next(r for r in requests if r.open_gaps)
    from app.services.cnb.chapter_validation import _deterministic_gap_findings

    fixed = _deterministic_gap_findings(with_gaps)
    decision = ChapterValidationDecision(
        target_chapter_id=with_gaps.target_chapter_id,
        validation_input_fingerprint=with_gaps.validation_input_fingerprint,
        status="incomplete",
        findings=[*fixed, finding([with_gaps.target_chapter_id], category="logic_error")],
    )
    ref_by_id = {s.chapter_id: s.chapter_ref for s in snapshots}
    records = finding_records([with_gaps], [decision], ref_by_id)
    assert [r["origin"] for r in records] == ["open_gap"] * len(fixed) + ["model"]
    payload = verification_judge_input(loaded, reference_draft.chapters, records)
    assert [u.id for u in payload.outputs] == [records[-1]["unit_id"]]


def test_valid_verification_judgment_scores_recall_and_false_alarms(verification_case):
    loaded, payload, judgment, records = verification_case
    report = score_verification(loaded, payload, judgment, records, [])
    assert not report.evaluation_errors
    assert report.metrics["defect_recall"] == 1.0
    assert report.metrics["strict_defect_recall"] == 1.0
    assert report.metrics["false_alarms"] == 1
    assert report.metrics["false_alarm_rate"] == 0.5
    assert any("false_alarm_rate" in f for f in report.semantic_failures)


def test_missed_defect_fails_and_wrong_category_is_not_strict(verification_case):
    loaded, payload, judgment, records = verification_case
    records[0]["category"] = "missing_information"
    report = score_verification(loaded, payload, judgment, records, [])
    assert report.metrics["defect_recall"] == 1.0
    assert report.metrics["strict_defect_recall"] == 0.0
    judgment.defects[0].verdict = "missed"
    judgment.defects[0].finding_refs = []
    judgment.findings.append(
        FindingJudgment(unit_id="finding/0", verdict="duplicate", evidence=[], reason="r")
    )
    report = score_verification(loaded, payload, judgment, records, [])
    assert report.metrics["defect_recall"] == 0.0
    assert any("missed" in f for f in report.semantic_failures)


@pytest.mark.parametrize(
    "mutation", ["no_defect_verdict", "unjudged_finding", "double_judged", "invented_quote", "valid_without_evidence"]
)
def test_invalid_verification_judgments_withhold_metrics(verification_case, mutation):
    loaded, payload, judgment, records = verification_case
    if mutation == "no_defect_verdict":
        judgment.defects = []
        judgment.findings.append(FindingJudgment(unit_id="finding/0", verdict="valid", evidence=[], reason="r"))
    elif mutation == "unjudged_finding":
        judgment.findings = []
    elif mutation == "double_judged":
        judgment.findings.append(FindingJudgment(unit_id="finding/0", verdict="duplicate", evidence=[], reason="r"))
    elif mutation == "invented_quote":
        judgment.defects[0].finding_refs[0].quote = "Not in the finding."
    else:
        judgment.findings[0].verdict = "valid"
    assert validate_verification_judgment(payload, judgment)
    report = score_verification(loaded, payload, judgment, records, [])
    assert report.evaluation_errors and report.metrics == {}


@pytest.mark.asyncio
async def test_evaluate_verification_saves_artifacts_and_isolates_judge_failure(
    verification_case, monkeypatch, tmp_path
):
    loaded, _, judgment, _ = verification_case
    from app.services.cnb.golden_set_judge import GoldenJudgeError

    async def no_findings(settings, requests):
        return [
            ChapterValidationDecision(
                target_chapter_id=r.target_chapter_id,
                validation_input_fingerprint=r.validation_input_fingerprint,
                status="ready",
            )
            for r in requests
        ]

    monkeypatch.setattr(module, "run_validator", no_findings)
    judge = AsyncMock(return_value=judgment.model_copy(update={"findings": []}))
    report = await module.evaluate_verification(loaded, get_settings(), tmp_path, judge=judge)
    assert (tmp_path / "seeded_draft.json").exists() and (tmp_path / "findings.json").exists()
    assert report.evaluation_errors  # "detected" cites a finding that does not exist.
    failing = AsyncMock(side_effect=GoldenJudgeError("judge down"))
    report = await module.evaluate_verification(loaded, get_settings(), tmp_path, judge=failing)
    assert report.evaluation_errors == ["judge down"] and not report.semantic_failures
