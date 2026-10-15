"""Stage 2: draft every chapter from this run's extraction and score the result.

Drafting mirrors production order and post-processing: each chapter sees the
complete earlier chapters, the production support check corrects claims its
inputs do not support, and structured gaps pass through the same sanitizing
step persistence applies. Python checks marker/gap parity, chapter identity,
and judge references; the judge assesses fact transfer, claim support, chapter
requirements, and whether missing information is flagged honestly.
"""

from __future__ import annotations

import logging
from copy import deepcopy
from dataclasses import dataclass, field, replace
from typing import Any

from app.config import Settings
from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
from app.models.cnb.context_bundle import SelectedSource
from app.services.cnb.chapter_drafting import (
    _sanitize_generated_output,
    build_chapter_input,
    draft_chapter,
)

from benchmark.golden_set.core import (
    LoadedFixture,
    exactly_once,
    marker_parity_problems,
    score_facts_and_claims,
    source_evidence,
    validate_judgment,
)
from benchmark.golden_set.models import (
    ChapterRequirement,
    ChapterWritingEvaluation,
    ExpectedFact,
    JudgeEvaluation,
    JudgeInput,
    StageReport,
    TextUnit,
)
from benchmark.golden_set.workspace import (
    build_workspace,
    context_units,
    share_common_inputs,
    text_units,
)

logger = logging.getLogger(__name__)
# Inputs a chapter sees that are not evidence: generated text and redraft state.
_NON_EVIDENCE_KEYS = {
    "previous_chapters",
    "current_body_markdown",
    "chapter",
    "existing_open_gaps",
}


@dataclass(frozen=True)
class DraftedChapter:
    """One generated chapter body with the structured gaps production would store."""

    chapter_ref: str
    title: str
    body_markdown: str
    gaps: list[ConceptNoteDraftGapOutput]
    # Every revision the support check proposed, applied or skipped.
    support_check: list[dict[str, Any]] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        """Serialize for drafts.json (the reference-draft format plus the support check)."""
        return {
            "chapter_ref": self.chapter_ref,
            "title": self.title,
            "body_markdown": self.body_markdown,
            "gaps": [gap.model_dump(mode="json") for gap in self.gaps],
            "support_check": self.support_check,
        }


async def write_chapters(
    loaded: LoadedFixture,
    settings: Settings,
    selected_source: SelectedSource,
) -> tuple[list[DraftedChapter], list[TextUnit]]:
    """Draft all chapters in order; return them with the evidence each one saw.

    Raises ``ChapterDraftingError`` when the production drafter fails.
    """
    workspace = build_workspace(loaded, settings, selected_source)
    chapters = list(workspace.chapters)
    supplied: list[TextUnit] = []
    drafted: list[DraftedChapter] = []
    for index, chapter in enumerate(chapters):
        payload = build_chapter_input(
            application_context=workspace.application_context,
            run_context=workspace.run_context,
            current=chapter,
            template_chapter=workspace.templates[index],
            chapters=chapters,
        )
        inputs = deepcopy({k: v for k, v in payload.items() if k not in _NON_EVIDENCE_KEYS})
        # A producer's own summary is never evidence for evaluating its draft.
        for source in inputs["run_context"]["context_bundle"]["selected_sources"]:
            source.pop("summary", None)
        supplied += text_units(
            inputs, f"supplied/{chapter.chapter_ref}", "supplied", chapter.chapter_ref
        )
        generated, support_check = await draft_chapter(payload, settings=settings)
        generated = _sanitize_generated_output(generated, workspace.run_context)
        chapters[index] = replace(chapter, body_markdown=generated.body_markdown)
        drafted.append(
            DraftedChapter(
                chapter_ref=chapter.chapter_ref,
                title=chapter.title,
                body_markdown=generated.body_markdown,
                gaps=list(generated.missing_information),
                support_check=support_check,
            )
        )
        logger.info(
            "Golden chapter writing fixture=%s chapter=%s/%s gaps=%s support_revisions=%s",
            loaded.fixture.fixture_id,
            index + 1,
            len(chapters),
            len(generated.missing_information),
            sum(record["applied"] for record in support_check),
        )
    return drafted, share_common_inputs(supplied, {c.chapter_ref for c in chapters})


def gap_unit_id(chapter_ref: str, field_key: str) -> str:
    """Stable ID of one structured gap raised by the drafter."""
    return f"gap/{chapter_ref}/{field_key}"


def _gap_text(gap: ConceptNoteDraftGapOutput) -> str:
    """Render one structured gap as citable judge text."""
    lines = [
        f"Question: {gap.question}",
        f"Why asking: {gap.why_asking}",
        f"Severity: {gap.severity}",
    ]
    lines += [f"Suggested answer: {s.value}" for s in gap.suggestions]
    return "\n".join(lines)


def chapter_writing_judge_input(
    loaded: LoadedFixture,
    drafted: list[DraftedChapter],
    supplied: list[TextUnit],
) -> tuple[JudgeInput, list[str]]:
    """Build the judge payload and the deterministic integrity findings."""
    golden = loaded.fixture.chapter_writing
    template = loaded.drafting_input
    if golden is None or template is None:
        raise ValueError(f"{loaded.fixture.fixture_id} has no chapter-writing stage")
    outputs = [
        TextUnit(
            id=f"chapter/{c.chapter_ref}",
            text=c.body_markdown,
            kind="output",
            chapter_ref=c.chapter_ref,
        )
        for c in drafted
    ]
    outputs += [
        TextUnit(
            id=gap_unit_id(c.chapter_ref, gap.field_key),
            text=_gap_text(gap),
            kind="output",
            chapter_ref=c.chapter_ref,
        )
        for c in drafted
        for gap in c.gaps
    ]
    payload = JudgeInput(
        stage="chapter_writing",
        expected_facts=[
            ExpectedFact(id=f.id, statement=f.statement, required=f.required, chapters=f.chapters)
            for f in golden.facts
        ],
        expected_topics=[],
        expected_gaps=[
            ExpectedFact(id=g.id, statement=g.statement, required=g.required, chapters=g.chapters)
            for g in golden.gaps
        ],
        chapter_requirements=[
            ChapterRequirement(
                chapter_ref=chapter["chapter_ref"],
                title=chapter["title"],
                description=chapter.get("description") or "",
                required=chapter.get("required", True),
            )
            for chapter in template.chapter_schema
        ],
        outputs=outputs,
        evidence=[*source_evidence(loaded), *context_units(loaded), *supplied],
    )
    integrity = [f"empty chapter: {c.chapter_ref}" for c in drafted if not c.body_markdown.strip()]
    expected_refs = [chapter["chapter_ref"] for chapter in template.chapter_schema]
    if [c.chapter_ref for c in drafted] != expected_refs:
        integrity.append("missing, duplicate, or unexpected chapter IDs")
    for c in drafted:
        integrity += [
            f"{c.chapter_ref}: production would reject this chapter: {problem}"
            for problem in marker_parity_problems(c.body_markdown, c.gaps)
        ]
    return payload, integrity


def validate_chapter_writing_judgment(
    payload: JudgeInput, judgment: ChapterWritingEvaluation
) -> list[str]:
    """Also require one verdict per expected gap and per flagged gap."""
    errors = validate_judgment(payload, judgment)
    errors += exactly_once(
        "gaps", [g.id for g in payload.expected_gaps], [g.id for g in judgment.gaps]
    )
    gap_units = [unit.id for unit in payload.outputs if unit.id.startswith("gap/")]
    errors += exactly_once("flagged_gaps", gap_units, [g.unit_id for g in judgment.flagged_gaps])
    return errors


def score_chapter_writing(
    loaded: LoadedFixture,
    payload: JudgeInput,
    judgment: ChapterWritingEvaluation,
    integrity_failures: list[str],
    extraction: JudgeEvaluation | None = None,
) -> StageReport:
    """Score fact transfer, claim support, chapter requirements, and gap honesty."""
    errors = validate_chapter_writing_judgment(payload, judgment)
    report = StageReport(
        integrity_failures=integrity_failures,
        judgment=judgment,
        evaluation_errors=errors,
    )
    if errors:
        return report
    golden = loaded.fixture.chapter_writing
    thresholds = golden.thresholds
    score_facts_and_claims(payload, judgment, report, thresholds.min_required_fact_coverage)

    required_chapters = {c.chapter_ref for c in payload.chapter_requirements if c.required}
    for chapter in judgment.chapters:
        if chapter.chapter_ref in required_chapters and chapter.verdict != "satisfied":
            report.semantic_failures.append(
                f"{chapter.chapter_ref}: {chapter.verdict}: {chapter.reason}"
            )

    # Expected gaps: flagged honestly, never filled with an invented value.
    required_gaps = {g.id for g in payload.expected_gaps if g.required}
    flagged = sum(g.id in required_gaps and g.verdict == "flagged" for g in judgment.gaps)
    recall = flagged / len(required_gaps) if required_gaps else 1.0
    report.metrics["gap_recall"] = recall
    for verdict in ("flagged", "partially_flagged", "not_flagged", "fabricated"):
        report.metrics[f"required_gaps_{verdict}"] = sum(
            g.id in required_gaps and g.verdict == verdict for g in judgment.gaps
        )
    if recall < thresholds.min_gap_recall:
        report.semantic_failures.append(f"gap_recall {recall:.2f} < {thresholds.min_gap_recall}")
    for gap in judgment.gaps:
        if gap.verdict == "fabricated":
            report.semantic_failures.append(f"invented value instead of a gap: {gap.id}: {gap.reason}")

    # Raised gaps: genuinely missing, consistent across chapters, and actionable.
    raised = judgment.flagged_gaps
    valid = sum(g.verdict == "valid" for g in raised)
    report.metrics["flagged_gaps"] = len(raised)
    report.metrics["flagged_gap_validity"] = valid / len(raised) if raised else 1.0
    for gap in raised:
        if gap.verdict != "valid":
            report.semantic_failures.append(f"{gap.unit_id}: {gap.verdict}: {gap.reason}")

    report.details["transfer"] = transfer_records(loaded, judgment, extraction)
    tracked = [r for r in report.details["transfer"] if r["extraction_verdict"] == "covered"]
    if tracked:
        report.metrics["transfer_rate"] = sum(
            r["draft_verdict"] == "covered" for r in tracked
        ) / len(tracked)
    logger.info(
        "Golden judgment stage=chapter_writing semantic_failures=%s",
        len(report.semantic_failures),
    )
    return report


def transfer_records(
    loaded: LoadedFixture,
    judgment: JudgeEvaluation,
    extraction: JudgeEvaluation | None,
) -> list[dict[str, Any]]:
    """Classify each linked document fact: transferred, or lost at which stage.

    ``recovered`` means extraction missed the fact but the drafter still used it,
    which is possible because the drafter also receives the full source text.
    """
    draft = {item.id: item.verdict for item in judgment.facts}
    extracted = {item.id: item.verdict for item in extraction.facts} if extraction else {}
    records = []
    for fact in loaded.fixture.chapter_writing.facts:
        if not fact.extraction_fact:
            continue
        before = extracted.get(fact.extraction_fact)
        after = draft.get(fact.id)
        if before is None:
            outcome = "extraction_unavailable"
        elif before == "covered":
            outcome = "transferred" if after == "covered" else "lost_in_drafting"
        else:
            outcome = "recovered" if after == "covered" else "lost_in_extraction"
        records.append(
            {
                "fact": fact.id,
                "extraction_fact": fact.extraction_fact,
                "extraction_verdict": before,
                "draft_verdict": after,
                "outcome": outcome,
            }
        )
    return records
