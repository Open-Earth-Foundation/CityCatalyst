"""Suggested-answer cards decide whether a pick edits and tell the planner what it means."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import ClassVar
from uuid import uuid4

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
from app.services.cnb.edit_planner import ConceptNoteEditPlanner
from app.services.cnb.question_reply import (
    answers_reply_only_card,
    planner_question_cards,
    recent_question_cards,
    referenced_options,
)
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

TIMELINE = ["Quarters throughout", "Months throughout", "Quarters, months in year one"]
OPENINGS = [
    "Harbor Point faces rising heat and recurrent street flooding.",
    "Cooler streets and better drainage are at the heart of the plan.",
]


def card_tools(options, on_answer=None):
    result = {"message": "Which one?", "options": options}
    if on_answer:
        result["on_answer"] = on_answer
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


@pytest.mark.asyncio
async def test_picking_an_option_on_a_question_card_does_not_edit(store):
    thread_id = await seed(
        store,
        [
            (MessageRole.ASSISTANT, "Which one?", card_tools(TIMELINE)),
            (MessageRole.USER, "Quarters throughout", None),
        ],
    )
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    assert answers_reply_only_card(cards, "Quarters throughout")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("on_answer", "reply"),
    [
        # An edit card prepares the chosen change.
        ("propose_edit", "Quarters throughout"),
        # A custom answer may ask for a change; Clima decides as usual.
        (None, "Use quarters and update the implementation table now."),
    ],
)
async def test_edit_cards_and_custom_answers_keep_the_edit_path(
    store, on_answer, reply
):
    thread_id = await seed(
        store,
        [
            (MessageRole.ASSISTANT, "Which one?", card_tools(TIMELINE, on_answer)),
            (MessageRole.USER, reply, None),
        ],
    )
    cards = await recent_question_cards(store, thread_id=thread_id, user_id="owner")
    assert not answers_reply_only_card(cards, reply)


def test_letter_references_resolve_against_the_latest_card():
    cards = [
        {
            "options": [
                {"label": label, "text": text} for label, text in zip("ABC", TIMELINE)
            ],
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
