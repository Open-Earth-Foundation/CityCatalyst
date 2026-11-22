"""Fail-closed identity boundary for Climate Advisor write requests."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.db.session import get_session, get_session_factory, get_session_optional
from app.main import get_app
from app.models.db.message import Message
from app.models.db.thread import Thread
from app.services.citycatalyst_client import CityCatalystClientError
from app.utils.citycatalyst_auth import WRITE_AUTH_FAILED, WRITE_AUTH_UNAVAILABLE

VALIDATE_IDENTITY = "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity"
REFRESH_TOKEN = "app.routes.dev_inventory.CityCatalystClient.refresh_token"


def _auth_header(token: str = "valid-token") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _problem_title(response) -> str:
    payload = response.json()
    return str(payload.get("title") or payload.get("detail") or "")


def _identity(mode: str) -> AsyncMock:
    """Return a CityCatalyst identity double for one validation outcome."""
    if mode == "reject":
        return AsyncMock(side_effect=CityCatalystClientError("invalid", status_code=401))
    if mode == "outage":
        return AsyncMock(side_effect=CityCatalystClientError("down", status_code=503))
    if mode == "mismatch":
        return AsyncMock(return_value="canonical-user")
    return AsyncMock(return_value="user-1")


def _run(session_factory, operation):
    """Run one async database read against the in-memory test database."""

    async def run():
        async with session_factory() as session:
            return await operation(session)

    return asyncio.run(run())


def _count(session_factory, model) -> int:
    return _run(
        session_factory,
        lambda session: session.scalar(select(func.count()).select_from(model)),
    )


def _thread(session_factory, thread_id) -> Thread:
    thread_id = thread_id if isinstance(thread_id, UUID) else UUID(str(thread_id))
    thread = _run(session_factory, lambda session: session.get(Thread, thread_id))
    assert thread is not None
    return thread


def _seed_thread(session_factory, **values: Any) -> UUID:
    thread_id = uuid4()

    async def seed(session):
        session.add(Thread(thread_id=thread_id, **values))
        await session.commit()

    _run(session_factory, seed)
    return thread_id


def _empty_stream(*_args: Any, **_kwargs: Any):
    async def _gen():
        yield b""

    return _gen()


@pytest.fixture
def sqlite_app():
    """Build a TestClient against an in-memory Climate Advisor database."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine, expire_on_commit=False
    )

    async def setup() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(setup())
    app = get_app()

    async def override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    app.dependency_overrides[get_session_optional] = lambda: None
    client = TestClient(app)
    try:
        yield client, session_factory
    finally:
        client.close()
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


class ThreadWriteBoundaryTests:
    @pytest.mark.parametrize(
        ("authorization", "identity", "status", "title"),
        [
            (None, "accept", 401, WRITE_AUTH_FAILED),
            ("", "accept", 401, WRITE_AUTH_FAILED),
            ("Bearer", "accept", 401, WRITE_AUTH_FAILED),
            ("Bearer ", "accept", 401, WRITE_AUTH_FAILED),
            ("Basic abc", "accept", 401, WRITE_AUTH_FAILED),
            ("Token abc", "accept", 401, WRITE_AUTH_FAILED),
            ("Bearer expired-token", "reject", 401, WRITE_AUTH_FAILED),
            ("Bearer valid-token", "outage", 503, WRITE_AUTH_UNAVAILABLE),
            ("Bearer other-user-token", "mismatch", 401, WRITE_AUTH_FAILED),
        ],
    )
    def test_unconfirmed_identity_does_not_create_a_thread(
        self, sqlite_app, authorization: str | None, identity: str, status: int, title: str
    ) -> None:
        client, session_factory = sqlite_app
        headers = {} if authorization is None else {"Authorization": authorization}
        with patch(VALIDATE_IDENTITY, new=_identity(identity)):
            response = client.post(
                "/v1/threads",
                json={"user_id": "user-1", "context": {"access_token": "unvalidated"}},
                headers=headers,
            )
        assert response.status_code == status
        assert _problem_title(response) == title
        assert _count(session_factory, Thread) == 0

    def test_valid_header_persists_canonical_user_and_header_token(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        with patch(VALIDATE_IDENTITY, new=_identity("accept")):
            response = client.post(
                "/v1/threads",
                json={
                    "user_id": "user-1",
                    "context": {
                        "city_name": "Nairobi",
                        "access_token": "smuggled-token",
                        "cc_access_token": "legacy-smuggled-token",
                    },
                },
                headers=_auth_header("header-token"),
            )
        assert response.status_code == 201
        thread = _thread(session_factory, response.json()["thread_id"])
        assert thread.context == {"city_name": "Nairobi", "access_token": "header-token"}
        assert thread.user_id == "user-1"


class MessageWriteBoundaryTests:
    def test_implicit_thread_is_not_created_without_a_bearer(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        response = client.post(
            "/v1/messages",
            json={"user_id": "user-1", "content": "Hello"},
        )
        assert response.status_code == 401
        assert _count(session_factory, Thread) == 0
        assert _count(session_factory, Message) == 0

    def test_forged_thread_cannot_refresh_or_register_inventory_tools(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        thread_id = _seed_thread(
            session_factory,
            user_id="victim-user",
            context={"access_token": "junk-stored-token"},
        )
        refresh_token = AsyncMock(return_value=("victim-token", 3600))
        with (
            patch(VALIDATE_IDENTITY, new=_identity("reject")),
            patch(
                "app.services.citycatalyst_client.CityCatalystClient.refresh_token",
                new=refresh_token,
            ),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
            patch("app.services.agent_service.AgentService") as agent_service,
        ):
            response = client.post(
                "/v1/messages",
                json={
                    "user_id": "victim-user",
                    "thread_id": str(thread_id),
                    "content": "Show victim inventories",
                    "context": {"access_token": "junk-request-token"},
                },
                headers=_auth_header("junk-request-token"),
            )
        assert response.status_code == 401
        refresh_token.assert_not_awaited()
        streaming_handler.assert_not_called()
        agent_service.assert_not_called()
        assert _count(session_factory, Message) == 0
        assert _thread(session_factory, thread_id).context["access_token"] == "junk-stored-token"

    def test_valid_header_does_not_persist_conflicting_body_token(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        with (
            patch(VALIDATE_IDENTITY, new=_identity("accept")),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
        ):
            streaming_handler.return_value.stream_response = _empty_stream
            response = client.post(
                "/v1/messages",
                json={
                    "user_id": "user-1",
                    "content": "Hello",
                    "context": {
                        "access_token": "body-token",
                        "cc_access_token": "legacy-body-token",
                    },
                },
                headers=_auth_header("header-token"),
            )
        assert response.status_code == 200
        assert streaming_handler.call_args.kwargs["cc_access_token"] == "header-token"

        async def all_threads(session):
            return (await session.scalars(select(Thread))).all()

        threads = _run(session_factory, all_threads)
        assert len(threads) == 1
        assert threads[0].context["access_token"] == "header-token"
        assert "cc_access_token" not in threads[0].context

    def test_existing_thread_drops_legacy_alias_and_keeps_other_context(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        thread_id = _seed_thread(
            session_factory,
            user_id="user-1",
            context={
                "access_token": "stale-token",
                "cc_access_token": "legacy-stored-token",
                "city_name": "Nairobi",
            },
        )
        with (
            patch(VALIDATE_IDENTITY, new=_identity("accept")),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
        ):
            streaming_handler.return_value.stream_response = _empty_stream
            response = client.post(
                "/v1/messages",
                json={
                    "user_id": "user-1",
                    "thread_id": str(thread_id),
                    "content": "Continue",
                    "context": {"cc_access_token": "legacy-body-token"},
                },
                headers=_auth_header("header-token"),
            )
        assert response.status_code == 200
        context = _thread(session_factory, thread_id).context
        assert context["access_token"] == "header-token"
        assert context["city_name"] == "Nairobi"
        assert "cc_access_token" not in context


class DeveloperInventoryBoundaryTests:
    @pytest.mark.parametrize("case", ["missing_bearer", "subject_mismatch", "inventory_401"])
    def test_inventory_check_never_refreshes_the_presented_bearer(
        self, sqlite_app, case: str
    ) -> None:
        client, _session_factory = sqlite_app
        refresh_token = AsyncMock(return_value=("victim-token", 3600))
        identity = _identity("mismatch" if case == "subject_mismatch" else "accept")
        inventories = AsyncMock(
            side_effect=CityCatalystClientError("unauthorized", status_code=401)
        )
        with (
            patch(VALIDATE_IDENTITY, new=identity),
            patch(
                "app.routes.dev_inventory.CityCatalystClient.get_user_inventories",
                new=inventories,
            ),
            patch(REFRESH_TOKEN, new=refresh_token),
        ):
            response = client.post(
                "/v1/dev/user-inventories-check",
                json={"user_id": "user-1"},
                headers={} if case == "missing_bearer" else _auth_header(),
            )
        assert response.status_code == 401
        assert _problem_title(response) == WRITE_AUTH_FAILED
        refresh_token.assert_not_awaited()
