"""Contracts for refreshing CityCatalyst authorization on reopened chats."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from app.db import Base
from app.models.db.thread import Thread
from app.models.requests import MessageCreateRequest
from app.routes import messages as messages_route
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


class _StreamingHandlerStub:
    """Capture the token selected by the message route without running an agent."""

    selected_token: str | None = None

    def __init__(self, **kwargs: object) -> None:
        token = kwargs.get("cc_access_token")
        type(self).selected_token = token if isinstance(token, str) else None

    async def stream_response(
        self,
        _payload: MessageCreateRequest,
        _history_warning: str | None,
    ) -> AsyncIterator[bytes]:
        yield b""


@pytest.mark.asyncio
async def test_reopened_thread_uses_and_persists_current_message_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A current payload token must replace the expired token stored on the thread."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    thread_id = uuid4()
    run_id = str(uuid4())

    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            session.add(
                Thread(
                    thread_id=thread_id,
                    user_id="owner-1",
                    context={
                        "access_token": "expired-thread-token",
                        "concept_note_run_id": run_id,
                    },
                )
            )
            await session.commit()

        monkeypatch.setattr(messages_route, "StreamingHandler", _StreamingHandlerStub)

        async def skip_message_insert(
            _service: object,
            **_kwargs: object,
        ) -> None:
            return None

        monkeypatch.setattr(
            messages_route.MessageService,
            "create_user_message",
            skip_message_insert,
        )
        response = await messages_route.post_message(
            MessageCreateRequest(
                user_id="owner-1",
                thread_id=str(thread_id),
                content="Mark the final chapter ready",
                context={"access_token": "current-message-token"},
            ),
            session=None,
            session_factory=session_factory,
        )

        assert response.status_code == 200
        assert _StreamingHandlerStub.selected_token == "current-message-token"
        async with session_factory() as session:
            thread = await session.get(Thread, thread_id)
            assert thread is not None
            assert thread.context == {
                "access_token": "current-message-token",
                "concept_note_run_id": run_id,
            }
    finally:
        await engine.dispose()
