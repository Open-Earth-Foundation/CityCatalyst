"""Fail-closed identity boundary for Climate Advisor write requests."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.db.session import get_session, get_session_factory, get_session_optional
from app.main import get_app
from app.models.db.message import Message
from app.models.db.thread import Thread
from app.models.requests import MessageCreateRequest
from app.routes.messages import post_message
from app.services.citycatalyst_client import CityCatalystClientError
from app.utils.citycatalyst_auth import (
    WRITE_AUTH_FAILED,
    WRITE_AUTH_UNAVAILABLE,
    authenticate_write_request,
    extract_bearer_token,
    normalize_write_context,
)


def _auth_header(token: str = "valid-token") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _problem_title(response) -> str:
    payload = response.json()
    return str(payload.get("title") or payload.get("detail") or "")


async def _count_rows(session_factory, model) -> int:
    async with session_factory() as session:
        result = await session.execute(select(func.count()).select_from(model))
        return int(result.scalar_one())


@pytest.fixture
def sqlite_app():
    """Build a TestClient against an in-memory Climate Advisor database."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine, expire_on_commit=False
    )

    async def setup() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    import asyncio

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


class BearerParsingTests:
    def test_missing_and_malformed_headers_are_the_same_401(self) -> None:
        for header in (None, "", "Bearer", "Bearer ", "Basic abc", "Token abc"):
            with pytest.raises(HTTPException) as captured:
                extract_bearer_token(header)
            assert captured.value.status_code == 401
            assert captured.value.detail == WRITE_AUTH_FAILED

    def test_strict_bearer_returns_the_token(self) -> None:
        assert extract_bearer_token("Bearer current-token") == "current-token"


class ContextNormalizationTests:
    def test_conflicting_aliases_are_replaced_by_the_validated_bearer(self) -> None:
        normalized = normalize_write_context(
            {
                "city_name": "Nairobi",
                "access_token": "body-token",
                "cc_access_token": "legacy-token",
            },
            "header-token",
        )
        assert normalized == {"city_name": "Nairobi", "access_token": "header-token"}


class AuthenticateWriteRequestTests:
    @pytest.mark.asyncio
    async def test_maps_core_rejection_to_stable_401(self) -> None:
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(
                side_effect=CityCatalystClientError("invalid", status_code=401)
            ),
        ):
            with pytest.raises(HTTPException) as captured:
                await authenticate_write_request(
                    authorization="Bearer rejected-token",
                    claimed_user_id="user-1",
                )
        assert captured.value.status_code == 401
        assert captured.value.detail == WRITE_AUTH_FAILED
        assert "invalid" not in str(captured.value.detail)

    @pytest.mark.asyncio
    async def test_maps_core_outage_to_stable_503(self) -> None:
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(
                side_effect=CityCatalystClientError(
                    "CC identity validation unavailable",
                    status_code=503,
                )
            ),
        ):
            with pytest.raises(HTTPException) as captured:
                await authenticate_write_request(
                    authorization="Bearer valid-token",
                    claimed_user_id="user-1",
                )
        assert captured.value.status_code == 503
        assert captured.value.detail == WRITE_AUTH_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_rejects_subject_mismatch(self) -> None:
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(return_value="canonical-user"),
        ):
            with pytest.raises(HTTPException) as captured:
                await authenticate_write_request(
                    authorization="Bearer other-user-token",
                    claimed_user_id="claimed-user",
                )
        assert captured.value.status_code == 401
        assert captured.value.detail == WRITE_AUTH_FAILED


class ThreadWriteBoundaryTests:
    def test_missing_bearer_does_not_create_a_thread(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        response = client.post("/v1/threads", json={"user_id": "user-1"})
        assert response.status_code == 401
        assert _problem_title(response) == WRITE_AUTH_FAILED
        assert _count_sync(session_factory, Thread) == 0

    def test_malformed_bearer_does_not_create_a_thread(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        response = client.post(
            "/v1/threads",
            json={"user_id": "user-1"},
            headers={"Authorization": "Basic not-a-bearer"},
        )
        assert response.status_code == 401
        assert _count_sync(session_factory, Thread) == 0

    def test_rejected_bearer_does_not_create_a_thread(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(
                side_effect=CityCatalystClientError("expired", status_code=401)
            ),
        ):
            response = client.post(
                "/v1/threads",
                json={"user_id": "user-1"},
                headers=_auth_header("expired-token"),
            )
        assert response.status_code == 401
        assert _problem_title(response) == WRITE_AUTH_FAILED
        assert _count_sync(session_factory, Thread) == 0

    def test_core_outage_does_not_create_a_thread(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(
                side_effect=CityCatalystClientError("down", status_code=503)
            ),
        ):
            response = client.post(
                "/v1/threads",
                json={"user_id": "user-1", "context": {"access_token": "unvalidated"}},
                headers=_auth_header(),
            )
        assert response.status_code == 503
        assert _problem_title(response) == WRITE_AUTH_UNAVAILABLE
        assert _count_sync(session_factory, Thread) == 0

    def test_subject_mismatch_does_not_create_a_thread(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(return_value="canonical-user"),
        ):
            response = client.post(
                "/v1/threads",
                json={"user_id": "claimed-victim"},
                headers=_auth_header(),
            )
        assert response.status_code == 401
        assert _count_sync(session_factory, Thread) == 0

    def test_valid_header_persists_canonical_user_and_header_token(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        with patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(return_value="user-1"),
        ):
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
        thread_id = response.json()["thread_id"]
        context = _load_thread_context_sync(session_factory, thread_id)
        assert context["access_token"] == "header-token"
        assert context["city_name"] == "Nairobi"
        assert "cc_access_token" not in context
        owner = _load_thread_user_sync(session_factory, thread_id)
        assert owner == "user-1"


class MessageWriteBoundaryTests:
    @pytest.mark.asyncio
    async def test_authentication_runs_before_thread_resolver(self) -> None:
        call_order: list[str] = []

        async def validate(token: str) -> str:
            call_order.append("validate")
            return "user-1"

        async def resolve(**kwargs: Any) -> str:
            call_order.append("resolve")
            return "thread-1"

        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(side_effect=validate),
            ),
            patch(
                "app.routes.messages.ThreadResolver.resolve_thread",
                new=AsyncMock(side_effect=resolve),
            ),
            patch(
                "app.routes.messages.require_chat_context_ready",
                new=AsyncMock(),
            ),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
        ):
            response = await post_message(
                MessageCreateRequest(user_id="user-1", content="Hello", thread_id="thread-1"),
                authorization="Bearer valid-token",
                session=None,
                session_factory=None,
            )

        assert response.status_code == 200
        assert call_order[0] == "validate"
        assert call_order.index("validate") < call_order.index("resolve")
        assert streaming_handler.call_args.kwargs["user_id"] == "user-1"
        assert streaming_handler.call_args.kwargs["catalog_user_id"] == "user-1"
        assert streaming_handler.call_args.kwargs["cc_access_token"] == "valid-token"

    @pytest.mark.asyncio
    async def test_rejected_bearer_never_resolves_or_streams(self) -> None:
        resolve_thread = AsyncMock()
        streaming_handler = MagicMock()
        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(
                    side_effect=CityCatalystClientError("invalid", status_code=401)
                ),
            ),
            patch("app.routes.messages.ThreadResolver.resolve_thread", new=resolve_thread),
            patch("app.routes.messages.StreamingHandler", new=streaming_handler),
        ):
            with pytest.raises(HTTPException) as captured:
                await post_message(
                    MessageCreateRequest(
                        user_id="user-1",
                        content="Hello",
                        thread_id="thread-1",
                    ),
                    authorization="Bearer invalid-token",
                    session=None,
                    session_factory=None,
                )
        assert captured.value.status_code == 401
        resolve_thread.assert_not_awaited()
        streaming_handler.assert_not_called()

    @pytest.mark.asyncio
    async def test_core_outage_never_resolves_or_streams(self) -> None:
        resolve_thread = AsyncMock()
        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(
                    side_effect=CityCatalystClientError("down", status_code=503)
                ),
            ),
            patch("app.routes.messages.ThreadResolver.resolve_thread", new=resolve_thread),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
        ):
            with pytest.raises(HTTPException) as captured:
                await post_message(
                    MessageCreateRequest(user_id="user-1", content="Hello"),
                    authorization="Bearer valid-token",
                    session=None,
                    session_factory=None,
                )
        assert captured.value.status_code == 503
        assert captured.value.detail == WRITE_AUTH_UNAVAILABLE
        resolve_thread.assert_not_awaited()
        streaming_handler.assert_not_called()

    def test_implicit_thread_is_not_created_without_a_bearer(self, sqlite_app) -> None:
        client, session_factory = sqlite_app
        response = client.post(
            "/v1/messages",
            json={"user_id": "user-1", "content": "Hello"},
        )
        assert response.status_code == 401
        assert _count_sync(session_factory, Thread) == 0
        assert _count_sync(session_factory, Message) == 0

    def test_forged_thread_cannot_refresh_or_register_inventory_tools(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        thread_id = uuid4()
        import asyncio

        async def seed() -> None:
            async with session_factory() as session:
                session.add(
                    Thread(
                        thread_id=thread_id,
                        user_id="victim-user",
                        context={"access_token": "junk-stored-token"},
                    )
                )
                await session.commit()

        asyncio.run(seed())
        refresh_token = AsyncMock(return_value=("victim-token", 3600))
        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(
                    side_effect=CityCatalystClientError("invalid", status_code=401)
                ),
            ),
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
        assert _count_sync(session_factory, Message) == 0
        context = _load_thread_context_sync(session_factory, thread_id)
        assert context["access_token"] == "junk-stored-token"

    def test_valid_header_does_not_persist_conflicting_body_token(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(return_value="user-1"),
            ),
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
        assert _count_sync(session_factory, Thread) == 1
        context = _load_only_thread_context_sync(session_factory)
        assert context["access_token"] == "header-token"
        assert "cc_access_token" not in context

    def test_existing_thread_drops_legacy_alias_and_keeps_other_context(
        self, sqlite_app
    ) -> None:
        client, session_factory = sqlite_app
        thread_id = uuid4()
        import asyncio

        async def seed() -> None:
            async with session_factory() as session:
                session.add(
                    Thread(
                        thread_id=thread_id,
                        user_id="user-1",
                        context={
                            "access_token": "stale-token",
                            "cc_access_token": "legacy-stored-token",
                            "city_name": "Nairobi",
                        },
                    )
                )
                await session.commit()

        asyncio.run(seed())
        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(return_value="user-1"),
            ),
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
        context = _load_thread_context_sync(session_factory, thread_id)
        assert context["access_token"] == "header-token"
        assert context["city_name"] == "Nairobi"
        assert "cc_access_token" not in context


class DeveloperInventoryBoundaryTests:
    def test_unauthenticated_inventory_check_does_not_refresh(self, sqlite_app) -> None:
        client, _session_factory = sqlite_app
        refresh_token = AsyncMock(return_value=("victim-token", 3600))
        with patch(
            "app.routes.dev_inventory.CityCatalystClient.refresh_token",
            new=refresh_token,
        ):
            response = client.post(
                "/v1/dev/user-inventories-check",
                json={"user_id": "victim-user"},
            )
        assert response.status_code == 401
        refresh_token.assert_not_awaited()

    def test_subject_mismatch_does_not_refresh(self, sqlite_app) -> None:
        client, _session_factory = sqlite_app
        refresh_token = AsyncMock(return_value=("victim-token", 3600))
        with (
            patch(
                "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
                new=AsyncMock(return_value="canonical-user"),
            ),
            patch(
                "app.routes.dev_inventory.CityCatalystClient.refresh_token",
                new=refresh_token,
            ),
        ):
            response = client.post(
                "/v1/dev/user-inventories-check",
                json={"user_id": "victim-user"},
                headers=_auth_header(),
            )
        assert response.status_code == 401
        refresh_token.assert_not_awaited()


def _empty_stream(*_args: Any, **_kwargs: Any):
    async def _gen():
        yield b""

    return _gen()


def _count_sync(session_factory, model) -> int:
    import asyncio

    return asyncio.run(_count_rows(session_factory, model))


def _as_thread_id(thread_id: Any) -> UUID:
    return thread_id if isinstance(thread_id, UUID) else UUID(str(thread_id))


def _load_thread_context_sync(session_factory, thread_id) -> dict[str, Any]:
    import asyncio

    async def load() -> dict[str, Any]:
        async with session_factory() as session:
            thread = await session.get(Thread, _as_thread_id(thread_id))
            assert thread is not None
            return dict(thread.context or {})

    return asyncio.run(load())


def _load_thread_user_sync(session_factory, thread_id) -> str:
    import asyncio

    async def load() -> str:
        async with session_factory() as session:
            thread = await session.get(Thread, _as_thread_id(thread_id))
            assert thread is not None
            return thread.user_id

    return asyncio.run(load())


def _load_only_thread_context_sync(session_factory) -> dict[str, Any]:
    import asyncio

    async def load() -> dict[str, Any]:
        async with session_factory() as session:
            result = await session.execute(select(Thread))
            thread = result.scalars().one()
            return dict(thread.context or {})

    return asyncio.run(load())
