"""Exercise accepted CNB replies with independent ASGI clients and storage."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.db.session import get_session, get_session_factory, get_session_optional
from app.models.db.message import Message, MessageRole
from app.models.db.thread import Thread
from app.models.requests import MessageCreateRequest
from app.routes import messages, threads
from app.services.cnb.chat_turn import claim_reply_turn, release_reply_turn
from app.services.thread_service import ThreadService
from app.utils import streaming_handler
from app.utils.tool_handler import persist_assistant_message

AUTH = "Bearer owner-token"


@pytest_asyncio.fixture
async def chat_api(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'chat.db'}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    thread_id, run_id = uuid4(), str(uuid4())
    async with factory() as session, session.begin():
        session.add(
            Thread(
                thread_id=thread_id,
                user_id="owner",
                context={"concept_note_run_id": run_id},
            )
        )
    monkeypatch.setattr(
        "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
        AsyncMock(return_value="owner"),
    )
    monkeypatch.setattr(
        messages, "require_chat_context_ready", AsyncMock(return_value=run_id)
    )
    monkeypatch.setattr(
        streaming_handler,
        "prepare_stream_agent",
        AsyncMock(return_value=(object(), [])),
    )

    async def database():
        async with factory() as session:
            yield session

    api = FastAPI()
    api.include_router(messages.router, prefix="/v1")
    api.include_router(threads.router, prefix="/v1")
    api.dependency_overrides[get_session_factory] = lambda: factory
    api.dependency_overrides[get_session_optional] = lambda: None
    api.dependency_overrides[get_session] = database
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=api), base_url="http://test"
        ) as client:
            yield client, factory, thread_id
    finally:
        await engine.dispose()


async def history(client, thread_id):
    response = await client.get(f"/v1/threads/{thread_id}/messages?user_id=owner")
    assert response.status_code == 200
    payload = response.json()
    return payload["reply_in_progress"], [
        (row["role"], row["text"]) for row in payload["messages"]
    ]


async def start_reply(factory, thread_id, options=None):
    return await messages.post_message(
        MessageCreateRequest(
            thread_id=str(thread_id), user_id="owner", content="Budget", options=options
        ),
        authorization=AUTH,
        session=None,
        session_factory=factory,
    )


@pytest.mark.asyncio
async def test_reply_and_tool_metadata_survive_asgi_disconnect(chat_api, monkeypatch):
    client, factory, thread_id = chat_api
    started, finish, disconnect = asyncio.Event(), asyncio.Event(), asyncio.Event()
    proposal_id = str(uuid4())

    async def model(handler, *_args):
        started.set()
        await finish.wait()
        handler.assistant_tokens.append("About 2M EUR.")
        handler.tool_invocations.append(
            {
                "name": "concept_note_edit_propose",
                "result_json": {"proposal_id": proposal_id},
            }
        )
        yield b"event: message\ndata: {}\n\n"

    async def receive():
        await disconnect.wait()
        return {"type": "http.disconnect"}

    async def send(_message):
        pass

    monkeypatch.setattr(streaming_handler, "stream_agent_events", model)
    response = await start_reply(factory, thread_id)
    subscriber = asyncio.create_task(
        response({"type": "http", "asgi": {"spec_version": "2.3"}}, receive, send)
    )
    try:
        await asyncio.wait_for(started.wait(), 2)
        disconnect.set()
        await asyncio.wait_for(subscriber, 2)
        assert await history(client, thread_id) == (True, [("user", "Budget")])
        duplicate = await client.post(
            "/v1/messages",
            json={
                "thread_id": str(thread_id),
                "user_id": "owner",
                "content": "Different question",
            },
            headers={"Authorization": AUTH},
        )
        assert duplicate.status_code == 409
        assert duplicate.json()["detail"]["code"] == "concept_note_reply_in_progress"
        assert await history(client, thread_id) == (True, [("user", "Budget")])
        streaming_handler.prepare_stream_agent.assert_awaited_once()
    finally:
        disconnect.set()
        finish.set()
        async with asyncio.timeout(2):
            while (await history(client, thread_id))[0]:
                await asyncio.sleep(0.01)

    assert await history(client, thread_id) == (
        False,
        [("user", "Budget"), ("assistant", "About 2M EUR.")],
    )
    async with factory() as session:
        answer = await session.scalar(
            select(Message).where(Message.role == MessageRole.ASSISTANT)
        )
        assert answer.tools_used[0]["result_json"]["proposal_id"] == proposal_id


@pytest.mark.asyncio
async def test_deadline_closes_model_and_allows_retry_without_duplication(
    chat_api, monkeypatch
):
    client, factory, thread_id = chat_api
    cancelled = asyncio.Event()

    async def blocked_model(handler, *_args):
        try:
            handler.assistant_tokens.append("Partial")
            yield b"event: message\ndata: {}\n\n"
            await asyncio.Future()
        finally:
            cancelled.set()

    monkeypatch.setattr(messages, "REPLY_TURN_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(streaming_handler, "stream_agent_events", blocked_model)
    response = await start_reply(factory, thread_id)
    async with asyncio.timeout(2):
        chunks = [chunk async for chunk in response.body_iterator]
    assert b"event: error\n" in b"".join(chunks)
    assert cancelled.is_set()
    assert await history(client, thread_id) == (False, [("user", "Budget")])

    async def model(handler, *_args):
        handler.assistant_tokens.append("About 2M EUR.")
        yield b"event: message\ndata: {}\n\n"

    monkeypatch.setattr(messages, "REPLY_TURN_TIMEOUT_SECONDS", 2)
    monkeypatch.setattr(streaming_handler, "stream_agent_events", model)
    response = await start_reply(factory, thread_id, {"concept_note_turn": "retry"})
    async with asyncio.timeout(2):
        assert b"event: done\n" in b"".join(
            [chunk async for chunk in response.body_iterator]
        )
    assert await history(client, thread_id) == (
        False,
        [("user", "Budget"), ("assistant", "About 2M EUR.")],
    )


@pytest.mark.asyncio
async def test_expired_turn_cannot_write_or_release_replacement(chat_api):
    client, factory, thread_id = chat_api
    old_id = uuid4()
    async with factory() as session, session.begin():
        thread = await session.get(Thread, thread_id)
        thread.reply_turn_id = old_id
        thread.reply_turn_expires_at = datetime.now(UTC) - timedelta(seconds=1)

    assert await history(client, thread_id) == (False, [])
    async with factory() as session, session.begin():
        thread = await ThreadService(session).get_thread(thread_id, for_update=True)
        replacement = await claim_reply_turn(session, thread)

    assert replacement != old_id
    assert not await persist_assistant_message(
        session_factory=factory,
        thread_id=thread_id,
        user_id="owner",
        assistant_content="Stale reply",
        tool_invocations=None,
        reply_turn_id=old_id,
    )
    await release_reply_turn(factory, thread_id, old_id)
    assert await history(client, thread_id) == (True, [])
