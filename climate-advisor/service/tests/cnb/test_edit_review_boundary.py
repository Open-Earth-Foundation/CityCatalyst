"""LLM decisions own meaning; Python checks exact changes and their identities."""

import asyncio
import json
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from agents.tool_context import ToolContext

from datetime import timedelta

from app.config import get_settings
from app.models.cnb.concept_note_edits import EditChange
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    edit_planning_in_progress,
)
from app.routes import concept_note_edits as edit_routes
from sqlalchemy import update
from tests.test_concept_note_lifecycle import _workspace_repository
from app.services.cnb.edits import ConceptNoteEditService
from app.tools import concept_note_edit_tools as edit_tools
from app.tools.concept_note_draft_tools import (
    bound_source_answer,
    build_source_query_tool,
)
from app.models.cnb.concept_note_edits import (
    ChapterEditReview,
    EditAgentOutput,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    EditReviewObjection,
    EditScope,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.edit_planner import (
    ConceptNoteEditPlanner,
    bind_semantic_review,
    build_planner_input,
    fit_review_evidence,
    unavailable_source_lookup,
)
from app.services.cnb.edit_validation import context_snapshot, validate_edit_plan
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
                # Reviewers can only read sources; they never get draft or edit tools.
                assert [tool.name for tool in agent.tools] == ["query_source"]
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
    # Only a final semantic rejection explains itself to chat.
    assert error.value.objections == (
        [
            EditReviewObjection(
                chapter_title="Implementation",
                explanation="The user did not request doubling the number.",
            )
        ]
        if expected_code == "unsupported_edit"
        else []
    )


@pytest.mark.asyncio
async def test_planner_and_reviewers_share_one_bounded_verified_source_lookup():
    current = replace(chapter("Minimum DSCR is to be confirmed."), chapter_ref="financing")
    # The DSCR quotation was kept for the risk chapter, not the edited one.
    context = {
        "selected_sources": [
            {
                "upload_id": str(uuid4()),
                "sha256": "a" * 64,
                "source_label": "Financing pack",
                "summary": "Lender terms.",
                "topics": [],
                "key_excerpts": [],
                "chapter_excerpts": [
                    {
                        "chapter_ref": "risks",
                        "excerpts": [{"text": "Minimum DSCR 1.15x.", "page": 7}],
                    }
                ],
            },
            {
                "upload_id": str(uuid4()),
                "sha256": "b" * 64,
                "source_label": "Climate report",
                "summary": "Emissions.",
                "topics": [],
                "key_excerpts": [],
                "chapter_excerpts": [
                    {
                        "chapter_ref": "climate",
                        "excerpts": [{"text": "1,853 t CO2e avoided.", "page": 1}],
                    }
                ],
            },
        ]
    }
    uncited = {"source_index": "2", "text": "1,853 t CO2e avoided.", "page": 1}
    asked = []

    async def lookup(source_index, question):
        asked.append(question)
        return json.dumps({"success": "fail" not in question, "data": {"q": question}})

    async def ask(agent, question):
        tool = next(tool for tool in agent.tools if tool.name == "query_source")
        context = ToolContext(
            context=None,
            tool_name="query_source",
            tool_call_id=question,
            tool_arguments="{}",
        )
        return json.loads(
            await tool.on_invoke_tool(
                context, json.dumps({"source_index": 1, "question": question})
            )
        )

    class LookupRunner(StreamingTestRunner):
        @staticmethod
        async def run(agent, payload, **kwargs):
            data = json.loads(payload)
            assert {"source_index": "1", "text": "Minimum DSCR 1.15x.", "page": 7} in (
                data["run_context"]["source_excerpts"]
            )
            # The planner sees every quotation; a reviewer only its cited sources'.
            assert (uncited in data["run_context"]["source_excerpts"]) == (
                agent.output_type is EditAgentOutput
            )
            if agent.output_type is EditAgentOutput:
                assert (await ask(agent, "What is the DSCR?"))["success"]
                assert not (await ask(agent, "fail once"))["success"]
                # The failure was not cached, but this run's limit is spent.
                limited = await ask(agent, "fail once")
                assert limited["error_code"] == "source_query_limit"
                await propose_with_tools(
                    agent,
                    "is to be confirmed",
                    "is 1.15x",
                    source_refs=["1"],
                    kind="factual",
                )
                output = EditAgentOutput(intent="edit")
            else:
                # The planner's answer is shared, and costs this reviewer nothing.
                assert (await ask(agent, "  what is the  DSCR? "))["success"]
                assert (await ask(agent, "Is it base case?"))["success"]
                assert not (await ask(agent, "fail once"))["success"]
                limited = await ask(agent, "One more?")
                assert limited["error_code"] == "source_query_limit"
                output = ChapterEditReview(decisions=[{
                    "change_index": 0,
                    "support": "source",
                    "explanation": "Page 7 states a minimum DSCR of 1.15x.",
                }])
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    settings.llm.generation.prompt_budget.cnb_edits.max_source_queries = 2
    plan = await ConceptNoteEditPlanner(settings, runner=LookupRunner).plan(
        EditProposalRequest(instruction="Fill the DSCR.", idempotency_key=uuid4()),
        [current],
        context,
        source_lookup=lookup,
    )
    assert asked == ["What is the DSCR?", "fail once", "Is it base case?", "fail once"]
    assert plan.changes[0].semantic_support == "source"


@pytest.mark.asyncio
async def test_service_pins_lookups_to_snapshot_and_keeps_review_objections(
    monkeypatch,
):
    current = chapter("Minimum DSCR is to be confirmed.")
    snapshot_source = {"upload_id": str(uuid4()), "sha256": "a" * 64}
    objection = EditReviewObjection(
        chapter_title="Implementation",
        explanation="No supplied source states 70% CPI indexation.",
    )
    queried = []

    async def query(**kwargs):
        queried.append(kwargs)
        return json.dumps({"success": True})

    monkeypatch.setattr("app.services.cnb.edits.query_concept_note_source", query)

    async def plan(request, chapters, context, *, source_lookup, **kwargs):
        # An index the snapshot never held cannot answer from a newer upload.
        outside = json.loads(await source_lookup(2, "Is the amendment signed?"))
        assert outside["error_code"] == "concept_note_source_not_selected"
        assert json.loads(await source_lookup(1, "Is the amendment signed?"))["success"]
        raise EditOperationError(
            "unsupported_edit", "Rejected.", status_code=422, objections=[objection]
        )

    repository = SimpleNamespace(
        start=AsyncMock(return_value=(SimpleNamespace(proposal_id=uuid4()), True)),
        finish=AsyncMock(return_value="failed"),
    )
    service = ConceptNoteEditService(
        repository,
        SimpleNamespace(list_chapters=AsyncMock(return_value=[current])),
        SimpleNamespace(plan=plan),
        workflow_sessions="sessions",
    )

    @asynccontextmanager
    async def locked(run):
        yield run, {"selected_sources": [snapshot_source]}

    service.locked_context = locked
    result = await service._propose(
        SimpleNamespace(run_id=uuid4(), user_id="owner", context_summary={}),
        EditProposalRequest(instruction="Fill the gaps.", idempotency_key=uuid4()),
        token="token-1",
        recent_messages=None,
    )

    assert result == "failed"
    assert repository.finish.await_args.kwargs["review_objections"] == [objection]
    [call] = queried
    assert call["expected_source"] == (snapshot_source["upload_id"], "a" * 64)
    assert call["token"] == "token-1"
    assert call["session_factory"] == "sessions"
    assert call["include_visual_context"] is False


@pytest.mark.asyncio
async def test_chat_tool_returns_review_objections_for_a_rejected_proposal(
    monkeypatch,
):
    now = datetime.now(UTC)
    proposal = EditProposalResponse(
        proposal_id=uuid4(),
        run_id=uuid4(),
        instruction="Fill the gaps.",
        scope=EditScope(),
        status="failed",
        error_code="unsupported_edit",
        review_objections=[
            EditReviewObjection(
                chapter_title="Financing plan",
                explanation="No supplied source states 70% CPI indexation.",
            )
        ],
        created_at=now,
        updated_at=now,
    )
    service = SimpleNamespace(propose=AsyncMock(return_value=proposal))
    monkeypatch.setattr(edit_tools, "get_edit_service", lambda: service)
    monkeypatch.setattr(edit_tools, "CityCatalystClient", lambda **kwargs: None)
    monkeypatch.setattr(
        edit_tools,
        "ConceptNoteRunService",
        lambda session, cc_client: SimpleNamespace(
            get_authorized_run=AsyncMock(return_value="run"),
            cc_client=SimpleNamespace(close=AsyncMock()),
        ),
    )

    @asynccontextmanager
    async def sessions():
        yield None

    [tool] = edit_tools.build_concept_note_edit_tools(
        session_factory=sessions,
        run_id=proposal.run_id,
        user_id="owner",
        token_ref={"value": "token-1"},
        request=EditProposalRequest(instruction="Fill the gaps.", idempotency_key=uuid4()),
    )
    context = ToolContext(
        context=None,
        tool_name="concept_note_edit_propose",
        tool_call_id="edit",
        tool_arguments="{}",
    )
    result = json.loads(await tool.on_invoke_tool(context, "{}"))

    assert result["error_code"] == "unsupported_edit"
    assert result["data"]["review_objections"] == [
        {
            "chapter_title": "Financing plan",
            "explanation": "No supplied source states 70% CPI indexation.",
        }
    ]
    assert service.propose.await_args.kwargs["token"] == "token-1"


async def invoke_query_source(tool, question, source_index=1):
    context = ToolContext(
        context=None, tool_name="query_source", tool_call_id=question, tool_arguments="{}"
    )
    return json.loads(
        await tool.on_invoke_tool(
            context, json.dumps({"source_index": source_index, "question": question})
        )
    )


@pytest.mark.asyncio
async def test_concurrent_reviewers_share_one_in_flight_source_read():
    release = asyncio.Event()
    calls = []

    async def lookup(source_index, question):
        calls.append(question)
        await release.wait()
        return json.dumps({"success": True, "data": {"excerpts": []}})

    cache = {}
    reviewers = [
        build_source_query_tool(
            lookup, stage="reviewing", max_queries=1, max_answer_chars=1000, cache=cache
        )
        for _ in range(2)
    ]
    pending = [
        asyncio.create_task(invoke_query_source(tool, "Is the tranche drawn?"))
        for tool in reviewers
    ]
    await asyncio.sleep(0)
    release.set()
    results = await asyncio.gather(*pending)

    assert calls == ["Is the tranche drawn?"]
    assert all(result["success"] for result in results)


def test_long_source_answers_keep_whole_quotations_and_say_what_was_left_out():
    answer = json.dumps(
        {
            "success": True,
            "data": {
                "excerpts": [{"text": "a" * 600, "page": 1}, {"text": "b" * 600, "page": 2}],
                "caveats": [],
            },
        }
    )

    bounded = json.loads(bound_source_answer(answer, 1000))

    assert bounded["data"]["excerpts"] == [{"text": "a" * 600, "page": 1}]
    assert "1 more quotations were left out" in bounded["data"]["caveats"][0]
    assert bound_source_answer(answer, 5000) == answer


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ["propose", "refine"])
async def test_edit_routes_accept_any_bearer_scheme_case(route):
    service = SimpleNamespace(
        propose=AsyncMock(return_value="proposal"),
        repository=SimpleNamespace(get=AsyncMock()),
    )
    run = SimpleNamespace(run_id=uuid4(), user_id="owner", status="active")
    request = EditProposalRequest(instruction="Fill the gaps.", idempotency_key=uuid4())

    if route == "propose":
        await edit_routes.propose_edit(request, run, service, authorization="bearer token-1")
    else:
        await edit_routes.refine_edit_proposal(
            uuid4(), request, run, service, authorization="BEARER token-1"
        )

    assert service.propose.await_args.kwargs["token"] == "token-1"


def test_a_large_rewrite_trims_review_quotations_instead_of_failing():
    def size(value):
        return len(json.dumps(value))

    excerpts = [{"source_index": "1", "text": f"Quotation {i} " + "x" * 80} for i in range(10)]
    payload = {
        "chapter": {"body_markdown": "Body."},
        "run_context": {"source_excerpts": excerpts},
        "changes": [{"before": "b" * 300, "after": "a" * 300}],
    }
    full = size(["prompt", payload])

    assert fit_review_evidence(payload, "prompt", count=size, limit=full) is payload
    trimmed = fit_review_evidence(payload, "prompt", count=size, limit=full - 400)
    kept = trimmed["run_context"]["source_excerpts"]
    assert kept == excerpts[: len(kept)] and 0 < len(kept) < len(excerpts)
    assert trimmed["run_context"]["source_excerpts_omitted"] == len(excerpts) - len(kept)
    assert size(["prompt", trimmed]) <= full - 400
    assert payload["run_context"]["source_excerpts"] == excerpts
    # The chapter and changes alone must still fit; otherwise review stays a context limit.
    assert fit_review_evidence(payload, "prompt", count=size, limit=600) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending", "running"])
async def test_no_edit_is_planned_while_a_new_source_rewrites_chapters(status):
    repository = SimpleNamespace(start=AsyncMock())
    service = ConceptNoteEditService(
        repository, SimpleNamespace(), SimpleNamespace(), workflow_sessions=None
    )

    @asynccontextmanager
    async def locked(run):
        yield SimpleNamespace(
            context_summary={"source_revalidation": {"status": status}}
        ), {}

    service.locked_context = locked
    with pytest.raises(EditOperationError) as error:
        await service._propose(
            SimpleNamespace(run_id=uuid4(), user_id="owner"),
            EditProposalRequest(instruction="Fill the gaps.", idempotency_key=uuid4()),
            token="token",
            recent_messages=None,
        )

    assert error.value.code == "sources_updating"
    repository.start.assert_not_awaited()


@pytest.mark.asyncio
async def test_rejection_objections_persist_and_planning_state_expires():
    async with _workspace_repository() as (_, sessions):
        repository = ConceptNoteEditRepository(sessions)
        run_id = uuid4()

        def request():
            return EditProposalRequest(instruction="Fill the gaps.", idempotency_key=uuid4())

        rejected, _ = await repository.start(run_id=run_id, user_id="owner", request=request())
        assert await edit_planning_in_progress(sessions, run_id)
        objection = EditReviewObjection(
            chapter_title="Financing plan",
            explanation="No supplied source states 70% CPI indexation.",
        )
        await repository.finish(
            run_id=run_id,
            user_id="owner",
            proposal_id=rejected.proposal_id,
            base_revisions={},
            changes=[],
            error_code="unsupported_edit",
            review_objections=[objection],
        )
        restored = await repository.get(
            run_id=run_id, user_id="owner", proposal_id=rejected.proposal_id
        )
        assert restored.status == "failed"
        assert restored.review_objections == [objection]
        assert not await edit_planning_in_progress(sessions, run_id)

        # An interrupted plan must not hold source revalidation back forever.
        abandoned, _ = await repository.start(
            run_id=run_id, user_id="owner", request=request()
        )
        async with sessions() as session, session.begin():
            await session.execute(
                update(ConceptNoteEditProposal)
                .where(ConceptNoteEditProposal.proposal_id == abandoned.proposal_id)
                .values(updated_at=datetime.now(UTC) - timedelta(minutes=11))
            )
        assert not await edit_planning_in_progress(sessions, run_id)


@pytest.mark.asyncio
async def test_chat_tool_reports_proposal_scope_and_source_updates(monkeypatch):
    now = datetime.now(UTC)

    def change(title, start):
        return EditChange(
            change_id=uuid4(),
            chapter_id=uuid4(),
            chapter_title=title,
            base_revision=1,
            start=start,
            before="[Information needed: x]",
            after="Filled.",
            kind="factual",
            group_id="g",
            source_refs=["5"],
        )

    proposal = EditProposalResponse(
        proposal_id=uuid4(),
        run_id=uuid4(),
        instruction="Fill the gaps.",
        scope=EditScope(),
        status="proposed",
        changes=[change("Financing plan", 0), change("Financing plan", 9), change("Risk management", 0)],
        created_at=now,
        updated_at=now,
    )
    service = SimpleNamespace(
        propose=AsyncMock(
            side_effect=[proposal, EditOperationError("sources_updating", "Wait.")]
        )
    )
    monkeypatch.setattr(edit_tools, "get_edit_service", lambda: service)
    monkeypatch.setattr(edit_tools, "CityCatalystClient", lambda **kwargs: None)
    monkeypatch.setattr(
        edit_tools,
        "ConceptNoteRunService",
        lambda session, cc_client: SimpleNamespace(
            get_authorized_run=AsyncMock(return_value="run"),
            cc_client=SimpleNamespace(close=AsyncMock()),
        ),
    )

    @asynccontextmanager
    async def sessions():
        yield None

    [tool] = edit_tools.build_concept_note_edit_tools(
        session_factory=sessions,
        run_id=proposal.run_id,
        user_id="owner",
        token_ref={"value": "token-1"},
        request=EditProposalRequest(instruction="Fill the gaps.", idempotency_key=uuid4()),
    )
    context = ToolContext(
        context=None, tool_name="concept_note_edit_propose", tool_call_id="edit", tool_arguments="{}"
    )

    proposed = json.loads(await tool.on_invoke_tool(context, "{}"))
    assert proposed["data"]["chapters"] == [
        {"title": "Financing plan", "change_count": 2},
        {"title": "Risk management", "change_count": 1},
    ]
    updating = json.loads(await tool.on_invoke_tool(context, "{}"))
    assert updating["error_code"] == "sources_updating"


@pytest.mark.asyncio
async def test_unbound_source_lookup_fails_closed():
    result = json.loads(await unavailable_source_lookup(1, "What is the DSCR?"))
    assert result["success"] is False
    assert result["error_code"] == "source_lookup_unavailable"


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


CITY_CONTEXT = {
    "cc_context": {
        "city": {"name": "Kraków", "population": 1_000_000, "population_year": 2025}
    },
    "manual_population": None,
}
POPULATION_SENTENCE = "Kraków is a large city."


def population_fill(context_refs):
    return {
        "start": 0,
        "before": POPULATION_SENTENCE,
        "after": "Kraków has 1,000,000 residents (2025).",
        "kind": "factual",
        "group_id": "population",
        "context_refs": context_refs,
    }


def test_citycatalyst_context_supports_a_factual_edit_without_user_values():
    current = chapter(f"The city context. {POPULATION_SENTENCE}")
    plan = reviewed_plan(current, [population_fill(["city"])], ["context"])

    changes = validate_edit_plan(
        EditProposalRequest(
            instruction="Add the data about the population please",
            idempotency_key=uuid4(),
        ),
        [current],
        plan,
        CITY_CONTEXT,
    )

    assert changes[0].kind == "factual"
    assert changes[0].source_snapshots == []
    snapshot = changes[0].context_snapshots[0]
    assert snapshot.section == "city"
    assert snapshot.label == "CityCatalyst city profile"
    assert (
        replace_anchors(current.body_markdown, changes)
        == "The city context. Kraków has 1,000,000 residents (2025)."
    )


def test_user_entered_population_is_citable_run_context():
    current = chapter(f"The city context. {POPULATION_SENTENCE}")
    context = {
        **CITY_CONTEXT,
        "manual_population": {
            "population": 1_000_000,
            "year": 2025,
            "source": "user_entered",
        },
    }
    plan = reviewed_plan(current, [population_fill(["manual_population"])], ["context"])

    changes = validate_edit_plan(
        EditProposalRequest(instruction="Add the population", idempotency_key=uuid4()),
        [current],
        plan,
        context,
    )

    assert changes[0].context_snapshots[0].section == "manual_population"


@pytest.mark.parametrize(
    "context_refs,supports,context,code",
    [
        # Citing a section the run does not hold is fabricated evidence.
        (["ghgi"], ["context"], CITY_CONTEXT, "invalid_context"),
        (["city"], ["context"], {"cc_context": {"city": None}}, "invalid_context"),
        # Context support without a cited section cannot pass review.
        ([], ["context"], CITY_CONTEXT, "invalid_context"),
    ],
)
def test_context_provenance_guards(context_refs, supports, context, code):
    current = chapter(f"The city context. {POPULATION_SENTENCE}")
    change = population_fill(context_refs)
    if not context_refs:
        change["user_input_quote"] = "Add the population"
    plan = reviewed_plan(current, [change], supports)

    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            EditProposalRequest(
                instruction="Add the population", idempotency_key=uuid4()
            ),
            [current],
            plan,
            context,
        )
    assert error.value.code == code


def test_planner_input_exposes_manual_population_and_context_refs():
    current = chapter("We serve 10 schools.")
    request = EditProposalRequest(instruction="Add population", idempotency_key=uuid4())
    manual = {"population": 900_000, "year": 2024, "source": "user_entered"}

    payload = build_planner_input(
        request, current, {**CITY_CONTEXT, "manual_population": manual}
    )

    assert payload["run_context"]["manual_population"] == manual
    assert payload["run_context"]["cc_context"]["city"]["population"] == 1_000_000


def test_context_snapshot_changes_when_citycatalyst_data_changes():
    # Accepting an edit compares this fingerprint with the current run context.
    before = context_snapshot(CITY_CONTEXT, "city")
    updated = {
        "cc_context": {
            "city": {**CITY_CONTEXT["cc_context"]["city"], "population_year": 2026}
        }
    }

    assert before == context_snapshot(CITY_CONTEXT, "city")
    assert before != context_snapshot(updated, "city")
    assert context_snapshot(CITY_CONTEXT, "manual_population") is None
