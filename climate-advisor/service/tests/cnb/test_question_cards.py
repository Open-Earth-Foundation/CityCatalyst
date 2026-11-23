"""Suggested-answer cards decide whether a pick edits and tell the planner what it means."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import ClassVar
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from agents.tool_context import ToolContext
from app.config import get_settings
from app.db import Base
from app.models.cnb.concept_note_edits import (
    ChapterEditReview,
    EditAgentOutput,
    EditProposalRequest,
)
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.models.requests import MessageCreateRequest
from app.services.cnb.edit_planner import ConceptNoteEditPlanner
from app.services.cnb.question_reply import (
    CARD_SELECTION_HEADER,
    QUESTION_CHOICE_SOURCES,
    clarification_card,
    followup_card,
    planner_question_cards,
    recent_question_cards,
    referenced_options,
    resolve_letter_options,
    save_question_reply,
)
from app.services.thread_service import ThreadService
from app.tools.concept_note_question import saved_question
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.streaming_agent import prepare_stream_agent
from app.utils.streaming_events import handle_raw_response, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from tests.cnb.test_question_reply import seed_card
from tests.streaming_fixtures import _parse_sse_payload

TIMELINE = ["Quarters throughout", "Months throughout", "Quarters, months in year one"]
OPENINGS = [
    "Harbor Point faces rising heat and recurrent street flooding.",
    "Cooler streets and better drainage are at the heart of the plan.",
]


def card_tools(options, on_answer=None, *, message="Which one?", document_topic=None):
    result = {"message": message, "options": options}
    if on_answer:
        result["on_answer"] = on_answer
    if document_topic:
        result["document_topic"] = document_topic
    return [{"name": "concept_note_ask_question", "result_json": result}]


@pytest_asyncio.fixture
async def store(tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'cards.db').as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


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
            (MessageRole.USER, "Quarters or months?", None),
            (MessageRole.ASSISTANT, "Which one?", card_tools(TIMELINE)),
            (MessageRole.USER, " quarters   throughout ", None),
            (MessageRole.ASSISTANT, "Noted.", None),
            (
                MessageRole.ASSISTANT,
                "Which opening should I put in?",
                card_tools(OPENINGS, "propose_edit"),
            ),
        ],
    )
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    assert [card["on_answer"] for card in cards] == ["reply", "propose_edit"]
    assert cards[0]["options"][1] == {"label": "B", "text": "Months throughout"}
    assert cards[0]["selected_label"] == "A"
    assert cards[1]["answer"] is None and cards[1]["selected_label"] is None
    # Another user's thread rows never become cards for this user.
    assert await recent_question_cards(store, thread_id=thread_id, user_id="x") == []


def test_letter_references_resolve_against_the_latest_card():
    cards = [
        {
            "question": "Which timeline format?",
            "on_answer": "reply",
            "options": [
                {"label": label, "text": text} for label, text in zip("ABC", TIMELINE)
            ],
            "answer": TIMELINE[0],
            "selected_label": "A",
        }
    ]
    assert referenced_options(cards, "Actually, go with option B instead") == [
        TIMELINE[0],
        TIMELINE[1],
    ]
    assert TIMELINE[2] in referenced_options(cards, "Go with C instead.")
    # Ordinary words are not letters.
    assert referenced_options(cards, "I want to answer a few things") == [TIMELINE[0]]
    assert referenced_options(cards, "Use A table instead of text") == [TIMELINE[0]]
    assert referenced_options([], "option B") == []


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


class Runner:
    payloads: ClassVar[list[dict]] = []

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

    @classmethod
    async def run(cls, agent, payload, **kwargs):
        data = json.loads(payload)
        cls.payloads.append(data)
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
            assert proposed["ok"], proposed
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


@pytest.mark.asyncio
async def test_planner_and_reviewer_see_the_cards_and_may_quote_a_picked_option():
    Runner.payloads = []
    cards = [
        {
            "message_id": str(uuid4()),
            "question": "Which opening do you prefer?",
            "options": [
                {"label": label, "text": text} for label, text in zip("AB", OPENINGS)
            ],
            "on_answer": "reply",
            "answer": OPENINGS[0],
            "selected_label": "A",
        }
    ]
    instruction = "Actually, go with option B instead and put it in the summary."
    chosen = referenced_options(cards, instruction)
    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    plan = await ConceptNoteEditPlanner(settings, runner=Runner).plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [snapshot("Old opening. Other text.")],
        {},
        question_cards=planner_question_cards(cards),
        chosen_options=chosen,
    )
    # The server trims unchanged context, such as the shared final period.
    assert plan.changes[0].after == OPENINGS[1].removesuffix(".")
    assert plan.changes[0].user_input_quote == OPENINGS[1]
    planning, review = Runner.payloads
    assert planning["question_cards"][0]["options"][1]["label"] == "B"
    assert planning["question_cards"][0]["selected_label"] == "A"
    assert "message_id" not in json.dumps(planning["question_cards"])
    assert planning["chosen_options"] == chosen
    assert review["chosen_options"] == chosen


@pytest.mark.asyncio
async def test_without_a_pick_an_assistant_option_is_not_user_input():
    Runner.payloads = []
    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    with pytest.raises(AssertionError, match="user_input"):
        await ConceptNoteEditPlanner(settings, runner=Runner).plan(
            EditProposalRequest(instruction="Improve it.", idempotency_key=uuid4()),
            [snapshot("Old opening. Other text.")],
            {},
            question_cards=[],
            chosen_options=[],
        )


# Card choices across the three-card window and the server-owned confirmation.
TIMELINE_TOPIC = "the implementation timeline"
OPENING_QUESTION = "Which project opening should I put in?"
ACTION = "Update the implementation timeline to reflect “Quarters throughout”"


@pytest.mark.asyncio
async def test_letter_resolution_checks_three_cards(store):
    cases = [
        # (rows, instruction, expected resolved texts, expected ambiguous texts)
        (
            "pair",
            "Go with B instead.",
            [],
            [OPENINGS[1], TIMELINE[1]],
        ),
        ("pair", "Option B on the timeline.", [TIMELINE[1]], []),
        ("pair", "Use option B for the opening.", [OPENINGS[1]], []),
        ("pair", "Use option C.", [TIMELINE[2]], []),
        ("pair", "That one.", [], []),
        ("pair", "Use A table instead of text.", [], []),
        ("repeat", "Option B", [TIMELINE[1]], []),
        ("different", "Option B", [], ["Yes", "Yes"]),
        ("window", "Option B", [], []),
    ]
    for setup, instruction, resolved_texts, ambiguous_texts in cases:
        thread_id = await seed(store, rows_for(setup))
        cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
        resolved, ambiguous = resolve_letter_options(cards, instruction)
        assert [source["text"] for source in resolved] == resolved_texts, instruction
        assert [source["text"] for source in ambiguous] == ambiguous_texts, instruction
        if setup == "pair" and instruction == "Option B":
            assert referenced_options(cards, instruction) == []
    # Two distinct topics answer "Yes" as B; the competing meanings are both returned.
    thread_id = await seed(store, rows_for("different"))
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    _, ambiguous = resolve_letter_options(cards, "Option B")
    assert len({source["document_topic"] for source in ambiguous}) == 2


def rows_for(setup):
    """Build the saved card history used by the letter-resolution table."""
    timeline = card_tools(
        TIMELINE, message="Which timeline format?", document_topic=TIMELINE_TOPIC
    )
    opening = card_tools(OPENINGS, message=OPENING_QUESTION)
    if setup == "pair":
        return [
            (MessageRole.ASSISTANT, "Timeline?", timeline),
            (MessageRole.ASSISTANT, "Opening?", opening),
        ]
    if setup == "repeat":
        return [
            (MessageRole.ASSISTANT, "Timeline?", timeline),
            (MessageRole.ASSISTANT, "Timeline?", timeline),
        ]
    if setup == "different":
        return [
            (
                MessageRole.ASSISTANT,
                "Budget?",
                card_tools(
                    ["No", "Yes"], message="Budget?", document_topic="the budget line"
                ),
            ),
            (
                MessageRole.ASSISTANT,
                "Timeline?",
                card_tools(
                    ["Maybe", "Yes"], message="Timeline?", document_topic=TIMELINE_TOPIC
                ),
            ),
        ]
    return [
        (MessageRole.ASSISTANT, "Timeline?", timeline),
        *[
            (
                MessageRole.ASSISTANT,
                f"Edit {i}?",
                card_tools([f"Edit {i}"], "propose_edit"),
            )
            for i in range(3)
        ],
    ]


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


async def stream_turn(
    factory, monkeypatch, chat_service, thread_id, payload, script, *, claim=None
):
    """Run the real CNB stream with a scripted model and return what it published."""
    service = Mock(return_value=chat_service)
    monkeypatch.setattr("app.utils.streaming_agent.AgentService", service)
    seen = {}

    async def scripted(handler, agent, request_payload, history):
        seen["history"] = list(history)
        async for event_bytes in script(handler):
            yield event_bytes

    monkeypatch.setattr("app.utils.streaming_handler.stream_agent_events", scripted)
    handler = StreamingHandler(thread_id, "owner", factory, question_reply_claim=claim)
    handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
    from app.config import get_settings

    chunks = [
        chunk
        async for chunk in handler._stream_response_with_mlflow(
            payload=payload,
            history_warning=None,
            req_id="card-test",
            settings=get_settings(),
            started_at=0.0,
        )
    ]
    return SimpleNamespace(
        events=[_parse_sse_payload(chunk) for chunk in chunks],
        handler=handler,
        kwargs=service.call_args.kwargs if service.called else None,
        history=seen.get("history"),
    )


def prose_only(text="Quarters fit the timeline."):
    async def script(handler):
        chunk = SimpleNamespace(
            data=SimpleNamespace(type="response.output_text.delta", delta=text)
        )
        async for event_bytes in handle_raw_response(handler, chunk):
            yield event_bytes

    return script


def published_text(events):
    return "".join(
        event["data"]["content"] for event in events if event["event"] == "message"
    )


def option_cards(events):
    return [
        event["data"]
        for event in events
        if event["event"] == "tool_result" and "options" in event["data"]
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["none", "matching", "wrong_action", "different_edit"])
async def test_document_reply_stream_finishes_with_one_edit_card(
    store, chat_service, monkeypatch, case
):
    thread_id = await seed(
        store,
        [
            (
                MessageRole.ASSISTANT,
                "Which timeline format?",
                card_tools(
                    TIMELINE,
                    message="Which timeline format?",
                    document_topic=TIMELINE_TOPIC,
                ),
            ),
            (MessageRole.USER, TIMELINE[0], None),
        ],
    )
    model = {
        "none": None,
        "matching": {
            "message": "Model confirmation?",
            "options": [ACTION],
            "on_answer": "propose_edit",
        },
        "wrong_action": {
            "message": "Model confirmation?",
            "options": ["Yes", "No"],
            "on_answer": "reply",
        },
        "different_edit": {
            "message": "Model confirmation?",
            "options": ["Shorten the budget"],
            "on_answer": "propose_edit",
        },
    }[case]

    async def script(handler):
        async for event_bytes in prose_only()(handler):
            yield event_bytes
        if model is not None:
            handler.tool_invocations.append(
                {
                    "id": "call",
                    "name": "concept_note_ask_question",
                    "status": "executing",
                }
            )
            item = SimpleNamespace(
                raw_item={"call_id": "call"}, output=json.dumps(model)
            )
            async for event_bytes in handle_tool_output(handler, item):
                yield event_bytes

    run = await stream_turn(
        store, monkeypatch, chat_service, thread_id, edit_payload(TIMELINE[0]), script
    )
    events = run.events
    assert run.kwargs["concept_note_edit_request"] is None
    selection = [
        m for m in run.history if m["content"].startswith(CARD_SELECTION_HEADER)
    ]
    assert len(selection) == 1
    assert json.loads(selection[0]["content"].split("\n", 1)[1]) == {
        "selection": {
            "question": "Which timeline format?",
            "document_topic": TIMELINE_TOPIC,
            "label": "A",
            "text": TIMELINE[0],
            "on_answer": "reply",
        },
        "followup_option": ACTION,
    }
    cards = option_cards(events)
    assert len(cards) == 1
    assert cards[0]["options"] == [ACTION]
    assert cards[0]["on_answer"] == "propose_edit"
    published = published_text(events)
    assert "Quarters fit the timeline." in published
    if case == "matching":
        assert "Model confirmation?" in published
    else:
        assert "Model confirmation?" not in published
        assert "Would you like me to prepare this change for review?" in published
    wire = json.dumps([event["data"] for event in events])
    assert "Shorten the budget" not in wire
    assert '"Yes"' not in wire
    done = events[-1]
    assert done["event"] == "done"
    assert done["data"]["history_saved"] is True
    assert all(
        QUESTION_CHOICE_SOURCES not in tool for tool in done["data"]["tools_used"]
    )
    saved = await saved_message(store, done["data"]["assistant_message_id"])
    assert saved_question(saved.tools_used).options == [ACTION]
    questions = [
        t for t in saved.tools_used if t["name"] == "concept_note_ask_question"
    ]
    assert len(questions) == 1
    assert questions[0][QUESTION_CHOICE_SOURCES] == [
        {
            "question": "Which timeline format?",
            "document_topic": TIMELINE_TOPIC,
            "label": "A",
            "text": TIMELINE[0],
            "on_answer": "reply",
        }
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("options", "document_topic", "reply", "expects_edit"),
    [
        # An unmarked card's exact pick, whose text contains "option B", stays an ordinary reply.
        (
            ["Keep option B as drafted", "Start over"],
            None,
            "Keep option B as drafted",
            False,
        ),
        # A custom answer on a marked card still goes to the normal edit path.
        (
            TIMELINE,
            TIMELINE_TOPIC,
            "Use quarters and update the implementation table now.",
            True,
        ),
    ],
)
async def test_non_document_and_custom_replies_keep_existing_routing(
    store, chat_service, monkeypatch, options, document_topic, reply, expects_edit
):
    thread_id = await seed(
        store,
        [
            (
                MessageRole.ASSISTANT,
                "Which one?",
                card_tools(options, document_topic=document_topic),
            ),
            (MessageRole.USER, reply, None),
        ],
    )
    run = await stream_turn(
        store,
        monkeypatch,
        chat_service,
        thread_id,
        edit_payload(reply),
        prose_only("Noted."),
    )
    assert not any(m["content"].startswith(CARD_SELECTION_HEADER) for m in run.history)
    assert option_cards(run.events) == []
    if expects_edit:
        assert run.kwargs["concept_note_edit_request"] is not None
    else:
        assert run.kwargs["concept_note_edit_request"] is None


@pytest.mark.asyncio
async def test_confirmation_click_supplies_original_answer_as_user_input(
    store, chat_service, monkeypatch
):
    thread_id, question_id = await seed_card(store)
    async with store() as session, session.begin():
        row = await session.get(Message, question_id)
        row.text = "Which project opening do you prefer?"
        row.tools_used = card_tools(
            OPENINGS,
            message="Which project opening do you prefer?",
            document_topic="the project opening",
        )

    async def click(message_id, content):
        async with store() as session, session.begin():
            thread = await ThreadService(session).get_thread(thread_id, for_update=True)
            return await save_question_reply(
                session,
                thread=thread,
                question_id=message_id,
                content=content,
                retry=False,
            )

    # The first pick saves the choice; its turn publishes the one-button confirmation.
    first = await click(question_id, OPENINGS[1])
    first_run = await stream_turn(
        store,
        monkeypatch,
        chat_service,
        thread_id,
        edit_payload(OPENINGS[1]),
        prose_only(""),
        claim=first,
    )
    confirmation_id = first_run.events[-1]["data"]["assistant_message_id"]
    confirmation = saved_question(
        (await saved_message(store, confirmation_id)).tools_used
    )
    assert confirmation.options == [
        "Update the project opening to reflect “" + OPENINGS[1] + "”"
    ]

    # The second click sends that one option; prepare_stream_agent loads the linked card.
    second = await click(UUID(confirmation_id), confirmation.options[0])
    handler = StreamingHandler(thread_id, "owner", store, question_reply_claim=second)
    handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
    service = Mock(return_value=chat_service)
    monkeypatch.setattr("app.utils.streaming_agent.AgentService", service)
    from app.config import get_settings

    settings = get_settings()
    await prepare_stream_agent(
        handler, settings, edit_payload(confirmation.options[0]), "card-test"
    )
    kwargs = service.call_args.kwargs
    assert kwargs["concept_note_edit_request"] is not None
    cards = kwargs["concept_note_question_cards"]
    assert cards
    chosen = referenced_options(cards, confirmation.options[0])
    planner_cards = planner_question_cards(cards)
    assert planner_cards[-1]["selected_source"]["text"] == OPENINGS[1]

    settings = settings.model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    Runner.payloads = []
    plan = await ConceptNoteEditPlanner(settings, runner=Runner).plan(
        kwargs["concept_note_edit_request"],
        [snapshot("Old opening. Other text.")],
        {},
        recent_messages=[],
        question_cards=planner_cards,
        chosen_options=chosen,
    )
    planning, review = Runner.payloads
    assert OPENINGS[1] in planning["chosen_options"]
    assert OPENINGS[1] in review["chosen_options"]
    assert plan.changes[0].user_input_quote == OPENINGS[1]


@pytest.mark.asyncio
@pytest.mark.parametrize("edit", [True, False])
async def test_ambiguous_reference_saves_clarification_without_running_model(
    store, chat_service, monkeypatch, edit
):
    thread_id = await seed(
        store,
        [
            (
                MessageRole.ASSISTANT,
                "Which timeline format?",
                card_tools(
                    TIMELINE,
                    message="Which timeline format?",
                    document_topic=TIMELINE_TOPIC,
                ),
            ),
            (
                MessageRole.ASSISTANT,
                OPENING_QUESTION,
                card_tools(OPENINGS, message=OPENING_QUESTION),
            ),
            (MessageRole.USER, "Go with B instead.", None),
        ],
    )
    if edit:
        # "Option B on the timeline." resolves to the timeline card before any model call.
        service = Mock(return_value=chat_service)
        monkeypatch.setattr("app.utils.streaming_agent.AgentService", service)
        from app.config import get_settings

        handler = StreamingHandler(thread_id, "owner", store)
        handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
        agent, _ = await prepare_stream_agent(
            handler,
            get_settings(),
            edit_payload("Option B on the timeline."),
            "card-test",
        )
        assert agent is not None
        assert referenced_options(
            service.call_args.kwargs["concept_note_question_cards"],
            "Option B on the timeline.",
        ) == [TIMELINE[1]]

    async def must_not_run(handler):
        raise AssertionError("the model must not run for an ambiguous reference")
        yield  # pragma: no cover

    run = await stream_turn(
        store,
        monkeypatch,
        chat_service,
        thread_id,
        edit_payload("Go with B instead.", edit=edit),
        must_not_run,
    )
    assert run.kwargs is None
    done = run.events[-1]["data"]
    assert done["history_saved"] is True
    saved = await saved_message(store, done["assistant_message_id"])
    card = saved_question(saved.tools_used)
    expected = [
        f"B · {OPENING_QUESTION} · “{OPENINGS[1]}”",
        f"B · the implementation timeline · “{TIMELINE[1]}”",
    ]
    assert card.on_answer == "reply"
    assert card.options == expected

    # The clicked clarification option answers the original Timeline card.
    await add_message(store, thread_id, MessageRole.USER, expected[1])
    second = await stream_turn(
        store,
        monkeypatch,
        chat_service,
        thread_id,
        edit_payload(expected[1], edit=edit),
        prose_only(""),
    )
    assert second.kwargs["concept_note_edit_request"] is None
    assert second.kwargs["concept_note_question_cards"] == []
    offers = option_cards(second.events)
    assert len(offers) == 1
    assert offers[0]["options"] == [
        "Update the implementation timeline to reflect “" + TIMELINE[1] + "”"
    ]
    assert offers[0]["on_answer"] == "propose_edit"


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
