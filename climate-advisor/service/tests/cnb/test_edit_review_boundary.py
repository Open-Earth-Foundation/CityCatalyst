"""LLM decisions own meaning; Python checks exact changes and their identities."""

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from agents.tool_context import ToolContext

from app.config import get_settings
from app.models.cnb.concept_note_edits import (
    ChapterEditReview,
    EditAgentOutput,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    EditScope,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.edit_planner import (
    ConceptNoteEditPlanner,
    bind_semantic_review,
    build_planner_input,
)
from app.services.cnb.edit_validation import validate_edit_plan
from app.utils.cnb_progress import bind_cnb_progress


class StreamingTestRunner:
    @classmethod
    def run_streamed(cls, agent, payload, **kwargs):
        class Result:
            is_complete = False

            async def stream_events(self):
                result = await cls.run(agent, payload, **kwargs)
                self.final_output = result.final_output
                self.is_complete = True
                if False:
                    yield

            def cancel(self):
                self.is_complete = True

        return Result()


async def propose_with_tools(
    agent, before, after, *, source_refs=None, kind="wording", replace_all=False
):
    tools = {tool.name: tool for tool in agent.tools}
    context = ToolContext(
        context=None,
        tool_name="search_draft",
        tool_call_id="search",
        tool_arguments="{}",
    )
    found = await tools["search_draft"].on_invoke_tool(
        context, json.dumps({"text": before, "chapter_positions": None})
    )
    context = ToolContext(
        context=None,
        tool_name="propose_edits",
        tool_call_id="propose",
        tool_arguments="{}",
    )
    proposed = await tools["propose_edits"].on_invoke_tool(
        context,
        json.dumps(
            {
                "replacements": [
                    {
                        "search_id": found["search_id"],
                        "replacement": after,
                        "replace_all": replace_all,
                        "match_ids": [],
                        "kind": kind,
                        "group_id": "edit",
                        "source_refs": source_refs or [],
                        "user_input_quote": None,
                    }
                ]
            }
        ),
    )
    assert proposed["ok"], proposed


@pytest.mark.asyncio
async def test_planner_reports_real_model_stages_and_excludes_locked_chapters():
    events = []

    async def capture(chunk):
        events.append(json.loads(chunk.decode().split("data: ")[1]))

    class ProgressRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            if agent.output_type is EditAgentOutput:
                assert events[-1]["stage"] == "planning"
                await propose_with_tools(agent, "ten", "10", replace_all=True)
                output = EditAgentOutput(intent="edit")
            else:
                assert events[-1]["stage"] == "reviewing"
                assert all(
                    "chapter_id" not in change
                    for change in json.loads(payload)["changes"]
                )
                output = ChapterEditReview(
                    decisions=[
                        {
                            "change_index": 0,
                            "support": "preserved",
                            "explanation": "Same number",
                        }
                    ]
                )
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    current = chapter("ten schools")
    second = replace(chapter("ten hospitals"), position=1)
    with bind_cnb_progress(capture):
        plan = await ConceptNoteEditPlanner(settings, runner=ProgressRunner).plan(
            EditProposalRequest(instruction="Use digits.", idempotency_key=uuid4()),
            [
                current,
                second,
                replace(chapter("ten locked"), position=2, user_locked=True),
            ],
            {},
        )
    assert {event["stage"] for event in events} == {
        "planning", "validating", "reviewing", "chapter_completed"
    }
    completed = [event for event in events if event["stage"] == "chapter_completed"]
    assert [event["completed"] for event in completed] == [1, 2]
    assert all(event["total"] == 2 for event in completed)
    assert [change.chapter_id for change in plan.changes] == [
        current.chapter_id, second.chapter_id
    ]
    assert [change.group_id for change in plan.changes] == [
        "chapter-0-group-1", "chapter-1-group-1"
    ]
    assert all(change.semantic_support == "preserved" for change in plan.changes)
    assert [notice.model_dump() for notice in plan.notices] == [
        {"code": "locked_chapters", "count": 1}
    ]


@pytest.mark.asyncio
async def test_agent_cannot_finalize_an_edit_without_a_validated_tool_proposal():
    class EmptyRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            return SimpleNamespace(final_output=EditAgentOutput(intent="edit"))

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    with pytest.raises(EditOperationError) as error:
        await ConceptNoteEditPlanner(settings, runner=EmptyRunner).plan(
            EditProposalRequest(instruction="Use digits.", idempotency_key=uuid4()),
            [chapter("ten schools")],
            {},
        )
    assert error.value.code == "invalid_plan"


@pytest.mark.asyncio
@pytest.mark.parametrize("rejections", [1, 2])
async def test_reviewer_feedback_repairs_and_rechecks_the_complete_candidate(rejections):
    current = chapter("ten schools")
    second = replace(chapter("ten hospitals"), position=1)
    editor_inputs = []
    reviewer_inputs = []

    class RepairRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            data = json.loads(payload)
            if agent.output_type is EditAgentOutput:
                editor_inputs.append(data)
                attempt = len(editor_inputs)
                if attempt > 1:
                    feedback = data["review_feedback"]
                    assert len(feedback) == 2
                    assert (
                        feedback[0]["decisions"][0]["explanation"]
                        == "Keep the original number."
                    )
                    assert feedback[1]["decisions"][0]["support"] == "preserved"
                    assert [item["chapter_position"] for item in feedback] == [0, 1]
                    assert all(
                        "chapter_id" not in change
                        for item in feedback
                        for change in item["changes"]
                    )
                await propose_with_tools(
                    agent, "ten", "20" if attempt <= rejections else "10", replace_all=True
                )
                output = EditAgentOutput(intent="edit")
            else:
                assert not agent.tools
                assert "review_feedback" not in data
                reviewer_inputs.append(data)
                unsupported = (
                    data["chapter"]["position"] == 0
                    and data["changes"][0]["after"] == "20"
                )
                output = ChapterEditReview(decisions=[{
                    "change_index": 0,
                    "support": "unsupported" if unsupported else "preserved",
                    "explanation": "Keep the original number." if unsupported else "Same number.",
                }])
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    request = EditProposalRequest(instruction="Use digits.", idempotency_key=uuid4())
    plan = await ConceptNoteEditPlanner(settings, runner=RepairRunner).plan(
        request, [current, second], {}
    )
    assert len(editor_inputs) == rejections + 1
    assert len(reviewer_inputs) == 2 * (rejections + 1)
    assert all(c.after == "10" and c.semantic_support == "preserved" for c in plan.changes)
    assert len(validate_edit_plan(request, [current, second], plan)) == 2
    assert current.body_markdown == "ten schools"
    assert second.body_markdown == "ten hospitals"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mode,repair_limit,expected_code,expected_attempts",
    [
        ("reject", 2, "unsupported_edit", 3),
        ("reject", 0, "unsupported_edit", 1),
        ("missing_candidate", 2, "invalid_plan", 2),
        ("incomplete_review", 2, "invalid_review", 1),
    ],
)
async def test_repair_limits_never_bypass_candidate_or_review_guards(
    mode, repair_limit, expected_code, expected_attempts
):
    attempts = 0

    class RejectedRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            nonlocal attempts
            if agent.output_type is EditAgentOutput:
                attempts += 1
                if mode != "missing_candidate" or attempts == 1:
                    await propose_with_tools(agent, "ten", "20", replace_all=True)
                output = EditAgentOutput(intent="edit")
            else:
                output = ChapterEditReview(decisions=[{
                    "change_index": 1 if mode == "incomplete_review" else 0,
                    "support": "unsupported",
                    "explanation": "The user did not request doubling the number.",
                }])
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    settings.llm.generation.prompt_budget.cnb_edits.max_review_repairs = repair_limit
    with pytest.raises(EditOperationError) as error:
        await ConceptNoteEditPlanner(settings, runner=RejectedRunner).plan(
            EditProposalRequest(instruction="Use digits.", idempotency_key=uuid4()),
            [chapter("ten schools")],
            {},
        )
    assert error.value.code == expected_code
    assert attempts == expected_attempts


@pytest.mark.asyncio
async def test_operation_deadline_cancels_pending_work_and_returns_retryable_error():
    cancelled = asyncio.Event()

    class SlowPlanner(ConceptNoteEditPlanner):
        async def _plan(self, *args):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

    settings = get_settings().model_copy(deep=True)
    # Shorten only the test deadline without weakening production configuration bounds.
    settings.llm.generation.prompt_budget.cnb_edits = (
        settings.llm.generation.prompt_budget.cnb_edits.model_copy(
            update={"timeout_seconds": 0.01}
        )
    )
    with pytest.raises(EditOperationError) as error:
        await SlowPlanner(settings).plan(
            EditProposalRequest(instruction="Use digits.", idempotency_key=uuid4()),
            [chapter("ten schools")],
            {},
        )
    assert error.value.code == "planning_timeout"
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_repair_remains_inside_the_original_operation_deadline():
    repairing = asyncio.Event()
    cancelled = asyncio.Event()
    attempts = 0

    class SlowRepairRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            nonlocal attempts
            if agent.output_type is EditAgentOutput:
                attempts += 1
                if attempts == 2:
                    repairing.set()
                    try:
                        await asyncio.Event().wait()
                    finally:
                        cancelled.set()
                await propose_with_tools(agent, "ten", "20")
                output = EditAgentOutput(intent="edit")
            else:
                output = ChapterEditReview(decisions=[{
                    "change_index": 0,
                    "support": "unsupported",
                    "explanation": "Preserve the number.",
                }])
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    settings.llm.generation.prompt_budget.cnb_edits = (
        settings.llm.generation.prompt_budget.cnb_edits.model_copy(
            update={"timeout_seconds": 1}
        )
    )
    with pytest.raises(EditOperationError) as error:
        await ConceptNoteEditPlanner(settings, runner=SlowRepairRunner).plan(
            EditProposalRequest(instruction="Use digits.", idempotency_key=uuid4()),
            [chapter("ten schools")],
            {},
        )
    assert error.value.code == "planning_timeout"
    assert repairing.is_set() and cancelled.is_set()


def chapter(body: str) -> WorkspaceChapterSnapshot:
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=None,
        title="Implementation",
        position=0,
        status="needs_review",
        required=True,
        user_locked=False,
        body_markdown=body,
        revision_number=1,
    )


def reviewed_plan(current, changes, supports):
    resolved = [
        PlannedTextChange(**change, chapter_id=current.chapter_id) for change in changes
    ]
    review = ChapterEditReview(
        decisions=[
            {
                "change_index": index,
                "support": support,
                "explanation": "Reviewed in chapter and instruction context",
            }
            for index, support in enumerate(supports)
        ]
    )
    return EditPlanOutput(intent="edit", changes=bind_semantic_review(resolved, review))


def factual(before, after, instruction, group="schools"):
    return {
        "start": 0,
        "before": before,
        "after": after,
        "kind": "factual",
        "group_id": group,
        "user_input_quote": instruction,
    }


def test_school_count_edit_keeps_unrelated_ten_month_duration():
    current = chapter(
        "The project serves 10 schools. The delivery period is 10 months."
    )
    instruction = "Change the number of schools from 10 to 12. Keep the delivery period at 10 months unchanged."
    request = EditProposalRequest(instruction=instruction, idempotency_key=uuid4())
    plan = reviewed_plan(
        current, [factual("10 schools", "12 schools", instruction)], ["user"]
    )

    changes = validate_edit_plan(request, [current], plan)

    assert (
        replace_anchors(current.body_markdown, changes)
        == "The project serves 12 schools. The delivery period is 10 months."
    )


def test_independent_facts_with_equal_old_values_keep_model_groups():
    current = chapter("We serve 10 schools over 10 months.")
    instruction = "Serve 12 schools over 14 months."
    plan = reviewed_plan(
        current,
        [
            factual("10 schools", "12 schools", instruction, "schools"),
            factual("10 months", "14 months", instruction, "duration"),
        ],
        ["user", "user"],
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert changes[0].group_id != changes[1].group_id
    assert (
        replace_anchors(current.body_markdown, changes)
        == "We serve 12 schools over 14 months."
    )


def test_semantically_preserved_number_format_is_not_reclassified_by_tokens():
    current = chapter("We serve ten schools.")
    instruction = "Use digits for the school count."
    plan = reviewed_plan(
        current,
        [
            {
                "start": 9,
                "before": "ten",
                "after": "10",
                "kind": "wording",
                "group_id": "format",
            }
        ],
        ["preserved"],
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert changes[0].kind == "wording"
    assert replace_anchors(current.body_markdown, changes) == "We serve 10 schools."


def test_llm_supported_calculation_does_not_require_literal_result_in_user_quote():
    current = chapter("We serve 10 schools.")
    instruction = "Double the number of schools."
    plan = reviewed_plan(
        current, [factual("10 schools", "20 schools", instruction)], ["user"]
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert replace_anchors(current.body_markdown, changes) == "We serve 20 schools."


def test_python_does_not_add_unreviewed_replacements_to_a_global_request():
    current = chapter("We serve 10 schools. These 10 schools receive grants.")
    instruction = "Replace every 10 schools with 12 schools."
    plan = reviewed_plan(
        current,
        [{**factual("10 schools", "12 schools", instruction), "start": 9}],
        ["user"],
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert len(changes) == 1
    assert (
        replace_anchors(current.body_markdown, changes)
        == "We serve 12 schools. These 10 schools receive grants."
    )


def test_llm_rejection_still_blocks_a_proposal():
    current = chapter("We serve 10 schools.")
    with pytest.raises(EditOperationError) as error:
        reviewed_plan(
            current,
            [factual("10 schools", "20 schools", "Make this clearer.")],
            ["unsupported"],
        )
    assert error.value.code == "unsupported_edit"


@pytest.mark.parametrize(
    "failure,code",
    [
        ("missing_review", "invalid_review"),
        ("fabricated_quote", "invalid_user_input"),
        ("fabricated_source", "invalid_source"),
        ("wrong_anchor", "invalid_anchor"),
        ("locked", "invalid_target"),
        ("heading", "structure_changed"),
    ],
)
def test_storage_and_provenance_guards_remain(failure, code):
    current = chapter("## Implementation\nWe serve 10 schools.")
    instruction = "Serve 12 schools."
    change = factual("10 schools", "12 schools", instruction)
    if failure == "fabricated_quote":
        change["user_input_quote"] = "Invented user instruction"
    if failure == "fabricated_source":
        change["source_refs"] = [str(uuid4())]
    if failure == "wrong_anchor":
        change["before"] = "Text absent from this chapter"
    if failure == "heading":
        change.update(before="## Implementation", after="## New heading")
    if failure == "locked":
        current = replace(current, user_locked=True)
    plan = reviewed_plan(current, [change], ["user"])
    if failure == "missing_review":
        plan = plan.model_copy(
            update={
                "changes": [
                    plan.changes[0].model_copy(update={"semantic_support": None})
                ]
            }
        )

    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
            [current],
            plan,
        )
    assert error.value.code == code


@pytest.fixture
def duplicate_sources():
    return [
        {
            "upload_id": str(uuid4()),
            "sha256": fingerprint * 64,
            "source_label": "plan.pdf",
            "filename": "plan.pdf",
            "source_format": "pdf",
            "source_index": 999,
            "summary": f"The project serves {count} schools.",
            "topics": ["schools"],
            "key_excerpts": [{"text": f"We serve {count} schools.", "page": 1}],
            "storage_key": f"private/{fingerprint}.pdf",
        }
        for fingerprint, count in [("a", 12), ("b", 14)]
    ]


@pytest.mark.parametrize("reference,index", [("1", 0), ("2", 1)])
def test_duplicate_source_labels_resolve_exact_index_and_snapshot(
    duplicate_sources, reference, index
):
    current = chapter("We serve 10 schools.")
    plan = reviewed_plan(
        current,
        [
            {
                **factual("10 schools", "12 schools", None),
                "source_refs": [reference],
            }
        ],
        ["source"],
    )
    changes = validate_edit_plan(
        EditProposalRequest(
            instruction="Use the selected plan.", idempotency_key=uuid4()
        ),
        [current],
        plan,
        {"selected_sources": duplicate_sources},
    )
    assert changes[0].source_refs == [reference]
    assert changes[0].source_snapshots[0].model_dump(mode="json") == {
        key: duplicate_sources[index][key]
        for key in ("upload_id", "source_label", "sha256")
    }


@pytest.mark.parametrize("reference", ["plan.pdf", "0", "3", "01", "upload_id"])
def test_source_labels_ids_and_invalid_indices_cannot_select_evidence(
    duplicate_sources, reference
):
    current = chapter("We serve 10 schools.")
    if reference == "upload_id":
        reference = duplicate_sources[0]["upload_id"]
    plan = reviewed_plan(
        current,
        [
            {
                **factual("10 schools", "12 schools", None),
                "source_refs": [reference],
            }
        ],
        ["source"],
    )
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            EditProposalRequest(
                instruction="Use the selected plan.", idempotency_key=uuid4()
            ),
            [current],
            plan,
            {"selected_sources": duplicate_sources},
        )
    assert error.value.code == "invalid_source"


@pytest.mark.asyncio
async def test_planner_and_reviewer_receive_evidence_without_backend_metadata(
    duplicate_sources,
):
    current = chapter("We serve 10 schools.")
    request = EditProposalRequest(
        instruction="Use the second plan's school count.", idempotency_key=uuid4()
    )
    context = {
        "selected_sources": duplicate_sources,
        "cc_context": {
            "city": {
                "cityId": "private-city",
                "name": "Example City",
                "storageKey": "private/storage",
                "s3_key": "private/s3",
                "object_key": "private/object",
            }
        },
        "funder_context": {"funder_id": "private-funder", "name": "Example Fund"},
        "document_context": {
            "chapter_id": str(current.chapter_id),
            "title": "Application",
        },
        "similar_projects": [
            {
                "project_id": "private-project",
                "summary": "School upgrades.",
                "markdown_s3_key": "private/project.md",
            }
        ],
        "unexpected_metadata": "private-extra",
    }
    duplicate_sources[0]["key_excerpts"].append(
        {
            "text": "School upgrades are eligible.",
            "anchor": "eligibility/block-a81bd152fa20",
            "upload_id": "private-excerpt",
        }
    )
    original = json.dumps(context, sort_keys=True)
    calls = []

    class CapturingRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            calls.append(json.loads(payload))
            if agent.output_type is EditAgentOutput:
                await propose_with_tools(
                    agent, "10 schools", "14 schools", source_refs=["2"], kind="factual"
                )
                output = EditAgentOutput(intent="edit")
            else:
                output = ChapterEditReview(
                    decisions=[
                        {
                            "change_index": 0,
                            "support": "source",
                            "explanation": "The second plan specifies 14 schools.",
                        }
                    ]
                )
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    plan = await ConceptNoteEditPlanner(settings, runner=CapturingRunner).plan(
        request, [current], context
    )
    assert len(calls) == 2
    for payload in calls:
        encoded = json.dumps(payload)
        for secret in [
            "private-",
            "private/",
            str(current.chapter_id),
            "a81bd152fa20",
            *[
                source[key]
                for source in duplicate_sources
                for key in ("upload_id", "sha256")
            ],
        ]:
            assert secret not in encoded
        source = payload["run_context"]["selected_sources"][0]
        assert source["source_index"] == 1
        assert source["summary"] == duplicate_sources[0]["summary"]
        assert source["key_excerpts"][1] == {
            "text": "School upgrades are eligible.",
            "heading": "eligibility",
        }
        assert payload["run_context"]["cc_context"]["city"] == {"name": "Example City"}
    assert calls[1]["changes"][0]["source_refs"] == ["2"]
    changes = validate_edit_plan(request, [current], plan, context)
    assert (
        str(changes[0].source_snapshots[0].upload_id)
        == duplicate_sources[1]["upload_id"]
    )
    assert changes[0].source_snapshots[0].sha256 == duplicate_sources[1]["sha256"]
    assert json.dumps(context, sort_keys=True) == original


@pytest.mark.parametrize("source_changed", [False, True])
def test_refinement_rebinds_snapshots_without_replaying_private_source_refs(
    duplicate_sources, source_changed
):
    current = chapter("We serve 10 schools.")
    request = EditProposalRequest(
        instruction="Use the selected plan.", idempotency_key=uuid4()
    )
    plan = reviewed_plan(
        current,
        [{**factual("10 schools", "12 schools", None), "source_refs": ["1"]}],
        ["source"],
    )
    changes = validate_edit_plan(
        request, [current], plan, {"selected_sources": duplicate_sources}
    )
    # A saved proposal may carry private references; only its verified snapshots are trusted.
    changes[0] = changes[0].model_copy(
        update={"source_refs": [duplicate_sources[0]["upload_id"]]}
    )
    now = datetime.now(UTC)
    prior = EditProposalResponse(
        proposal_id=uuid4(),
        run_id=uuid4(),
        instruction=request.instruction,
        scope=EditScope(),
        status="proposed",
        changes=changes,
        created_at=now,
        updated_at=now,
    )
    reordered = [duplicate_sources[1], dict(duplicate_sources[0])]
    if source_changed:
        reordered[1]["sha256"] = "c" * 64
    payload = build_planner_input(
        request, current, {"selected_sources": reordered}, prior_proposal=prior
    )
    assert payload["prior_proposal"]["changes"][0]["source_refs"] == (
        [] if source_changed else ["2"]
    )
    encoded = json.dumps(payload)
    for value in [
        str(prior.proposal_id),
        str(prior.run_id),
        str(changes[0].change_id),
        *[
            source[key]
            for source in duplicate_sources
            for key in ("upload_id", "sha256")
        ],
    ]:
        assert value not in encoded
