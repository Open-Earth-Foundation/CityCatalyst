"""Chapter-writing stage tests: production drafting plumbing, gaps, and scoring."""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock

import pytest
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
    ConceptNoteGapSuggestion,
)
from app.models.cnb.golden_set import (
    ChapterJudgment,
    ChapterWritingEvaluation,
    ClaimJudgment,
    CoverageJudgment,
    FlaggedGapJudgment,
    GapJudgment,
    JudgeEvaluation,
    TextReference,
    TextUnit,
)
from app.services.cnb import golden_set_chapters as chapters_module
from app.services.cnb.golden_set_chapters import (
    DraftedChapter,
    chapter_writing_judge_input,
    score_chapter_writing,
    transfer_records,
    validate_chapter_writing_judgment,
    write_chapters,
)
from app.services.cnb.golden_set_workspace import build_workspace, share_common_inputs

from app.config import get_settings

from tests.cnb.golden_set_helpers import load_all, reviewed_source

MARKER = "[Information needed: Confirm the application submittal date for the Richfield DNR application.]"
QUESTION = "Confirm the application submittal date for the Richfield DNR application."


@pytest.fixture(scope="module")
def fixtures():
    return load_all()


def gap(field_key: str = "submittal_date", question: str = QUESTION, **values) -> ConceptNoteDraftGapOutput:
    return ConceptNoteDraftGapOutput(
        field_key=field_key,
        question=question,
        why_asking="The DNR form requires the submittal date.",
        severity="critical",
        **values,
    )


def test_workspace_uses_fresh_source_and_stable_identities(fixtures):
    loaded = fixtures["richfield-flood-risk"]
    source = reviewed_source(loaded).model_copy(update={"summary": "Fresh analysis"})
    workspace = build_workspace(loaded, get_settings(), source)
    selected = workspace.run_context["context_bundle"]["selected_sources"][0]
    assert selected["summary"] == "Fresh analysis"
    assert [c.chapter_ref for c in workspace.chapters] == [
        c["chapter_ref"] for c in loaded.drafting_input.chapter_schema
    ]
    again = build_workspace(loaded, get_settings(), source)
    assert [c.chapter_id for c in again.chapters] == [c.chapter_id for c in workspace.chapters]


@pytest.mark.asyncio
async def test_drafting_mirrors_production_order_and_gap_sanitizing(fixtures, monkeypatch):
    loaded = fixtures["richfield-flood-risk"]
    source = reviewed_source(loaded).model_copy(
        update={"summary": "GENERATED SUMMARY THAT MUST NEVER BE EVIDENCE"}
    )
    outputs = iter(range(100))

    async def draft(payload, *, settings):
        index = next(outputs)
        body = f"## Chapter {index}\n\nBODY-{index} {MARKER}"
        return ConceptNoteChapterDraftOutput(
            body_markdown=body,
            missing_information=[
                gap(
                    suggestions=[
                        ConceptNoteGapSuggestion(value="1 May 2026", source_refs=["not-a-source"]),
                    ]
                ),
                gap(question="A duplicate key production drops."),
            ],
        )

    producer = AsyncMock(side_effect=draft)
    monkeypatch.setattr(chapters_module, "generate_chapter_draft", producer)
    drafted, supplied = await write_chapters(loaded, get_settings(), source)

    assert [c.chapter_ref for c in drafted] == [
        c["chapter_ref"] for c in loaded.drafting_input.chapter_schema
    ]
    # Production sanitizing: duplicate field keys and ungrounded suggestions are dropped.
    assert all(len(c.gaps) == 1 and c.gaps[0].suggestions == [] for c in drafted)
    # Later chapters see every earlier generated chapter, as in production.
    second = producer.await_args_list[1].args[0]
    assert second["previous_chapters"][0]["body_markdown"].startswith("## Chapter 0")
    # Generated text and summaries never become supplied evidence.
    assert not any("BODY-" in unit.text for unit in supplied)
    assert not any("GENERATED SUMMARY" in unit.text for unit in supplied)
    assert any(unit.id.startswith("supplied/shared/") for unit in supplied)
    first = producer.await_args_list[0].args[0]
    assert first["run_context"]["context_bundle"]["selected_sources"][0]["summary"].startswith(
        "GENERATED SUMMARY"
    )


def drafted_richfield(fixtures, *, with_gap: bool = True) -> list[DraftedChapter]:
    loaded = fixtures["richfield-flood-risk"]
    drafted = []
    for chapter in loaded.drafting_input.chapter_schema:
        ref = chapter["chapter_ref"]
        body = f"## {chapter['title']}\n\nRichfield text for {ref}."
        gaps = []
        if ref == "applicant_project_information" and with_gap:
            body += f"\n\n{MARKER}"
            gaps = [gap()]
        drafted.append(DraftedChapter(ref, chapter["title"], body, gaps))
    return drafted


def test_judge_input_has_chapter_and_gap_units_and_flags_parity(fixtures):
    loaded = fixtures["richfield-flood-risk"]
    drafted = drafted_richfield(fixtures)
    payload, integrity = chapter_writing_judge_input(loaded, drafted, [])
    ids = [unit.id for unit in payload.outputs]
    assert "chapter/applicant_project_information" in ids
    assert "gap/applicant_project_information/submittal_date" in ids
    assert len(payload.expected_gaps) == len(loaded.fixture.chapter_writing.gaps)
    assert integrity == []
    # A marker without a structured gap would be rejected by production persistence.
    broken = [replace(drafted[0], gaps=[]), *drafted[1:]]
    _, integrity = chapter_writing_judge_input(loaded, broken, [])
    assert any("production would reject" in item for item in integrity)


@pytest.fixture
def writing_case(fixtures):
    """A minimal valid chapter-writing judgment over one fact and one gap."""
    loaded = fixtures["richfield-flood-risk"]
    fixture = loaded.fixture.model_copy(deep=True)
    fixture.chapter_writing.facts = [
        f for f in fixture.chapter_writing.facts if f.id == "applicant-city"
    ]
    fixture.chapter_writing.gaps = [
        g for g in fixture.chapter_writing.gaps if g.id == "submittal-date"
    ]
    loaded = replace(loaded, fixture=fixture)
    drafted = drafted_richfield(fixtures)
    supplied = [
        TextUnit(
            id="supplied/shared/run_context/context_bundle/cc_context/city/name",
            text="Richfield",
            kind="supplied",
        )
    ]
    payload, integrity = chapter_writing_judge_input(loaded, drafted, supplied)
    chapter = "chapter/applicant_project_information"
    text = "Richfield text for applicant_project_information."
    context = next(u for u in payload.evidence if u.kind == "context" and u.text == "Richfield")
    claim = ClaimJudgment(
        output=TextReference(unit_id=chapter, quote=text),
        verdict="supported",
        evidence=[TextReference(unit_id=context.id, quote="Richfield")],
        supplied_verdict="supported",
        supplied_evidence=[TextReference(unit_id=supplied[0].id, quote="Richfield")],
        self_contained=True,
        reason="Mocked verdict",
    )
    judgment = ChapterWritingEvaluation(
        facts=[
            CoverageJudgment(
                id="applicant-city",
                verdict="covered",
                output_refs=[TextReference(unit_id=chapter, quote=text)],
                reason="Mocked verdict",
            )
        ],
        topics=[],
        claims=[claim],
        chapters=[
            ChapterJudgment(
                chapter_ref=c.chapter_ref,
                verdict="satisfied",
                output_refs=[
                    TextReference(unit_id=f"chapter/{c.chapter_ref}", quote=f"Richfield text for {c.chapter_ref}.")
                ],
                reason="Mocked verdict",
            )
            for c in payload.chapter_requirements
        ],
        contradictions=[],
        gaps=[
            GapJudgment(
                id="submittal-date",
                verdict="flagged",
                output_refs=[TextReference(unit_id=chapter, quote=MARKER)],
                reason="Mocked verdict",
            )
        ],
        flagged_gaps=[
            FlaggedGapJudgment(
                unit_id="gap/applicant_project_information/submittal_date",
                verdict="valid",
                evidence=[],
                reason="Mocked verdict",
            )
        ],
    )
    return loaded, payload, judgment, integrity


def test_valid_chapter_writing_judgment_passes(writing_case):
    loaded, payload, judgment, integrity = writing_case
    report = score_chapter_writing(loaded, payload, judgment, integrity)
    assert report.passed, report
    assert report.metrics["gap_recall"] == 1.0
    assert report.metrics["flagged_gap_validity"] == 1.0


def test_fabricated_gap_fails_even_when_recall_is_otherwise_fine(writing_case):
    loaded, payload, judgment, integrity = writing_case
    judgment.gaps[0].verdict = "fabricated"
    report = score_chapter_writing(loaded, payload, judgment, integrity)
    assert not report.evaluation_errors
    assert any("invented value" in failure for failure in report.semantic_failures)
    assert report.metrics["gap_recall"] == 0


@pytest.mark.parametrize("verdict", ["answerable_from_inputs", "answered_elsewhere", "unclear"])
def test_raised_gap_that_is_not_genuine_fails(writing_case, verdict):
    loaded, payload, judgment, integrity = writing_case
    judgment.flagged_gaps[0].verdict = verdict
    if verdict == "answerable_from_inputs":
        source = payload.evidence[0]
        judgment.flagged_gaps[0].evidence = [TextReference(unit_id=source.id, quote=source.text[:40])]
    elif verdict == "answered_elsewhere":
        judgment.flagged_gaps[0].evidence = [
            TextReference(unit_id="chapter/funding_breakout", quote="Richfield text for funding_breakout.")
        ]
    report = score_chapter_writing(loaded, payload, judgment, integrity)
    assert not report.evaluation_errors, report.evaluation_errors
    assert any(verdict in failure for failure in report.semantic_failures)
    assert report.metrics["flagged_gap_validity"] == 0


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_gap_verdict",
        "missing_flagged_gap_verdict",
        "flagged_outside_allowed_chapter",
        "answered_elsewhere_cites_source",
        "answerable_without_evidence",
        "claim_cites_gap_unit",
        "missing_supplied_verdict",
    ],
)
def test_invalid_chapter_writing_judgments_withhold_metrics(writing_case, mutation):
    loaded, payload, judgment, integrity = writing_case
    if mutation == "missing_gap_verdict":
        judgment.gaps = []
    elif mutation == "missing_flagged_gap_verdict":
        judgment.flagged_gaps = []
    elif mutation == "flagged_outside_allowed_chapter":
        judgment.gaps[0].output_refs = [
            TextReference(unit_id="chapter/funding_breakout", quote="Richfield text for funding_breakout.")
        ]
    elif mutation == "answered_elsewhere_cites_source":
        judgment.flagged_gaps[0].verdict = "answered_elsewhere"
        source = payload.evidence[0]
        judgment.flagged_gaps[0].evidence = [TextReference(unit_id=source.id, quote=source.text[:40])]
    elif mutation == "answerable_without_evidence":
        judgment.flagged_gaps[0].verdict = "answerable_from_inputs"
    elif mutation == "claim_cites_gap_unit":
        unit = "gap/applicant_project_information/submittal_date"
        judgment.claims[0].output = TextReference(unit_id=unit, quote=f"Question: {QUESTION}")
    else:
        judgment.claims[0].supplied_verdict = None
    assert validate_chapter_writing_judgment(payload, judgment)
    report = score_chapter_writing(loaded, payload, judgment, integrity)
    assert report.evaluation_errors and report.metrics == {}


def test_partially_satisfied_required_chapter_fails(writing_case):
    loaded, payload, judgment, integrity = writing_case
    judgment.chapters[0].verdict = "partially_satisfied"
    report = score_chapter_writing(loaded, payload, judgment, integrity)
    assert any(f.startswith("applicant_project_information: partially_satisfied") for f in report.semantic_failures)


def test_supplied_evidence_must_belong_to_the_claims_chapter(writing_case):
    _, payload, judgment, _ = writing_case
    other = TextUnit(id="supplied/funding_breakout/x", text="Richfield", kind="supplied", chapter_ref="funding_breakout")
    payload.evidence.append(other)
    judgment.claims[0].supplied_evidence = [TextReference(unit_id=other.id, quote="Richfield")]
    assert any("different chapter" in e for e in validate_chapter_writing_judgment(payload, judgment))


def test_transfer_separates_extraction_and_drafting_losses(fixtures):
    loaded = fixtures["richfield-flood-risk"]
    linked = [f for f in loaded.fixture.chapter_writing.facts if f.extraction_fact]
    assert len(linked) >= 4
    a, b, c, d = linked[:4]

    def coverage(fid, verdict):
        refs = [] if verdict == "missing" else [TextReference(unit_id="x", quote="x")]
        return CoverageJudgment(id=fid, verdict=verdict, output_refs=refs, reason="r")

    extraction = JudgeEvaluation(
        facts=[
            coverage(a.extraction_fact, "covered"),
            coverage(b.extraction_fact, "covered"),
            coverage(c.extraction_fact, "missing"),
            coverage(d.extraction_fact, "missing"),
        ],
        topics=[], claims=[], chapters=[], contradictions=[],
    )
    if len({a.extraction_fact, b.extraction_fact, c.extraction_fact, d.extraction_fact}) < 4:
        pytest.skip("fixture links share extraction facts")
    draft = JudgeEvaluation(
        facts=[
            coverage(a.id, "covered"),
            coverage(b.id, "missing"),
            coverage(c.id, "covered"),
            coverage(d.id, "missing"),
        ],
        topics=[], claims=[], chapters=[], contradictions=[],
    )
    outcomes = {r["fact"]: r["outcome"] for r in transfer_records(loaded, draft, extraction)}
    assert outcomes[a.id] == "transferred"
    assert outcomes[b.id] == "lost_in_drafting"
    assert outcomes[c.id] == "recovered"
    assert outcomes[d.id] == "lost_in_extraction"
    assert {r["outcome"] for r in transfer_records(loaded, draft, None)} == {"extraction_unavailable"}


def test_shared_input_deduplication_preserves_chapter_specific_values():
    units = [
        TextUnit(id="supplied/a/source/text", text="Common source", kind="supplied", chapter_ref="a"),
        TextUnit(id="supplied/b/source/text", text="Common source", kind="supplied", chapter_ref="b"),
        TextUnit(id="supplied/a/resolved/cost", text="120", kind="supplied", chapter_ref="a"),
        TextUnit(id="supplied/b/resolved/cost", text="150", kind="supplied", chapter_ref="b"),
    ]
    result = share_common_inputs(units, {"a", "b"})
    assert len(result) == 3
    common = next(unit for unit in result if unit.text == "Common source")
    assert common.id == "supplied/shared/source/text" and common.chapter_ref is None
    assert next(unit for unit in result if unit.text == "120").chapter_ref == "a"
