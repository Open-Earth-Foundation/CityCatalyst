"""A retried chat turn must not store the user's question twice."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.db.session import get_session_factory, get_session_optional
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.routes import messages
from app.services.cnb.chat_retry import is_retry_turn

AUTH_HEADERS = {"Authorization": "Bearer owner-token"}
RETRY_OPTIONS = {"concept_note_turn": "retry"}


@pytest_asyncio.fixture
async def chat_api(tmp_path, monkeypatch):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'chat.db').as_posix()}"
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    thread_id = uuid4()
    async with factory() as session, session.begin():
        session.add(Thread(thread_id=thread_id, user_id="owner", context={}))
    monkeypatch.setattr(
        "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
        AsyncMock(return_value="owner"),
    )

    async def empty_stream(*args):
        yield b'event: done\ndata: {"ok":true}\n\n'

    handler = Mock()
    handler.return_value.stream_response = empty_stream
    monkeypatch.setattr(messages, "StreamingHandler", handler)
    app = FastAPI()
    app.include_router(messages.router, prefix="/v1")
    app.dependency_overrides[get_session_factory] = lambda: factory
    app.dependency_overrides[get_session_optional] = lambda: None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, factory, thread_id
    await engine.dispose()


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


@pytest.mark.asyncio
async def test_retry_after_a_failed_reply_keeps_one_copy_of_the_question(chat_api):
    client, factory, thread_id = chat_api

    # The first attempt stores the question; its reply never arrives.
    await _post(client, thread_id, "What is the budget?")
    await _post(client, thread_id, "What is the budget?", RETRY_OPTIONS)

    assert await _stored(factory, thread_id) == [("user", "What is the budget?")]


@pytest.mark.asyncio
async def test_retry_stores_the_question_when_the_first_attempt_never_arrived(
    chat_api,
):
    client, factory, thread_id = chat_api

    # A 502 before Climate Advisor saw the request leaves nothing stored.
    await _post(client, thread_id, "What is the budget?", RETRY_OPTIONS)

    assert await _stored(factory, thread_id) == [("user", "What is the budget?")]


@pytest.mark.asyncio
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


@pytest.mark.asyncio
async def test_plain_repeat_questions_are_still_saved(chat_api):
    client, factory, thread_id = chat_api

    await _post(client, thread_id, "Again?")
    await _post(client, thread_id, "Again?")

    assert await _stored(factory, thread_id) == [
        ("user", "Again?"),
        ("user", "Again?"),
    ]
