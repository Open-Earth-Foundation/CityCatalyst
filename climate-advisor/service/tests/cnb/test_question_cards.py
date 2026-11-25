"""Suggested-answer cards decide whether a pick edits and tell the planner what it means."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from agents.tool_context import ToolContext
from app.models.cnb.concept_note_edits import (
    ChapterEditReview,
    EditAgentOutput,
    EditProposalRequest,
)
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.models.requests import MessageCreateRequest
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.edit_planner import ConceptNoteEditPlanner
from app.services.cnb.question_reply import (
    QUESTION_CHOICE_SOURCES,
    followup_card,
    planner_question_cards,
    recent_question_cards,
    referenced_options,
)
from app.tools.concept_note_question import saved_question
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.streaming_events import handle_raw_response, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from tests.cnb.test_edit_review_boundary import StreamingTestRunner
from tests.cnb.test_question_reply import answer, card_tools, seed_card
from tests.cnb.test_question_reply import store as store  # noqa: PLC0414 (pytest fixture re-export)
from tests.streaming_fixtures import _parse_sse_payload

from app.config import get_settings

TIMELINE = ["Quarters throughout", "Months throughout", "Quarters, months in year one"]
OPENINGS = [
    "Harbor Point faces rising heat and recurrent street flooding.",
    "Cooler streets and better drainage are at the heart of the plan.",
]


TIMELINE_QUESTION = "Which timeline format?"
TIMELINE_TOPIC = "the implementation timeline"
OPENING_QUESTION = "Which project opening should I put in?"
ACTION = "Update the implementation timeline to reflect “Quarters throughout”"


def card(options, *, question="Which one?", topic=None, mode=None):
    return (
        MessageRole.ASSISTANT,
        question,
        card_tools(options, mode, message=question, document_topic=topic),
    )


TIMELINE_CARD = card(TIMELINE, question=TIMELINE_QUESTION, topic=TIMELINE_TOPIC)
OPENING_CARD = card(OPENINGS, question=OPENING_QUESTION)


async def seed(factory, rows):
    """Store (role, text, tools) rows in order and return the thread id."""
    thread_id = uuid4()
    start = datetime.now(UTC) - timedelta(minutes=5)
    async with factory() as session, session.begin():
        session.add(Thread(thread_id=thread_id, user_id="owner", context={}))
        await session.flush()
        for index, (role, text, tools) in enumerate(rows):
            session.add(
                Message(
                    message_id=uuid4(),
                    thread_id=thread_id,
                    user_id="owner",
                    text=text,
                    role=role,
                    tools_used=tools,
                    created_at=start + timedelta(seconds=index),
                )
            )
    return thread_id


@pytest.mark.asyncio
async def test_cards_load_with_answers_labels_and_legacy_reply_mode(store):
    thread_id = await seed(
        store,
        [
            TIMELINE_CARD,
            (MessageRole.USER, " quarters   throughout ", None),
            card(OPENINGS, question=OPENING_QUESTION, mode="propose_edit"),
        ],
    )
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    assert [card["on_answer"] for card in cards] == ["reply", "propose_edit"]
    assert cards[0]["options"][1] == {"label": "B", "text": "Months throughout"}
    assert cards[0]["selected_label"] == "A"
    assert cards[1]["answer"] is None and cards[1]["selected_label"] is None
    # Another user's thread rows never become cards for this user.
    assert await recent_question_cards(store, thread_id=thread_id, user_id="x") == []


def snapshot(body: str) -> WorkspaceChapterSnapshot:
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=None,
        title="Project summary",
        position=0,
        status="needs_review",
        required=True,
        user_locked=False,
        body_markdown=body,
        revision_number=1,
    )


class Runner(StreamingTestRunner):
    proposal: dict | None = None

    @classmethod
    async def run(cls, agent, payload, **kwargs):
        if agent.output_type is EditAgentOutput:
            tools = {tool.name: tool for tool in agent.tools}
            found = await tools["search_draft"].on_invoke_tool(
                ToolContext(
                    context=None,
                    tool_name="search_draft",
                    tool_call_id="search",
                    tool_arguments="{}",
                ),
                json.dumps({"text": "Old opening.", "chapter_positions": None}),
            )
            proposed = await tools["propose_edits"].on_invoke_tool(
                ToolContext(
                    context=None,
                    tool_name="propose_edits",
                    tool_call_id="propose",
                    tool_arguments="{}",
                ),
                json.dumps(
                    {
                        "replacements": [
                            {
                                "search_id": found["search_id"],
                                "replacement": OPENINGS[1],
                                "match_ids": [],
                                "kind": "factual",
                                "group_id": "opening",
                                "source_refs": [],
                                # Option B is quoted although the user only typed a letter.
                                "user_input_quote": OPENINGS[1],
                            }
                        ]
                    }
                ),
            )
            cls.proposal = proposed
            if not proposed["ok"]:
                return SimpleNamespace(
                    final_output=EditAgentOutput(
                        intent="clarification",
                        clarification="Which opening did you mean?",
                    )
                )
            return SimpleNamespace(final_output=EditAgentOutput(intent="edit"))
        return SimpleNamespace(
            final_output=ChapterEditReview(
                decisions=[
                    {
                        "change_index": 0,
                        "support": "user",
                        "explanation": "The user picked option B.",
                    }
                ]
            )
        )


async def plan_opening(instruction, cards, chosen):
    Runner.proposal = None
    settings = get_settings().model_copy(update={"openrouter_api_key": "test-key"})
    return await ConceptNoteEditPlanner(settings, runner=Runner).plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [snapshot("Old opening. Other text.")],
        {},
        question_cards=planner_question_cards(cards),
        chosen_options=chosen,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("clicked", [False, True])
async def test_only_a_clicked_option_can_ground_an_edit(store, clicked):
    # A typed "option B" reaches the planner but is not human input for B's words.
    instruction = OPENINGS[1] if clicked else "Actually, go with option B instead."
    thread_id = await seed(
        store,
        [
            OPENING_CARD,
            (MessageRole.USER, OPENINGS[1] if clicked else OPENINGS[0], None),
        ],
    )
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    chosen = referenced_options(cards)
    assert chosen == [OPENINGS[1] if clicked else OPENINGS[0]]
    plan = await plan_opening(instruction, cards, chosen)
    if clicked:
        assert plan.changes[0].after == OPENINGS[1].removesuffix(".")
        assert plan.changes[0].user_input_quote == OPENINGS[1]
    else:
        assert Runner.proposal is not None and not Runner.proposal["ok"]
        assert "user_input" in str(Runner.proposal)
        assert plan.changes == []


def test_chosen_options_are_clicks_on_the_three_recent_cards():
    def saved(texts, selected):
        return {
            "question": "Which one?",
            "document_topic": None,
            "options": [
                {"label": label, "text": text}
                for label, text in zip("ABC", texts, strict=False)
            ],
            "on_answer": "reply",
            "selected_label": selected,
            "choice_sources": [],
        }

    cards = [
        saved(OPENINGS, "B"),
        saved(TIMELINE, "A"),
        saved(TIMELINE, "A"),
        saved(["Grant only", "Loan only"], None),
    ]
    assert referenced_options(cards) == [TIMELINE[0]]
    assert referenced_options(cards[:1]) == [OPENINGS[1]]
    assert referenced_options([]) == []


async def saved_message(factory, message_id):
    async with factory() as session:
        return await session.get(Message, UUID(str(message_id)))


def edit_payload(content, *, edit=True):
    context = {"ui_locale": "en"}
    if edit:
        context["concept_note_edit"] = {"idempotency_key": str(uuid4())}
    return MessageCreateRequest(user_id="owner", content=content, context=context)


@pytest.fixture
def stream_turn(store, monkeypatch, chat_service):
    """Run the real card stream with deterministic model text and tool output."""
    service = Mock(return_value=chat_service)
    monkeypatch.setattr("app.utils.streaming_agent.AgentService", service)

    async def run(thread_id, payload, *, text="", model_card=None, claim=None):
        service.reset_mock()

        async def scripted(handler, _agent, _payload, _history):
            if text:
                chunk = SimpleNamespace(
                    data=SimpleNamespace(
                        type="response.output_text.delta",
                        delta=text,
                    )
                )
                async for event in handle_raw_response(handler, chunk):
                    yield event
            if model_card is not None:
                handler.tool_invocations.append(
                    {
                        "id": "call",
                        "name": "concept_note_ask_question",
                        "status": "executing",
                    }
                )
                item = SimpleNamespace(
                    raw_item={"call_id": "call"}, output=json.dumps(model_card)
                )
                async for event in handle_tool_output(handler, item):
                    yield event

        monkeypatch.setattr("app.utils.streaming_handler.stream_agent_events", scripted)
        handler = StreamingHandler(
            thread_id, "owner", store, question_reply_claim=claim
        )
        handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
        events = [
            _parse_sse_payload(chunk)
            async for chunk in handler._stream_response_with_mlflow(
                payload=payload,
                history_warning=None,
                req_id="card-test",
                settings=get_settings(),
                started_at=0.0,
            )
        ]
        return SimpleNamespace(
            events=events,
            kwargs=service.call_args.kwargs if service.called else None,
        )

    return run


async def saved_card(store, run):
    done = run.events[-1]
    assert done["event"] == "done"
    assert done["data"]["history_saved"]
    row = await saved_message(store, done["data"]["assistant_message_id"])
    (tool,) = [t for t in row.tools_used if t["name"] == "concept_note_ask_question"]
    return saved_question([tool]), tool, row.message_id


def option_cards(events):
    return [
        event["data"]
        for event in events
        if event["event"] == "tool_result" and "options" in event["data"]
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mode", "options"),
    [
        (None, []),
        ("propose_edit", [ACTION]),
        ("reply", ["Yes", "No"]),
        ("propose_edit", ["Shorten the budget"]),
    ],
)
async def test_document_reply_stream_finishes_with_one_edit_card(
    store, stream_turn, mode, options
):
    thread_id = await seed(
        store, [TIMELINE_CARD, (MessageRole.USER, TIMELINE[0], None)]
    )
    model_card = {
        "message": "Model confirmation?",
        "options": options,
        "on_answer": mode,
    }
    result = await stream_turn(
        thread_id,
        edit_payload(TIMELINE[0]),
        text="Quarters fit the timeline.",
        model_card=model_card if mode else None,
    )

    assert result.kwargs["concept_note_edit_request"] is None
    (visible,) = option_cards(result.events)
    assert visible["options"] == [ACTION]
    assert visible["on_answer"] == "propose_edit"
    published = "".join(
        event["data"]["content"]
        for event in result.events
        if event["event"] == "message"
    )
    assert "Quarters fit the timeline." in published
    assert ("Model confirmation?" in published) == (options == [ACTION])
    question, tool, _ = await saved_card(store, result)
    assert question.options == [ACTION]
    assert tool[QUESTION_CHOICE_SOURCES][0]["text"] == TIMELINE[0]
    assert all(
        QUESTION_CHOICE_SOURCES not in tool
        for tool in result.events[-1]["data"]["tools_used"]
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("history_card", "reply", "expects_edit"),
    [
        (
            card(["Keep option B as drafted", "Start over"]),
            "Keep option B as drafted",
            False,
        ),
        (TIMELINE_CARD, "Use quarters and update the implementation table now.", True),
    ],
)
async def test_non_document_and_custom_replies_keep_existing_routing(
    store, stream_turn, history_card, reply, expects_edit
):
    thread_id = await seed(store, [history_card, (MessageRole.USER, reply, None)])
    result = await stream_turn(thread_id, edit_payload(reply), text="Noted.")
    assert bool(result.kwargs["concept_note_edit_request"]) == expects_edit
    assert not option_cards(result.events)


@pytest.mark.asyncio
async def test_confirmation_click_supplies_original_answer_as_user_input(
    store, stream_turn
):
    tools = card_tools(
        OPENINGS, message=OPENING_QUESTION, document_topic="the project opening"
    )
    thread_id, question_id = await seed_card(
        store, question=OPENING_QUESTION, tools=tools
    )
    first = await answer(store, thread_id, question_id, OPENINGS[1])
    result = await stream_turn(thread_id, edit_payload(OPENINGS[1]), claim=first)
    question, _, confirmation_id = await saved_card(store, result)
    action = f"Update the project opening to reflect “{OPENINGS[1]}”"
    assert question.options == [action]

    second = await answer(store, thread_id, confirmation_id, action)
    result = await stream_turn(thread_id, edit_payload(action), claim=second)
    assert result.kwargs["concept_note_edit_request"] is not None
    cards = result.kwargs["concept_note_question_cards"]
    plan = await plan_opening(action, cards, referenced_options(cards))
    assert plan.changes[0].user_input_quote == OPENINGS[1]


def test_card_locale_resolves_regional_tags_and_falls_back_to_english():
    source = {
        "question": "Which timeline format?",
        "document_topic": TIMELINE_TOPIC,
        "label": "A",
        "text": TIMELINE[0],
        "on_answer": "reply",
    }
    english = followup_card(source, "en").question
    portuguese = followup_card(source, "pt").question
    assert portuguese.message != english.message
    assert portuguese.options != english.options
    assert followup_card(source, "pt-BR").question == portuguese
    assert followup_card(source, "ja").question == english


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "instruction",
    ["Could you give me an option a bit more formal?", "Go with B instead."],
)
async def test_typed_text_mentioning_an_option_reaches_the_model(
    store, stream_turn, instruction
):
    thread_id = await seed(
        store, [TIMELINE_CARD, OPENING_CARD, (MessageRole.USER, instruction, None)]
    )
    result = await stream_turn(
        thread_id, edit_payload(instruction, edit=False), text="Here is one."
    )
    assert result.kwargs is not None
    assert not option_cards(result.events)
