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
    clarification_card,
    followup_card,
    is_clarification_card,
    letter_labels,
    planner_question_cards,
    recent_question_cards,
    referenced_options,
    resolve_letter_options,
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
@pytest.mark.parametrize("picked", [False, True])
async def test_only_an_explicitly_picked_option_can_ground_an_edit(store, picked):
    thread_id = await seed(
        store,
        [
            OPENING_CARD,
            (MessageRole.USER, OPENINGS[0], None),
        ],
    )
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    instruction = (
        "Actually, go with option B instead and put it in the summary."
        if picked
        else "Improve the opening."
    )
    chosen = referenced_options(cards, instruction)
    plan = await plan_opening(instruction, cards, chosen)
    if picked:
        assert plan.changes[0].after == OPENINGS[1].removesuffix(".")
        assert plan.changes[0].user_input_quote == OPENINGS[1]
    else:
        assert Runner.proposal is not None and not Runner.proposal["ok"]
        assert "user_input" in str(Runner.proposal)
        assert plan.changes == []


@pytest.mark.asyncio
async def test_letter_resolution_checks_three_cards(store):
    histories = {
        "pair": [TIMELINE_CARD, OPENING_CARD],
        "repeat": [TIMELINE_CARD, TIMELINE_CARD],
        "different": [
            card(["No", "Yes"], question="Budget?", topic="the budget line"),
            card(["Maybe", "Yes"], question=TIMELINE_QUESTION, topic=TIMELINE_TOPIC),
        ],
        "window": [
            TIMELINE_CARD,
            *(card([f"Edit {i}"], mode="propose_edit") for i in range(3)),
        ],
        "selected": [TIMELINE_CARD, (MessageRole.USER, TIMELINE[0], None)],
    }
    cards_by_history = {}
    for name, rows in histories.items():
        thread_id = await seed(store, rows)
        cards_by_history[name] = await recent_question_cards(
            store, thread_id=thread_id, user_id="owner"
        )

    for setup, instruction, expected_choice, expected_ambiguity in [
        ("pair", "Go with B instead.", [], [OPENINGS[1], TIMELINE[1]]),
        ("pair", "Option B on the timeline.", [TIMELINE[1]], []),
        ("pair", "Use option B for the opening.", [OPENINGS[1]], []),
        ("pair", "Use option C.", [TIMELINE[2]], []),
        ("pair", "That one.", [], []),
        ("pair", "Use A table instead of text.", [], []),
        ("repeat", "Option B", [TIMELINE[1]], []),
        ("different", "Option B", [], ["Yes", "Yes"]),
        ("window", "Option B", [], []),
    ]:
        resolved, ambiguous = resolve_letter_options(
            cards_by_history[setup], instruction
        )
        assert [source["text"] for source in resolved] == expected_choice, instruction
        assert [source["text"] for source in ambiguous] == expected_ambiguity, (
            instruction
        )
        if setup == "different":
            assert {source["document_topic"] for source in ambiguous} == {
                "the budget line",
                TIMELINE_TOPIC,
            }

    selected = cards_by_history["selected"]
    assert referenced_options(selected, "Go with B instead.") == TIMELINE[:2]
    assert referenced_options(selected, "I want to answer a few things") == TIMELINE[:1]
    assert referenced_options([], "option B") == []


async def add_message(factory, thread_id, role, text, *, seconds=1):
    """Persist a later row, as the route does for the user's clicked answer."""
    async with factory() as session, session.begin():
        session.add(
            Message(
                message_id=uuid4(),
                thread_id=thread_id,
                user_id="owner",
                text=text,
                role=role,
                created_at=datetime.now(UTC) + timedelta(seconds=seconds),
            )
        )


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
    plan = await plan_opening(action, cards, referenced_options(cards, action))
    assert plan.changes[0].user_input_quote == OPENINGS[1]


@pytest.mark.asyncio
@pytest.mark.parametrize("edit", [True, False])
async def test_ambiguous_reference_saves_clarification_without_running_model(
    store, stream_turn, edit
):
    instruction = "Go with B instead."
    thread_id = await seed(
        store, [TIMELINE_CARD, OPENING_CARD, (MessageRole.USER, instruction, None)]
    )
    result = await stream_turn(thread_id, edit_payload(instruction, edit=edit))
    assert result.kwargs is None
    question, _, _ = await saved_card(store, result)
    assert question.on_answer == "reply"
    assert question.options == [
        f"B · {OPENING_QUESTION} · “{OPENINGS[1]}”",
        f"B · {TIMELINE_TOPIC} · “{TIMELINE[1]}”",
    ]

    choice = question.options[1]
    await add_message(store, thread_id, MessageRole.USER, choice)
    result = await stream_turn(thread_id, edit_payload(choice, edit=edit))
    assert result.kwargs["concept_note_edit_request"] is None
    (confirmation,) = option_cards(result.events)
    assert confirmation["on_answer"] == "propose_edit"
    assert confirmation["options"] == [
        f"Update {TIMELINE_TOPIC} to reflect “{TIMELINE[1]}”"
    ]


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


def test_long_clarification_labels_keep_distinct_options():
    prefix = "Long shared answer. " * 100  # exactly 2,000 characters
    first = {
        "question": OPENING_QUESTION,
        "document_topic": None,
        "label": "A",
        "text": prefix + "First ending.",
        "on_answer": "reply",
    }
    second = {**first, "label": "B", "text": prefix + "Second ending."}
    presentation = clarification_card([first, second], "en")
    options = presentation.question.options
    assert len(set(options)) == 2
    for option in options:
        EditProposalRequest(instruction=option, idempotency_key=uuid4())
    assert [source["text"] for source in presentation.sources] == [
        first["text"],
        second["text"],
    ]


@pytest.mark.parametrize(
    ("instruction", "labels"),
    [
        ("option b", ["B"]),
        ("choice (c)", ["C"]),
        ("Go with B instead", ["B"]),
        ("Option B on the timeline.", ["B"]),
        ("Use option c, please.", ["C"]),
        ("Pick (a) and then option D", ["A", "D"]),
        ("Could you give me an option a bit more formal?", []),
        ("Is there a choice a reader would trust?", []),
        ("Add an option c for the budget.", []),
        ("Use A table instead of text.", []),
        ("Go with a shorter opening.", []),
        ("Option A's wording is fine.", []),
    ],
)
def test_only_choice_commands_name_answer_letters(instruction, labels):
    assert letter_labels(instruction) == labels


@pytest.mark.asyncio
async def test_plain_request_mentioning_an_option_reaches_the_model(
    store, stream_turn
):
    instruction = "Could you give me an option a bit more formal?"
    thread_id = await seed(
        store, [TIMELINE_CARD, OPENING_CARD, (MessageRole.USER, instruction, None)]
    )
    result = await stream_turn(
        thread_id, edit_payload(instruction, edit=False), text="Here is one."
    )
    assert result.kwargs is not None
    assert not option_cards(result.events)


@pytest.mark.asyncio
async def test_typed_letters_skip_clarification_cards_but_clicks_still_resolve(
    store, stream_turn
):
    budget = card(
        ["Grant only", "Loan only"], question="Which funding?", topic="the budget line"
    )
    instruction = "Go with B instead."
    thread_id = await seed(
        store,
        [TIMELINE_CARD, OPENING_CARD, budget, (MessageRole.USER, instruction, None)],
    )
    result = await stream_turn(thread_id, edit_payload(instruction))
    question, _, _ = await saved_card(store, result)
    assert len(question.options) == 3

    # The clarification is the newest card, yet typed letters still reach all
    # three source cards and never the clarification's own entries.
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    assert is_clarification_card(cards[-1])
    assert not any(is_clarification_card(item) for item in cards[:-1])
    resolved, ambiguous = resolve_letter_options(cards, "Option C")
    assert [source["text"] for source in resolved] == [TIMELINE[2]] and not ambiguous
    _, ambiguous = resolve_letter_options(cards, "option a")
    assert {source["text"] for source in ambiguous} == {
        TIMELINE[0],
        OPENINGS[0],
        "Grant only",
    }

    # Clicking a clarification option still follows it to the saved source.
    choice = next(option for option in question.options if TIMELINE[1] in option)
    await add_message(store, thread_id, MessageRole.USER, choice)
    result = await stream_turn(thread_id, edit_payload(choice))
    (confirmation,) = option_cards(result.events)
    assert confirmation["options"] == [
        f"Update {TIMELINE_TOPIC} to reflect “{TIMELINE[1]}”"
    ]


def test_clarification_labels_are_plain_text_and_sources_keep_full_answers():
    overview = {
        "question": "**3 of 3 chapters drafted.** See [the guide](https://example.org/guide).",
        "document_topic": None,
        "label": "A",
        "text": "Use **quarters**, see https://example.org/x and [the table](https://e.org/t)."
        + " More detail." * 100,
        "on_answer": "reply",
    }
    topical = {**overview, "document_topic": "the budget line", "text": "Grant only"}
    presentation = clarification_card([overview, topical], "en")
    first, second = presentation.question.options
    assert first.startswith(
        "A · 3 of 3 chapters drafted. See the guide. · “Use quarters, see and the table. More"
    )
    assert len(first) < 320
    assert second == "A · the budget line · “Grant only”"
    for label in (first, second):
        assert not any(mark in label for mark in ("**", "](", "http"))
    assert [source["text"] for source in presentation.sources] == [
        overview["text"],
        "Grant only",
    ]
