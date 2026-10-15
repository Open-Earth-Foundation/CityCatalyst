"""Stage 4: apply chat edit requests to the frozen reference draft and score them.

Each case runs the production planner (agent tools + independent semantic
review), the production plan validator, and the production anchor replacement,
accepting every validated change as a user would. Python records the outcome,
which chapters changed, and removed gap markers; the judge checks that expected
changes happened, protected statements survived, every change is authorized,
and the edited document stays consistent.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from app.config import Settings
from app.models.cnb.concept_note_edits import EditProposalRequest, EditScope
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.edit_planner import ConceptNoteEditPlanner
from app.services.cnb.edit_validation import validate_edit_plan
from app.utils.cnb_information_markers import removed_information_markers

from benchmark.golden_set.core import (
    LoadedFixture,
    exactly_once,
    source_evidence,
)
from benchmark.golden_set.judge import GoldenJudgeError
from benchmark.golden_set.models import (
    EditCase,
    EditCaseInput,
    EditingEvaluation,
    EditingJudgeInput,
    GoldenContract,
    StageReport,
    TextUnit,
)
from benchmark.golden_set.workspace import (
    build_workspace,
    context_units,
    edit_run_context,
    frozen_selected_source,
    golden_id,
    reference_snapshots,
)

logger = logging.getLogger(__name__)
Judge = Callable[..., Awaitable[GoldenContract]]
# Outcomes that leave the draft unchanged and ask the user for the missing value.
CLARIFICATION_OUTCOMES = {"clarification", "error:clarification_required"}


async def run_edit_case(
    case: EditCase,
    loaded: LoadedFixture,
    settings: Settings,
    snapshots: list[WorkspaceChapterSnapshot],
    run_context: dict[str, Any],
    *,
    planner: Any = None,
) -> dict[str, Any]:
    """Plan, validate, and apply one request; never touches persistent state.

    Planner provider failures other than ``EditOperationError`` propagate so the
    caller records an evaluation error instead of a product verdict.
    """
    fid = loaded.fixture.fixture_id
    by_ref = {s.chapter_ref: s for s in snapshots}
    focused = by_ref[case.focused_chapter].chapter_id if case.focused_chapter else None
    request = EditProposalRequest(
        instruction=case.instruction,
        scope=EditScope(focused_chapter_id=focused),
        idempotency_key=golden_id(fid, f"edit/{case.id}"),
    )
    recent = [message.model_dump() for message in case.recent_messages]
    record: dict[str, Any] = {
        "case_id": case.id,
        "outcome": None,
        "clarification": None,
        "changes": [],
        "edited_chapters": {},
    }
    planner = planner or ConceptNoteEditPlanner(settings)
    try:
        plan = await planner.plan(request, snapshots, run_context, recent_messages=recent)
        if plan.intent != "edit":
            record["outcome"] = plan.intent
            record["clarification"] = plan.clarification
            return record
        if plan.structure is not None:
            record["outcome"] = "structure"
            return record
        changes = validate_edit_plan(
            request, snapshots, plan, run_context, recent_messages=recent
        )
    except EditOperationError as exc:
        record["outcome"] = f"error:{exc.code}"
        return record
    ref_by_id = {s.chapter_id: s.chapter_ref for s in snapshots}
    for snapshot in snapshots:
        mine = [c for c in changes if c.chapter_id == snapshot.chapter_id]
        if mine:
            record["edited_chapters"][snapshot.chapter_ref] = replace_anchors(
                snapshot.body_markdown, mine
            )
    record["changes"] = [
        {
            "unit_id": f"change/{case.id}/{index}",
            "chapter_ref": ref_by_id[change.chapter_id],
            "kind": change.kind,
            "before": change.before,
            "after": change.after,
            "source_refs": list(change.source_refs),
            "user_input_quote": change.user_input_quote,
        }
        for index, change in enumerate(changes)
    ]
    record["outcome"] = "edit"
    return record


def case_checks(case: EditCase, record: dict[str, Any], snapshots: list[WorkspaceChapterSnapshot]) -> dict[str, Any]:
    """Deterministic facts about one case: outcome, scope, and markers."""
    before = {s.chapter_ref: s.body_markdown for s in snapshots}
    changed = sorted(record["edited_chapters"])
    if case.expected_outcome == "edit":
        outcome_ok = record["outcome"] == "edit"
    else:
        outcome_ok = record["outcome"] in CLARIFICATION_OUTCOMES
    removed_markers = {}
    for ref, after in record["edited_chapters"].items():
        removed = removed_information_markers(before[ref], after)
        if removed:
            removed_markers[ref] = removed
    return {
        "case_id": case.id,
        "expected_outcome": case.expected_outcome,
        "outcome": record["outcome"],
        "outcome_ok": outcome_ok,
        "changed_chapters": changed,
        "collateral_chapters": [ref for ref in changed if ref not in case.allowed_chapters],
        "removed_markers": removed_markers,
    }


def editing_judge_input(
    loaded: LoadedFixture,
    snapshots: list[WorkspaceChapterSnapshot],
    records: list[dict[str, Any]],
) -> EditingJudgeInput:
    """Changes and edited chapters as outputs; the reference draft and source as evidence."""
    cases = {case.id: case for case in loaded.fixture.editing.cases}
    outputs: list[TextUnit] = []
    for record in records:
        for change in record["changes"]:
            outputs.append(
                TextUnit(
                    id=change["unit_id"],
                    text=f"Before: {change['before']}\nAfter: {change['after']}",
                    kind="output",
                    chapter_ref=change["chapter_ref"],
                )
            )
        for ref, body in record["edited_chapters"].items():
            outputs.append(
                TextUnit(
                    id=f"edited/{record['case_id']}/{ref}",
                    text=body,
                    kind="output",
                    chapter_ref=ref,
                )
            )
    draft = [
        TextUnit(id=f"draft/{s.chapter_ref}", text=s.body_markdown, kind="draft", chapter_ref=s.chapter_ref)
        for s in snapshots
    ]
    draft += [
        TextUnit(
            id=f"draft-gap/{s.chapter_ref}/{gap.field_key}",
            text=f"Open gap question: {gap.question}",
            kind="draft",
            chapter_ref=s.chapter_ref,
        )
        for s in snapshots
        for gap in s.gaps
    ]
    instructions = [
        TextUnit(id=f"instruction/{case.id}", text=case.instruction, kind="context")
        for case in cases.values()
    ]
    return EditingJudgeInput(
        cases=[
            EditCaseInput(
                id=record["case_id"],
                instruction=cases[record["case_id"]].instruction,
                expected_outcome=cases[record["case_id"]].expected_outcome,
                observed_outcome=record["outcome"],
                clarification=record["clarification"],
                expected_changes=cases[record["case_id"]].expected_changes,
                must_preserve=cases[record["case_id"]].must_preserve,
            )
            for record in records
        ],
        outputs=outputs,
        evidence=[*draft, *instructions, *source_evidence(loaded), *context_units(loaded)],
    )


def validate_editing_judgment(
    payload: EditingJudgeInput, judgment: EditingEvaluation
) -> list[str]:
    """Require one judgment per case, expectation, preserved statement, and change."""
    errors = exactly_once("cases", [c.id for c in payload.cases], [c.case_id for c in judgment.cases])
    cases = {case.id: case for case in payload.cases}
    for item in judgment.cases:
        case = cases.get(item.case_id)
        if case is None:
            continue
        errors += exactly_once(
            f"{case.id} expected_changes",
            [e.id for e in case.expected_changes],
            [e.id for e in item.expected_changes],
        )
        errors += exactly_once(
            f"{case.id} preserved", [e.id for e in case.must_preserve], [e.id for e in item.preserved]
        )
        errors += exactly_once(
            f"{case.id} changes",
            sorted(u.id for u in payload.outputs if u.id.startswith(f"change/{case.id}/")),
            [c.unit_id for c in item.changes],
        )
    return errors


def score_editing(
    loaded: LoadedFixture,
    payload: EditingJudgeInput,
    judgment: EditingEvaluation,
    checks: list[dict[str, Any]],
) -> StageReport:
    """A case passes only with the right outcome, scope, fidelity, and consistency."""
    errors = validate_editing_judgment(payload, judgment)
    report = StageReport(judgment=judgment, evaluation_errors=errors, details={"cases": checks})
    for check in checks:
        if not check["outcome_ok"]:
            report.semantic_failures.append(
                f"{check['case_id']}: expected {check['expected_outcome']}, got {check['outcome']}"
            )
        if check["collateral_chapters"]:
            report.integrity_failures.append(
                f"{check['case_id']}: changed chapters outside the request: {', '.join(check['collateral_chapters'])}"
            )
    if errors:
        return report
    by_case = {item.case_id: item for item in judgment.cases}
    passed = 0
    applied = total_expected = kept = total_kept = unsupported = 0
    for check in checks:
        item = by_case[check["case_id"]]
        failures_before = len(report.semantic_failures) + len(report.integrity_failures)
        for expectation in item.expected_changes:
            total_expected += 1
            applied += expectation.verdict == "applied"
            if expectation.verdict != "applied":
                report.semantic_failures.append(
                    f"{check['case_id']}/{expectation.id}: {expectation.verdict}: {expectation.reason}"
                )
        for statement in item.preserved:
            total_kept += 1
            kept += statement.verdict == "preserved"
            if statement.verdict != "preserved":
                report.semantic_failures.append(
                    f"{check['case_id']}/{statement.id}: {statement.verdict}: {statement.reason}"
                )
        for change in item.changes:
            if change.verdict != "supported":
                unsupported += 1
                report.semantic_failures.append(f"{change.unit_id}: {change.verdict}: {change.reason}")
        for conflict in item.contradictions:
            report.semantic_failures.append(f"{check['case_id']}: inconsistent after edit: {conflict.reason}")
        case_failed = (
            not check["outcome_ok"]
            or check["collateral_chapters"]
            or len(report.semantic_failures) + len(report.integrity_failures) > failures_before
        )
        passed += not case_failed
    report.metrics["case_pass_rate"] = passed / len(checks) if checks else 1.0
    report.metrics["expected_change_rate"] = applied / total_expected if total_expected else 1.0
    report.metrics["preservation_rate"] = kept / total_kept if total_kept else 1.0
    report.metrics["unsupported_changes"] = unsupported
    report.metrics["collateral_edits"] = sum(bool(c["collateral_chapters"]) for c in checks)
    logger.info("Golden judgment stage=editing case_pass_rate=%.2f", report.metrics["case_pass_rate"])
    return report


async def evaluate_editing(
    loaded: LoadedFixture,
    settings: Settings,
    output_dir: Path,
    *,
    judge: Judge,
) -> StageReport:
    """Run every edit case against the same reference draft, then judge them together."""
    reference = loaded.reference_draft
    workspace = build_workspace(
        loaded, settings, frozen_selected_source(loaded, reference.selected_source)
    )
    snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, reference.chapters)
    run_context = edit_run_context(workspace.bundle)
    records: list[dict[str, Any]] = []
    for case in loaded.fixture.editing.cases:
        try:
            records.append(await run_edit_case(case, loaded, settings, snapshots, run_context))
        except Exception as exc:  # provider failure: not a product verdict
            logger.warning("Golden edit case unavailable case=%s error_type=%s", case.id, type(exc).__name__)
            return StageReport(evaluation_errors=[f"{case.id}: planner_unavailable: {type(exc).__name__}"])
        logger.info("Golden edit case=%s outcome=%s", case.id, records[-1]["outcome"])
    checks = [
        case_checks(case, record, snapshots)
        for case, record in zip(loaded.fixture.editing.cases, records, strict=True)
    ]
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "cases.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    payload = editing_judge_input(loaded, snapshots, records)
    try:
        judgment = await judge(payload, settings)
    except GoldenJudgeError as exc:
        return StageReport(evaluation_errors=[str(exc)], details={"cases": checks})
    (output_dir / "judgment.json").write_text(judgment.model_dump_json(indent=2), encoding="utf-8")
    assert isinstance(judgment, EditingEvaluation)
    return score_editing(loaded, payload, judgment, checks)
