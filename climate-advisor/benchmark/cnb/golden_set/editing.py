"""Stage 4: evaluate edits and suggested answers against the frozen reference draft.

Edit cases run the production planner, validator, and anchor replacement,
accepting every validated change in memory. Card cases run the production chat
prompt and question tool. Python checks outcomes, edit scope, markers, and
selection contracts. The Editing judge checks fidelity, support, and consistency.
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
from app.services.cnb.question_reply import planner_question_cards, referenced_options
from app.utils.cnb_information_markers import removed_information_markers

from benchmark.cnb.golden_set.chat_options import run_chat_case, saved_card
from benchmark.cnb.golden_set.core import (
    LoadedFixture,
    exactly_once,
    source_evidence,
)
from benchmark.cnb.golden_set.judge import GoldenJudgeError
from benchmark.cnb.golden_set.models import (
    EditCase,
    EditCaseInput,
    EditingEvaluation,
    EditingJudgeInput,
    GoldenContract,
    StageReport,
    TextUnit,
)
from benchmark.cnb.golden_set.workspace import (
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
    selection = case.option_selection
    cards = []
    if selection is not None:
        cards.append(
            saved_card(
                selection.card,
                str(golden_id(fid, f"card/{case.id}")),
                selection.card.options[selection.previous_index],
            )
        )
    chosen = referenced_options(cards, case.instruction)
    record: dict[str, Any] = {
        "case_id": case.id,
        "outcome": None,
        "clarification": None,
        "changes": [],
        "edited_chapters": {},
    }
    if selection is not None:
        record["chosen_options"] = chosen
    planner = planner or ConceptNoteEditPlanner(settings)
    try:
        plan = await planner.plan(
            request, snapshots, run_context, recent_messages=recent,
            question_cards=planner_question_cards(cards), chosen_options=chosen,
        )
        if plan.intent != "edit":
            record["outcome"] = plan.intent
            record["clarification"] = plan.clarification
            return record
        if plan.structure is not None:
            record["outcome"] = "structure"
            return record
        changes = validate_edit_plan(
            request, snapshots, plan, run_context, recent_messages=recent, chosen_options=chosen
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
    """Check the outcome, edit scope, markers, and exact selection contracts."""
    before = {s.chapter_ref: s.body_markdown for s in snapshots}
    changed = sorted(record["edited_chapters"])
    contract_failures: list[str] = []
    if case.expected_outcome == "edit":
        outcome_ok = record["outcome"] == "edit"
    elif case.expected_outcome == "question_card":
        outcome_ok = record["outcome"] == "question_card"
        turns = record["chat_turns"]
        card = turns[0]["card"]
        if card is not None and card["on_answer"] != "reply":
            contract_failures.append("first card must have on_answer=reply")
        if record["changes"] or changed or any(
            "concept_note_edit_propose" in turn["tool_calls"] for turn in turns
        ):
            contract_failures.append("chat attempted or produced a document edit")
        if case.pick_first_option:
            if (
                card is None
                or record["picked_option"] != card["options"][0]
                or not record["reply_only"]
                or len(turns) != 2
                or not turns[1]["text"].strip()
            ):
                contract_failures.append("missing reply-only option selection and response")
            if len(turns) == 2:
                followup = turns[1]["card"]
                expected_actions = record["expected_followup"]
                if (
                    not card
                    or not card.get("document_topic")
                    or not followup
                    or followup["on_answer"] != "propose_edit"
                    or not expected_actions
                    or followup["options"] != expected_actions
                ):
                    contract_failures.append("expected the exact single follow-up action")
    else:
        outcome_ok = record["outcome"] in CLARIFICATION_OUTCOMES
    removed_markers = {}
    for ref, after in record["edited_chapters"].items():
        removed = removed_information_markers(before[ref], after)
        if removed:
            removed_markers[ref] = removed
    selection = case.option_selection
    ref = case.focused_chapter
    if selection is not None and ref is not None:
        expected = selection.card.options[selection.expected_index]
        changes = record["changes"]
        if expected not in record["chosen_options"] or len(changes) != 1 or (
            changes[0]["chapter_ref"] != ref
            or changes[0]["user_input_quote"] != expected
        ):
            contract_failures.append("expected one scoped option edit with the selected text as its exact user quote")
        expected_body = "\n\n".join(
            expected if paragraph == selection.before else paragraph
            for paragraph in before[ref].split("\n\n")
        )
        if changed != [ref] or record["edited_chapters"].get(ref) != expected_body:
            contract_failures.append("expected only the selected target paragraph to change")
    return {
        "case_id": case.id,
        "expected_outcome": case.expected_outcome,
        "outcome": record["outcome"],
        "outcome_ok": outcome_ok,
        "changed_chapters": changed,
        "collateral_chapters": [ref for ref in changed if ref not in case.allowed_chapters],
        "removed_markers": removed_markers,
        "contract_failures": contract_failures,
    }


def chat_answer_units(record: dict[str, Any]) -> list[TextUnit]:
    """Give each published message and selectable answer its own judge unit."""
    units: list[TextUnit] = []
    for index, turn in enumerate(record.get("chat_turns", []), start=1):
        prefix = f"answer/{record['case_id']}/{index}"
        if turn["text"].strip():
            units.append(TextUnit(id=f"{prefix}/message", text=turn["text"], kind="output"))
        if turn["card"]:
            units.extend(
                TextUnit(id=f"{prefix}/{number}", text=text, kind="output")
                for number, text in enumerate(turn["card"]["options"], start=1)
            )
    return units


def editing_judge_input(
    loaded: LoadedFixture,
    snapshots: list[WorkspaceChapterSnapshot],
    records: list[dict[str, Any]],
) -> EditingJudgeInput:
    """Collect edited text and chat answers with the evidence used to judge them."""
    cases = {case.id: case for case in loaded.fixture.editing.cases}
    outputs: list[TextUnit] = []
    for record in records:
        outputs.extend(chat_answer_units(record))
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
    for record in records:
        case = cases[record["case_id"]]
        selection = case.option_selection
        if selection is not None:
            text = selection.card.options[selection.expected_index]
            if text in record["chosen_options"]:
                instructions.append(TextUnit(
                    id=f"selected-option/{case.id}", text=text, kind="context",
                ))
        if record.get("picked_option"):
            instructions.append(TextUnit(
                id=f"picked/{case.id}", text=record["picked_option"], kind="context",
            ))
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
    """Require a verdict for each case, expectation, protected statement, and output."""
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
            sorted(
                u.id for u in payload.outputs
                if u.id.startswith((f"change/{case.id}/", f"answer/{case.id}/"))
            ),
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
        report.integrity_failures.extend(
            f"{check['case_id']}: {failure}" for failure in check.get("contract_failures", [])
        )
    if errors:
        return report
    by_case = {item.case_id: item for item in judgment.cases}
    passed = 0
    applied = total_expected = kept = total_kept = unsupported = unsupported_answers = 0
    for check in checks:
        item = by_case[check["case_id"]]
        failures_before = len(report.semantic_failures) + len(report.integrity_failures)
        for expectation in item.expected_changes:
            if check["expected_outcome"] == "edit":
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
                if change.unit_id.startswith("answer/"):
                    unsupported_answers += 1
                else:
                    unsupported += 1
                report.semantic_failures.append(f"{change.unit_id}: {change.verdict}: {change.reason}")
        for conflict in item.contradictions:
            report.semantic_failures.append(f"{check['case_id']}: inconsistent output: {conflict.reason}")
        case_failed = (
            not check["outcome_ok"]
            or check["collateral_chapters"]
            or check.get("contract_failures")
            or len(report.semantic_failures) + len(report.integrity_failures) > failures_before
        )
        passed += not case_failed
    report.metrics["case_pass_rate"] = passed / len(checks) if checks else 1.0
    report.metrics["expected_change_rate"] = applied / total_expected if total_expected else 1.0
    report.metrics["preservation_rate"] = kept / total_kept if total_kept else 1.0
    report.metrics["unsupported_changes"] = unsupported
    if any(case.expected_outcome == "question_card" for case in payload.cases):
        report.metrics["unsupported_answers"] = unsupported_answers
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
    """Run every Editing case against the same reference draft and judge them together."""
    reference = loaded.reference_draft
    workspace = build_workspace(
        loaded, settings, frozen_selected_source(loaded, reference.selected_source)
    )
    snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, reference.chapters)
    run_context = edit_run_context(workspace.bundle)
    records: list[dict[str, Any]] = []
    for case in loaded.fixture.editing.cases:
        is_chat = case.expected_outcome == "question_card"
        run_case = run_chat_case if is_chat else run_edit_case
        try:
            records.append(await run_case(case, loaded, settings, snapshots, run_context))
        except Exception as exc:  # provider failure: not a product verdict
            logger.warning("Golden edit case unavailable case=%s error_type=%s", case.id, type(exc).__name__)
            error_code = "case_unavailable" if is_chat else "planner_unavailable"
            return StageReport(evaluation_errors=[f"{case.id}: {error_code}: {type(exc).__name__}"])
        logger.info("Golden edit case=%s outcome=%s", case.id, records[-1]["outcome"])
    checks = [
        case_checks(case, record, snapshots)
        for case, record in zip(loaded.fixture.editing.cases, records, strict=True)
    ]
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "cases.json").write_text(
        json.dumps(records, ensure_ascii=False), encoding="utf-8"
    )
    payload = editing_judge_input(loaded, snapshots, records)
    try:
        judgment = await judge(payload, settings)
    except GoldenJudgeError as exc:
        return StageReport(evaluation_errors=[str(exc)], details={"cases": checks})
    (output_dir / "judgment.json").write_text(judgment.model_dump_json(), encoding="utf-8")
    assert isinstance(judgment, EditingEvaluation)
    return score_editing(loaded, payload, judgment, checks)
