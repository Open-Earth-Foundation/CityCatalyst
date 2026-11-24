"""Editing stage tests: production plan/validate/apply plumbing and scoring."""

from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from agents import ToolCallItem, ToolCallOutputItem
from app.config import get_settings
from app.models.cnb.concept_note_edits import (
    ChapterEditReview,
    EditPlanOutput,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.services.cnb.edit_planner import bind_semantic_review
from app.tools.concept_note_question import ConceptNoteQuestion

from benchmark.cnb.golden_set import chat_options
from benchmark.cnb.golden_set.editing import (
    case_checks,
    editing_judge_input,
    evaluate_editing,
    run_edit_case,
    score_editing,
    validate_editing_judgment,
)
from benchmark.cnb.golden_set.models import (
    ChangeJudgment,
    EditCase,
    EditCaseJudgment,
    EditExpectation,
    EditingEvaluation,
    ExpectationJudgment,
    PreservationJudgment,
    TextReference,
)
from benchmark.cnb.golden_set.workspace import (
    build_workspace,
    edit_run_context,
    frozen_selected_source,
    reference_snapshots,
)
from benchmark.cnb.tests.helpers import load_all


@pytest.fixture(scope="module")
def fixtures():
    return load_all()


@pytest.fixture
def workspace_case(fixtures):
    loaded = fixtures["harbor-point-heat-resilience"]
    reference = loaded.reference_draft
    workspace = build_workspace(
        loaded, get_settings(), frozen_selected_source(loaded, reference.selected_source)
    )
    snapshots = reference_snapshots(workspace, loaded.fixture.fixture_id, reference.chapters)
    return loaded, snapshots, edit_run_context(workspace.bundle)


def body_text(snapshot) -> str:
    """The opening of the first prose paragraph (not a heading, marker, or table)."""
    paragraph = next(
        p for p in snapshot.body_markdown.split("\n\n") if p and p[0] not in "#[|"
    )
    return paragraph[:40]


def planner_returning(plan=None, error=None):
    return SimpleNamespace(plan=AsyncMock(return_value=plan, side_effect=error))


def user_edit(snapshot, before: str, after: str, instruction: str) -> EditPlanOutput:
    change = PlannedTextChange(
        chapter_id=snapshot.chapter_id,
        start=snapshot.body_markdown.index(before),
        before=before,
        after=after,
        kind="factual",
        group_id="case",
        user_input_quote=instruction,
    )
    review = ChapterEditReview(
        decisions=[{"change_index": 0, "support": "user", "explanation": "User supplied it."}]
    )
    return EditPlanOutput(intent="edit", changes=bind_semantic_review([change], review))


def case(**values) -> EditCase:
    return EditCase(
        id=values.pop("id", "rename"),
        instruction=values.pop("instruction", "Rename it."),
        expected_outcome=values.pop("expected_outcome", "edit"),
        allowed_chapters=values.pop("allowed_chapters", ["project_summary"]),
        expected_changes=values.pop(
            "expected_changes", [EditExpectation(id="done", statement="It is renamed.")]
        ),
        **values,
    )


@pytest.mark.asyncio
async def test_validated_changes_are_applied_like_an_accepted_proposal(workspace_case):
    loaded, snapshots, run_context = workspace_case
    first = snapshots[0]
    before = body_text(first)
    instruction = f"Replace '{before}' with 'Harbor Point resilience programme'."
    plan = user_edit(first, before, "Harbor Point resilience programme", instruction)
    edit = case(instruction=instruction, allowed_chapters=[first.chapter_ref])
    record = await run_edit_case(
        edit, loaded, get_settings(), snapshots, run_context, planner=planner_returning(plan)
    )
    assert record["outcome"] == "edit"
    assert "Harbor Point resilience programme" in record["edited_chapters"][first.chapter_ref]
    assert record["changes"][0]["unit_id"] == "change/rename/0"
    checks = case_checks(edit, record, snapshots)
    assert checks["outcome_ok"] and checks["collateral_chapters"] == []


@pytest.mark.asyncio
async def test_collateral_chapters_and_removed_markers_are_detected(workspace_case):
    loaded, snapshots, run_context = workspace_case
    with_marker = next(s for s in snapshots if "[Information needed:" in s.body_markdown)
    marker = with_marker.body_markdown[with_marker.body_markdown.index("[Information needed:"):]
    marker = marker[: marker.index("]") + 1]
    instruction = "The accredited entity is Coastal Futures Fund."
    plan = user_edit(with_marker, marker, "Coastal Futures Fund", instruction)
    other = next(s.chapter_ref for s in snapshots if s.chapter_ref != with_marker.chapter_ref)
    edit = case(instruction=instruction, allowed_chapters=[other])
    record = await run_edit_case(
        edit, loaded, get_settings(), snapshots, run_context, planner=planner_returning(plan)
    )
    checks = case_checks(edit, record, snapshots)
    assert checks["collateral_chapters"] == [with_marker.chapter_ref]
    assert checks["removed_markers"] == {with_marker.chapter_ref: [marker]}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan", "error", "outcome"),
    [
        (EditPlanOutput(intent="clarification", clarification="Who is the contact?"), None, "clarification"),
        (None, EditOperationError("clarification_required", "Need a value."), "error:clarification_required"),
        (None, EditOperationError("unsupported_edit", "Blocked."), "error:unsupported_edit"),
    ],
)
async def test_non_edit_outcomes_change_nothing(workspace_case, plan, error, outcome):
    loaded, snapshots, run_context = workspace_case
    clarify = EditCase(
        id="contact", instruction="Fill in the contact.", expected_outcome="clarification"
    )
    record = await run_edit_case(
        clarify, loaded, get_settings(), snapshots, run_context, planner=planner_returning(plan, error)
    )
    assert record["outcome"] == outcome and record["edited_chapters"] == {}
    checks = case_checks(clarify, record, snapshots)
    assert checks["outcome_ok"] == (outcome != "error:unsupported_edit")


@pytest.mark.asyncio
async def test_provider_failure_is_an_evaluation_error(workspace_case, monkeypatch, tmp_path):
    loaded, _, _, = workspace_case
    from benchmark.cnb.golden_set import editing as module

    monkeypatch.setattr(module, "run_edit_case", AsyncMock(side_effect=TimeoutError()))
    report = await module.evaluate_editing(loaded, get_settings(), tmp_path, judge=AsyncMock())
    assert report.evaluation_errors and "planner_unavailable" in report.evaluation_errors[0]
    assert not report.semantic_failures


@pytest.fixture
def judged_edit(workspace_case):
    loaded, snapshots, run_context = workspace_case
    first = snapshots[0]
    before = body_text(first)
    instruction = f"Replace '{before}' with 'Harbor Point resilience programme'."
    edit = case(
        instruction=instruction,
        allowed_chapters=[first.chapter_ref],
        must_preserve=[EditExpectation(id="kept", statement="Other chapters are unchanged.")],
    )
    record = {
        "case_id": edit.id,
        "outcome": "edit",
        "clarification": None,
        "changes": [
            {
                "unit_id": "change/rename/0",
                "chapter_ref": first.chapter_ref,
                "kind": "factual",
                "before": before,
                "after": "Harbor Point resilience programme",
                "source_refs": [],
                "user_input_quote": instruction,
            }
        ],
        "edited_chapters": {
            first.chapter_ref: first.body_markdown.replace(before, "Harbor Point resilience programme", 1)
        },
    }
    fixture = loaded.fixture.model_copy(deep=True)
    fixture.editing.cases = [edit]
    loaded = replace(loaded, fixture=fixture)
    payload = editing_judge_input(loaded, snapshots, [record])
    second = snapshots[1]
    judgment = EditingEvaluation(
        cases=[
            EditCaseJudgment(
                case_id=edit.id,
                expected_changes=[
                    ExpectationJudgment(
                        id="done",
                        verdict="applied",
                        output_refs=[TextReference(unit_id="change/rename/0", quote="Harbor Point resilience programme")],
                        reason="r",
                    )
                ],
                preserved=[
                    PreservationJudgment(
                        id="kept",
                        verdict="preserved",
                        output_refs=[
                            TextReference(unit_id=f"draft/{second.chapter_ref}", quote=second.body_markdown[:30])
                        ],
                        reason="r",
                    )
                ],
                changes=[
                    ChangeJudgment(
                        unit_id="change/rename/0",
                        verdict="supported",
                        evidence=[TextReference(unit_id=f"instruction/{edit.id}", quote="Harbor Point resilience programme")],
                        reason="r",
                    )
                ],
                contradictions=[],
            )
        ]
    )
    checks = [case_checks(edit, record, snapshots)]
    return loaded, payload, judgment, checks, first


def test_valid_editing_judgment_passes(judged_edit):
    loaded, payload, judgment, checks, _ = judged_edit
    report = score_editing(loaded, payload, judgment, checks)
    assert report.passed, report
    assert report.metrics["case_pass_rate"] == 1.0


@pytest.mark.parametrize("verdict", ["unsupported", "contradicts_source", "out_of_scope"])
def test_unauthorized_change_fails_the_case(judged_edit, verdict):
    loaded, payload, judgment, checks, _ = judged_edit
    judgment.cases[0].changes[0].verdict = verdict
    report = score_editing(loaded, payload, judgment, checks)
    assert report.metrics["case_pass_rate"] == 0.0
    assert report.metrics["unsupported_changes"] == 1


@pytest.mark.parametrize("mutation", ["missing_case", "missing_expectation", "unjudged_change"])
def test_missing_editing_verdicts_withhold_metrics(judged_edit, mutation):
    loaded, payload, judgment, checks, _ = judged_edit
    item = judgment.cases[0]
    if mutation == "missing_case":
        judgment.cases = []
    elif mutation == "missing_expectation":
        item.expected_changes = []
    else:
        item.changes = []
    assert validate_editing_judgment(payload, judgment)
    report = score_editing(loaded, payload, judgment, checks)
    assert report.evaluation_errors and report.metrics == {}


@pytest.mark.parametrize("mutation", ["draft_cited_for_edited_chapter", "other_case_output"])
def test_reference_slips_never_withhold_editing_metrics(judged_edit, mutation):
    loaded, payload, judgment, checks, first = judged_edit
    item = judgment.cases[0]
    if mutation == "draft_cited_for_edited_chapter":
        item.preserved[0].output_refs = [
            TextReference(unit_id=f"draft/{first.chapter_ref}", quote=first.body_markdown[:20])
        ]
    else:
        item.expected_changes[0].output_refs = [TextReference(unit_id="change/other/0", quote="x")]
    assert validate_editing_judgment(payload, judgment) == []
    report = score_editing(loaded, payload, judgment, checks)
    assert report.passed and report.metrics["case_pass_rate"] == 1.0


def test_fixture_edit_cases_cover_fill_propagate_rewrite_and_clarify(fixtures):
    for loaded in fixtures.values():
        cases = loaded.fixture.editing.cases
        refs = {chapter.chapter_ref for chapter in loaded.reference_draft.chapters}
        assert {"edit", "clarification"} <= {c.expected_outcome for c in cases}
        assert len(cases) >= 4
        assert any(len(c.allowed_chapters) > 1 for c in cases), "a propagation case"
        for edit in cases:
            assert set(edit.allowed_chapters) <= refs
            assert edit.focused_chapter is None or edit.focused_chapter in refs


def test_card_reply_fails_on_edit_attempt_or_missing_follow_up(workspace_case):
    loaded, snapshots, _ = workspace_case
    timeline = next(c for c in loaded.fixture.editing.cases if c.id == "card-timeline-reply")
    card = {
        "message": "Which format should the timeline use?",
        "on_answer": "reply",
        "options": ["Use quarters.", "Use months."],
        "document_topic": "implementation timeline",
    }
    first = {"card": card, "text": card["message"], "tool_calls": ["concept_note_ask_question"]}
    action = "Update implementation timeline to reflect “Use quarters.”"
    reply = {
        "card": {"on_answer": "propose_edit", "options": [action]},
        "text": "Quarters. Would you like me to prepare the change for review?",
        "tool_calls": [],
    }
    record = {
        "case_id": timeline.id,
        "outcome": "question_card",
        "clarification": None,
        "changes": [],
        "edited_chapters": {},
        "chat_turns": [first, reply],
        "picked_option": "Use quarters.",
        "reply_only": True,
        "expected_followup": [action],
    }
    assert case_checks(timeline, record, snapshots)["contract_failures"] == []
    payload = editing_judge_input(loaded, snapshots, [record])
    assert {u.id for u in payload.outputs} == {
        "answer/card-timeline-reply/1/message",
        "answer/card-timeline-reply/1/1",
        "answer/card-timeline-reply/1/2",
        "answer/card-timeline-reply/2/message",
        "answer/card-timeline-reply/2/1",
    }
    assert validate_editing_judgment(payload, EditingEvaluation(cases=[
        EditCaseJudgment(
            case_id=timeline.id,
            expected_changes=[ExpectationJudgment(
                id="timeline-formats-and-follow-up",
                verdict="applied",
                output_refs=[TextReference(
                    unit_id="answer/card-timeline-reply/2/message",
                    quote=reply["text"],
                )],
                reason="The reply offers to prepare the change.",
            )],
            preserved=[],
            changes=[],
            contradictions=[],
        ),
    ]))
    reply["card"]["options"] = ["Keep the existing timeline."]
    assert "expected the exact single follow-up action" in case_checks(
        timeline, record, snapshots
    )["contract_failures"]
    reply["card"]["options"] = [action]
    reply["tool_calls"].append("concept_note_edit_propose")
    assert "chat attempted or produced a document edit" in case_checks(
        timeline, record, snapshots
    )["contract_failures"]
    record["chat_turns"].pop()
    assert "missing reply-only option selection and response" in case_checks(
        timeline, record, snapshots
    )["contract_failures"]


@pytest.mark.asyncio
async def test_timeline_chat_runner_publishes_confirmation_without_edit_tool(
    workspace_case, monkeypatch, tmp_path
):
    loaded, _, _ = workspace_case
    timeline = next(c for c in loaded.fixture.editing.cases if c.id == "card-timeline-reply")
    fixture = loaded.fixture.model_copy(deep=True)
    fixture.editing.cases = [timeline]
    loaded = replace(loaded, fixture=fixture)
    question = ConceptNoteQuestion(
        message="Which format would you like?",
        options=["Use quarters.", "Use months."],
        document_topic="implementation timeline",
    )
    inputs = []

    async def run(agent, messages, **_kwargs):
        inputs.append((agent, messages))
        if len(inputs) == 2:
            return SimpleNamespace(new_items=[], final_output="Quarters make sense.")
        output = question.model_dump_json()
        return SimpleNamespace(
            final_output=output,
            new_items=[
                ToolCallItem(agent, {"call_id": "question", "name": "concept_note_ask_question"}),
                ToolCallOutputItem(agent, {"call_id": "question"}, output),
            ],
        )

    async def judge(payload, _settings):
        picked = next(unit for unit in payload.evidence if unit.id == f"picked/{timeline.id}")
        assert picked.text == question.options[0]
        action = payload.outputs[-1]
        assert action.id == f"answer/{timeline.id}/2/1"
        assert action.text == "Update implementation timeline to reflect “Use quarters.”"
        return EditingEvaluation(cases=[
            EditCaseJudgment(
                case_id=timeline.id,
                expected_changes=[ExpectationJudgment(
                    id=timeline.expected_changes[0].id,
                    verdict="partially_applied",
                    output_refs=[TextReference(unit_id=action.id, quote=picked.text)],
                    reason="The action names the picked format, but another answer is unsupported.",
                )],
                preserved=[],
                changes=[
                    ChangeJudgment(
                        unit_id=unit.id,
                        verdict="unsupported" if unit.id.endswith("/1/2") else "supported",
                        evidence=[TextReference(unit_id=picked.id, quote=picked.text)],
                        reason="Test answer verdict.",
                    )
                    for unit in payload.outputs
                ],
                contradictions=[],
            )
        ])

    monkeypatch.setattr(chat_options.Runner, "run", run)
    monkeypatch.setattr(
        chat_options, "build_openrouter_client_options",
        lambda *_args, **_kwargs: SimpleNamespace(
            base_url="https://example.invalid", kwargs={"api_key": "offline"}
        ),
    )
    report = await evaluate_editing(loaded, get_settings(), tmp_path, judge=judge)
    (first_agent, first_messages), (second_agent, second_messages) = inputs
    assert {tool.name for tool in first_agent.tools} == {
        "concept_note_ask_question", "concept_note_edit_propose",
    }
    assert [tool.name for tool in second_agent.tools] == ["concept_note_ask_question"]
    assert first_messages[-1]["content"] == timeline.instruction
    assert second_messages[-2]["content"] == question.options[0]
    assert "Update implementation timeline to reflect “Use quarters.”" in second_messages[-1]["content"]
    assert report.integrity_failures == [] and report.evaluation_errors == []
    assert report.metrics["case_pass_rate"] == 0
    assert report.metrics["expected_change_rate"] == 1
    assert report.metrics["unsupported_changes"] == 0
    assert report.metrics["unsupported_answers"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("minimal_diff", [False, True])
async def test_option_switch_checks_verbatim_text_and_quote(workspace_case, minimal_diff):
    loaded, snapshots, run_context = workspace_case
    switch = next(c for c in loaded.fixture.editing.cases if c.id == "edit-switch-to-option-b")
    selection = switch.option_selection
    assert selection is not None
    a, b, _ = selection.card.options
    snapshot = next(s for s in snapshots if s.chapter_ref == switch.focused_chapter)
    before = "The project will deliver" if minimal_diff else selection.before
    after = "Planned measures include" if minimal_diff else b
    planner = planner_returning(user_edit(snapshot, before, after, b))
    record = await run_edit_case(
        switch, loaded, get_settings(), snapshots, run_context, planner=planner
    )
    kwargs = planner.plan.await_args.kwargs
    assert kwargs["chosen_options"] == [a, b]
    assert kwargs["question_cards"][0]["selected_label"] == "A"
    assert case_checks(switch, record, snapshots)["contract_failures"] == []
    record["changes"][0]["user_input_quote"] = switch.instruction
    assert case_checks(switch, record, snapshots)["contract_failures"]
