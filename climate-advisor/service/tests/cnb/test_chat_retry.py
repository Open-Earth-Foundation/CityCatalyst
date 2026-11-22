"""Retry storage skips the newest identical user message."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.services.cnb.chat_retry import is_retry_turn
from sqlalchemy import select

AUTH_HEADERS = {"Authorization": "Bearer owner-token"}
RETRY_OPTIONS = {"concept_note_turn": "retry"}


@pytest_asyncio.fixture
async def chat_api(chat_client):
    thread_id = uuid4()
    async with chat_client.factory() as session, session.begin():
        session.add(Thread(thread_id=thread_id, user_id="owner", context={}))
    return chat_client.client, chat_client.factory, thread_id


async def _post(client, thread_id, content, options=None):
    body = {"user_id": "owner", "thread_id": str(thread_id), "content": content}
    if options is not None:
        body["options"] = options
    response = await client.post("/v1/messages", json=body, headers=AUTH_HEADERS)
    assert response.status_code == 200
    return response


async def _stored(factory, thread_id) -> list[tuple[str, str]]:
    async with factory() as session:
        rows = await session.scalars(
            select(Message)
            .where(Message.thread_id == thread_id)
            .order_by(Message.created_at)
        )
        return [(row.role.value, row.text) for row in rows]


def test_only_the_retry_turn_option_marks_a_retry():
    assert is_retry_turn(RETRY_OPTIONS)
    assert not is_retry_turn({"concept_note_turn": "draft_overview"})
    assert not is_retry_turn(None)
    assert not is_retry_turn("retry")


@pytest.mark.parametrize(
    "content",
    [
        "What is the budget?",
        "What is the budget?  ",
        "What is the budget?\n",
        "  What is the budget?\nInclude the funding gap.\r\n",
    ],
)
async def test_retry_after_a_failed_reply_preserves_and_dedupes_exact_text(
    chat_api, content: str
):
    client, factory, thread_id = chat_api

    # The first attempt stores the question; its reply never arrives.
    await _post(client, thread_id, content)
    assert await _stored(factory, thread_id) == [("user", content)]
    await _post(client, thread_id, content, RETRY_OPTIONS)

    assert await _stored(factory, thread_id) == [("user", content)]


async def test_retry_does_not_dedupe_different_whitespace(chat_api):
    client, factory, thread_id = chat_api

    await _post(client, thread_id, "What is the budget?\n")
    await _post(client, thread_id, "What is the budget?", RETRY_OPTIONS)

    assert await _stored(factory, thread_id) == [
        ("user", "What is the budget?\n"),
        ("user", "What is the budget?"),
    ]


async def test_retry_stores_the_question_when_the_first_attempt_never_arrived(
    chat_api,
):
    client, factory, thread_id = chat_api

    # A 502 before Climate Advisor saw the request leaves nothing stored.
    await _post(client, thread_id, "What is the budget?", RETRY_OPTIONS)

    assert await _stored(factory, thread_id) == [("user", "What is the budget?")]


async def test_retry_stores_a_repeat_question_after_an_answer(chat_api):
    client, factory, thread_id = chat_api
    asked = datetime.now(UTC) - timedelta(minutes=2)
    async with factory() as session, session.begin():
        session.add_all(
            [
                Message(
                    message_id=uuid4(),
                    thread_id=thread_id,
                    user_id="owner",
                    text="What is the budget?",
                    role=MessageRole.USER,
                    created_at=asked,
                ),
                Message(
                    message_id=uuid4(),
                    thread_id=thread_id,
                    user_id="owner",
                    text="About 2 million euros.",
                    role=MessageRole.ASSISTANT,
                    created_at=asked + timedelta(minutes=1),
                ),
            ]
        )

    await _post(client, thread_id, "What is the budget?", RETRY_OPTIONS)

    assert await _stored(factory, thread_id) == [
        ("user", "What is the budget?"),
        ("assistant", "About 2 million euros."),
        ("user", "What is the budget?"),
    ]


async def test_plain_repeat_questions_are_still_saved(chat_api):
    client, factory, thread_id = chat_api

    await _post(client, thread_id, "Again?")
    await _post(client, thread_id, "Again?")

    assert await _stored(factory, thread_id) == [
        ("user", "Again?"),
        ("user", "Again?"),
    ]
