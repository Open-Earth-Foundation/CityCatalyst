"""Stage 3: run the production chapter validator on a draft with seeded defects.

The reviewed reference draft is frozen, so verification is isolated from
drafting variance. Each seeded defect is an exact, unique text or gap change
with the categories and chapters a correct validator finding should name.
Python applies defects, keeps marker/gap parity, separates the validator's
fixed open-gap findings from its model findings, and checks categories and
chapters; the judge maps findings to defects and labels the rest.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from app.models.cnb.concept_note_chapter_validation import (
    ChapterValidationChapter,
    ChapterValidationDecision,
    ChapterValidationGap,
    ChapterValidationRequest,
    ChapterValidationTemplate,
)
from app.models.cnb.golden_set import (
    DefectInput,
    GoldenContract,
    ReferenceChapter,
    SeededDefect,
    StageReport,
    TextUnit,
    VerificationEvaluation,
    VerificationJudgeInput,
)
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.chapter_validation import (
    ChapterValidationError,
    ConceptNoteChapterValidationService,
    _deterministic_gap_findings,
)
from app.services.cnb.golden_set import (
    LoadedFixture,
    exactly_once,
    marker_parity_problems,
    reference_errors,
    repair_references,
    source_evidence,
    units_by_id,
)
from app.services.cnb.golden_set_judge import GoldenJudgeError
from app.services.cnb.golden_set_workspace import (
    GoldenWorkspace,
    build_workspace,
    context_units,
    frozen_selected_source,
    golden_id,
    reference_snapshots,
)

from app.config import Settings

logger = logging.getLogger(__name__)
Judge = Callable[..., Awaitable[GoldenContract]]
VALIDATION_CONCURRENCY = 3


def seed_defects(
    chapters: list[ReferenceChapter], defects: list[SeededDefect]
) -> tuple[list[ReferenceChapter], list[str]]:
    """Apply every defect in order; each ``find`` must match exactly once."""
    current = {chapter.chapter_ref: chapter.model_copy(deep=True) for chapter in chapters}
    problems: list[str] = []
    for defect in defects:
        for edit in defect.edits:
            chapter = current.get(edit.chapter_ref)
            if chapter is None:
                problems.append(f"{defect.id}: unknown chapter {edit.chapter_ref}")
                continue
            count = chapter.body_markdown.count(edit.find)
            if count != 1:
                problems.append(
                    f"{defect.id}: passage occurs {count} times in {edit.chapter_ref}"
                )
                continue
            chapter.body_markdown = chapter.body_markdown.replace(edit.find, edit.replace, 1)
        for ref in defect.remove_gaps:
            chapter = current.get(ref.chapter_ref)
            keys = [gap.field_key for gap in chapter.gaps] if chapter else []
            if ref.field_key not in keys:
                problems.append(f"{defect.id}: no gap {ref.field_key} in {ref.chapter_ref}")
                continue
            chapter.gaps = [gap for gap in chapter.gaps if gap.field_key != ref.field_key]
        for addition in defect.add_gaps:
            chapter = current.get(addition.chapter_ref)
            if chapter is None:
                problems.append(f"{defect.id}: unknown chapter {addition.chapter_ref}")
                continue
            chapter.gaps = [*chapter.gaps, addition.gap]
        for ref in defect.expected_chapters:
            if ref not in current:
                problems.append(f"{defect.id}: unknown expected chapter {ref}")
    seeded = [current[chapter.chapter_ref] for chapter in chapters]
    for chapter in seeded:
        problems += [
            f"seeded {chapter.chapter_ref}: {problem}"
            for problem in marker_parity_problems(chapter.body_markdown, chapter.gaps)
        ]
    return seeded, problems


def validation_requests(
    loaded: LoadedFixture,
    workspace: GoldenWorkspace,
    snapshots: list[WorkspaceChapterSnapshot],
) -> list[ChapterValidationRequest]:
    """Build one production validation request per chapter of the seeded draft."""
    template = loaded.drafting_input
    chapters = [
        ChapterValidationChapter(
            chapter_id=s.chapter_id,
            template_section_id=s.chapter_ref,
            description=s.description,
            title=s.title,
            position=s.position,
            required=s.required,
            body_markdown=s.body_markdown,
            revision_number=s.revision_number,
        )
        for s in snapshots
    ]
    validation_template = ChapterValidationTemplate(
        template_id=golden_id(loaded.fixture.fixture_id, "template"),
        name=template.template_name,
        output_format=None,
        chapter_schema=template.chapter_schema,
        required_fields=template.required_fields,
    )
    fingerprint = hashlib.sha256(
        json.dumps([c.model_dump(mode="json") for c in chapters], sort_keys=True).encode()
    ).hexdigest()
    return [
        ChapterValidationRequest(
            target_chapter_id=snapshot.chapter_id,
            validation_input_fingerprint=fingerprint,
            chapters=chapters,
            template=validation_template,
            open_gaps=[
                ChapterValidationGap(
                    severity=gap.severity, reason=gap.question, field_key=gap.field_key
                )
                for gap in snapshot.gaps
            ],
            evidence_links=[],
        )
        for snapshot in snapshots
    ]


async def run_validator(
    settings: Settings, requests: list[ChapterValidationRequest]
) -> list[ChapterValidationDecision]:
    """Validate every chapter with bounded concurrency, as production would."""
    service = ConceptNoteChapterValidationService(settings=settings)
    limit = asyncio.Semaphore(VALIDATION_CONCURRENCY)

    async def one(request: ChapterValidationRequest) -> ChapterValidationDecision:
        """Validate one chapter under the shared concurrency limit."""
        async with limit:
            return await service.validate(request)

    return list(await asyncio.gather(*(one(request) for request in requests)))


def finding_records(
    requests: list[ChapterValidationRequest],
    decisions: list[ChapterValidationDecision],
    ref_by_id: dict[Any, str],
) -> list[dict[str, Any]]:
    """Flatten decisions; mark the validator's fixed open-gap findings as such."""
    records: list[dict[str, Any]] = []
    for request, decision in zip(requests, decisions, strict=True):
        fixed = {
            (f.category, f.message) for f in _deterministic_gap_findings(request)
        }
        for finding in decision.findings:
            records.append(
                {
                    "unit_id": f"finding/{len(records)}",
                    "target_chapter": ref_by_id[decision.target_chapter_id],
                    "status": decision.status,
                    "origin": "open_gap"
                    if (finding.category, finding.message) in fixed
                    else "model",
                    "phase": finding.phase,
                    "category": finding.category,
                    "severity": finding.severity,
                    "message": finding.message,
                    "suggested_action": finding.suggested_action,
                    "chapters": [ref_by_id[c] for c in finding.involved_chapter_ids],
                    "excerpts": list(finding.excerpts),
                }
            )
    return records


def _finding_text(record: dict[str, Any]) -> str:
    """Render one validator finding as citable judge text."""
    lines = [
        f"Validated chapter: {record['target_chapter']}",
        f"Category: {record['category']} ({record['severity']}, {record['phase']})",
        f"Chapters: {', '.join(record['chapters'])}",
        f"Message: {record['message']}",
        f"Suggested action: {record['suggested_action']}",
    ]
    lines += [f"Excerpt: {excerpt}" for excerpt in record["excerpts"]]
    return "\n".join(lines)


def verification_judge_input(
    loaded: LoadedFixture,
    seeded: list[ReferenceChapter],
    records: list[dict[str, Any]],
) -> VerificationJudgeInput:
    """Model findings as outputs; the seeded draft and the source as evidence."""
    golden = loaded.fixture.verification
    outputs = [
        TextUnit(id=r["unit_id"], text=_finding_text(r), kind="output", chapter_ref=r["target_chapter"])
        for r in records
        if r["origin"] == "model"
    ]
    draft = [
        TextUnit(
            id=f"draft/{chapter.chapter_ref}",
            text=chapter.body_markdown,
            kind="draft",
            chapter_ref=chapter.chapter_ref,
        )
        for chapter in seeded
    ]
    draft += [
        TextUnit(
            id=f"draft-gap/{chapter.chapter_ref}/{gap.field_key}",
            text=f"Open gap question: {gap.question}\nWhy asking: {gap.why_asking}",
            kind="draft",
            chapter_ref=chapter.chapter_ref,
        )
        for chapter in seeded
        for gap in chapter.gaps
    ]
    return VerificationJudgeInput(
        defects=[
            DefectInput(
                id=d.id, kind=d.kind, description=d.description, chapters=d.expected_chapters
            )
            for d in golden.defects
        ],
        outputs=outputs,
        evidence=[*draft, *source_evidence(loaded), *context_units(loaded)],
    )


def validate_verification_judgment(
    payload: VerificationJudgeInput, judgment: VerificationEvaluation
) -> list[str]:
    """One verdict per defect and per model finding, with exact references."""
    outputs = {unit.id: unit for unit in payload.outputs}
    evidence = {unit.id: unit for unit in [*payload.evidence, *payload.outputs]}
    errors = exactly_once("defects", [d.id for d in payload.defects], [d.id for d in judgment.defects])
    for item in judgment.defects:
        if item.verdict != "missed" and not item.finding_refs:
            errors.append(f"{item.id}: {item.verdict} needs finding references")
        if item.verdict == "missed" and item.finding_refs:
            errors.append(f"{item.id}: missed defect must not cite findings")
        for ref in item.finding_refs:
            errors += reference_errors(ref, outputs)
    matched = {ref.unit_id for item in judgment.defects for ref in item.finding_refs}
    unmatched = [unit_id for unit_id in outputs if unit_id not in matched]
    errors += exactly_once("findings", unmatched, [f.unit_id for f in judgment.findings])
    for item in judgment.findings:
        if item.verdict == "valid" and not item.evidence:
            errors.append(f"{item.unit_id}: valid finding needs evidence")
        for ref in item.evidence:
            errors += reference_errors(ref, evidence)
    return errors


def score_verification(
    loaded: LoadedFixture,
    payload: VerificationJudgeInput,
    judgment: VerificationEvaluation,
    records: list[dict[str, Any]],
    integrity_failures: list[str],
    chapter_status: dict[str, str] | None = None,
) -> StageReport:
    """Recall over seeded defects, precision over the remaining model findings."""
    repairs = repair_references(judgment, units_by_id(payload))
    errors = validate_verification_judgment(payload, judgment)
    report = StageReport(
        integrity_failures=integrity_failures,
        judgment=judgment,
        evaluation_errors=errors,
        details={
            "findings": records,
            "chapter_status": chapter_status or {},
            "repaired_quotes": repairs,
        },
    )
    if errors:
        return report
    golden = loaded.fixture.verification
    by_unit = {r["unit_id"]: r for r in records}
    defects = {d.id: d for d in golden.defects}
    strict = 0
    detected = 0
    checks = []
    for item in judgment.defects:
        defect = defects[item.id]
        cited = [by_unit[ref.unit_id] for ref in item.finding_refs if ref.unit_id in by_unit]
        # Deterministic check: some cited finding uses an expected category and
        # names every expected chapter.
        exact = any(
            r["category"] in defect.expected_categories
            and set(defect.expected_chapters) <= set(r["chapters"])
            for r in cited
        )
        detected += item.verdict == "detected"
        strict += item.verdict == "detected" and exact
        checks.append({"defect": item.id, "verdict": item.verdict, "category_and_chapters_match": exact})
        if item.verdict != "detected":
            report.semantic_failures.append(f"{item.id}: {item.verdict}: {item.reason}")
    total = len(judgment.defects)
    recall = detected / total if total else 1.0
    report.metrics["defect_recall"] = recall
    report.metrics["strict_defect_recall"] = strict / total if total else 1.0
    if recall < golden.thresholds.min_defect_recall:
        report.semantic_failures.append(
            f"defect_recall {recall:.2f} < {golden.thresholds.min_defect_recall}"
        )
    model_findings = len(payload.outputs)
    false_alarms = sum(f.verdict == "false_alarm" for f in judgment.findings)
    rate = false_alarms / model_findings if model_findings else 0.0
    report.metrics["model_findings"] = model_findings
    report.metrics["false_alarms"] = false_alarms
    report.metrics["false_alarm_rate"] = rate
    report.metrics["open_gap_findings"] = sum(r["origin"] == "open_gap" for r in records)
    if rate > golden.thresholds.max_false_alarm_rate:
        report.semantic_failures.append(
            f"false_alarm_rate {rate:.2f} > {golden.thresholds.max_false_alarm_rate}"
        )
    report.details["defect_checks"] = checks
    logger.info(
        "Golden judgment stage=verification recall=%.2f false_alarms=%s",
        recall,
        false_alarms,
    )
    return report


async def evaluate_verification(
    loaded: LoadedFixture,
    settings: Settings,
    output_dir: Path,
    *,
    judge: Judge,
) -> StageReport:
    """Seed, validate every chapter, judge findings, and score one fixture."""
    reference = loaded.reference_draft
    golden = loaded.fixture.verification
    seeded, problems = seed_defects(reference.chapters, golden.defects)
    if problems:
        return StageReport(evaluation_errors=[f"invalid fixture: {p}" for p in problems])
    workspace = build_workspace(
        loaded, settings, frozen_selected_source(loaded, reference.selected_source)
    )
    snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, seeded)
    requests = validation_requests(loaded, workspace, snapshots)
    try:
        decisions = await run_validator(settings, requests)
    except ChapterValidationError as exc:
        return StageReport(evaluation_errors=[f"validation_failed: {exc.code}"])
    ref_by_id = {s.chapter_id: s.chapter_ref for s in snapshots}
    records = finding_records(requests, decisions, ref_by_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "seeded_draft.json").write_text(
        json.dumps([c.model_dump(mode="json") for c in seeded], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "findings.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    payload = verification_judge_input(loaded, seeded, records)
    try:
        judgment = await judge(payload, settings)
    except GoldenJudgeError as exc:
        return StageReport(evaluation_errors=[str(exc)], details={"findings": records})
    (output_dir / "judgment.json").write_text(judgment.model_dump_json(indent=2), encoding="utf-8")
    assert isinstance(judgment, VerificationEvaluation)
    statuses = {ref_by_id[d.target_chapter_id]: d.status for d in decisions}
    return score_verification(loaded, payload, judgment, records, [], statuses)
