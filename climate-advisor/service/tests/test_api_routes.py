"""Climate Advisor API route contracts: health, threads, messages and error format."""

from __future__ import annotations

import unittest
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.db.session import get_session, get_session_factory
from app.main import get_app
from app.models.requests import MessageCreateRequest, ThreadCreateRequest
from app.routes.messages import post_message
from app.routes.threads import get_thread_messages
from app.services.citycatalyst_client import CityCatalystClientError
from app.services.message_service import MessageService
from app.services.thread_service import ThreadService

VALIDATE_IDENTITY = "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity"


def _empty_stream(*_args: Any, **_kwargs: Any):
    async def _gen():
        yield b""

    return _gen()


class HealthRouteTests(unittest.TestCase):
    def test_health_returns_ok_status(self) -> None:
        response = TestClient(get_app()).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class ThreadAndMessageRouteTests(unittest.IsolatedAsyncioTestCase):
    """Thread creation and message streaming against an in-memory database."""

    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine, expire_on_commit=False
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        self.app = get_app()

        async def override_session():
            async with self.session_factory() as session:
                yield session

        self.app.dependency_overrides[get_session] = override_session
        self.app.dependency_overrides[get_session_factory] = lambda: self.session_factory
        self.client = TestClient(self.app)
        # Bearer tokens in these tests are the user ids themselves.
        self.identity_patcher = patch(
            VALIDATE_IDENTITY, new=AsyncMock(side_effect=lambda token: token)
        )
        self.identity_patcher.start()

    async def asyncTearDown(self) -> None:
        self.identity_patcher.stop()
        self.app.dependency_overrides.clear()
        await self.engine.dispose()

    def _create_thread(self, **payload: Any):
        return self.client.post(
            "/v1/threads",
            json={"user_id": "user-1", **payload},
            headers={"Authorization": "Bearer user-1"},
        )

    def test_create_thread_minimal_payload(self) -> None:
        response = self._create_thread()

        self.assertEqual(response.status_code, 201)
        self.assertIsInstance(response.json()["thread_id"], str)

    def test_create_thread_keeps_optional_inventory_and_context(self) -> None:
        response = self._create_thread(
            inventory_id="inv-123",
            context={"city": "San Francisco", "country": "USA"},
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["inventory_id"], "inv-123")
        self.assertEqual(data["context"]["city"], "San Francisco")
        self.assertEqual(data["context"]["country"], "USA")

    def test_message_requires_user_id_and_content(self) -> None:
        for payload in ({"content": "Hello"}, {"user_id": "user-1"}):
            with self.subTest(payload=payload):
                response = self.client.post("/v1/messages", json=payload)
                self.assertEqual(response.status_code, 422)

    def test_message_streams_for_new_and_existing_threads(self) -> None:
        thread_id = self._create_thread().json()["thread_id"]

        for extra in ({}, {"thread_id": thread_id}):
            with self.subTest(extra=extra):
                with patch("app.routes.messages.StreamingHandler") as streaming_handler:
                    streaming_handler.return_value.stream_response = _empty_stream
                    response = self.client.post(
                        "/v1/messages",
                        json={"user_id": "user-1", "content": "Hello", **extra},
                        headers={"Authorization": "Bearer user-1"},
                    )

                self.assertEqual(response.status_code, 200)
                self.assertIn("text/event-stream", response.headers["content-type"])

    def test_message_with_missing_thread_id_returns_404(self) -> None:
        thread_id = str(uuid4())
        response = self.client.post(
            "/v1/messages",
            json={"user_id": "user-1", "content": "Hello assistant", "thread_id": thread_id},
            headers={"Authorization": "Bearer user-1"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], f"Thread {thread_id} not found")


def _message() -> MessageCreateRequest:
    return MessageCreateRequest(user_id="user-1", content="Hello assistant", thread_id="thread-1")


class MessageIdentityGateTests(unittest.IsolatedAsyncioTestCase):
    """The CityCatalyst identity gate in front of message creation."""

    async def test_message_passes_validated_identity_to_catalog_handler(self) -> None:
        """Only Core's canonical identity may enable request catalog context."""
        with (
            patch(VALIDATE_IDENTITY, new=AsyncMock(return_value="user-1")),
            patch(
                "app.routes.messages.ThreadResolver.resolve_thread",
                new=AsyncMock(return_value="thread-1"),
            ),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
        ):
            response = await post_message(
                _message(),
                authorization="Bearer valid-token",
                session=None,
                session_factory=None,
            )

        self.assertEqual(response.status_code, 200)
        handler_kwargs = streaming_handler.call_args.kwargs
        self.assertEqual(handler_kwargs["catalog_user_id"], "user-1")
        self.assertEqual(handler_kwargs["user_id"], "user-1")
        self.assertEqual(handler_kwargs["cc_access_token"], "valid-token")
        refresh_context = handler_kwargs["request_token_refresh_context"]
        self.assertEqual(refresh_context.canonical_user_id, "user-1")
        self.assertEqual(refresh_context.token_ref["value"], "valid-token")

    async def test_message_rejects_unconfirmed_identity_before_any_thread_work(self) -> None:
        """Rejected tokens, subject mismatches and Core outages never reach the handler."""
        cases = [
            (
                AsyncMock(side_effect=CityCatalystClientError("invalid", status_code=401)),
                401,
                "CityCatalyst authentication failed",
            ),
            (AsyncMock(return_value="canonical-other-user"), 401, None),
            (
                AsyncMock(side_effect=CityCatalystClientError("down", status_code=503)),
                503,
                "CityCatalyst identity service is unavailable",
            ),
        ]
        for validate_identity, status_code, detail in cases:
            with self.subTest(status_code=status_code, detail=detail):
                resolve_thread = AsyncMock()
                with (
                    patch(VALIDATE_IDENTITY, new=validate_identity),
                    patch(
                        "app.routes.messages.ThreadResolver.resolve_thread",
                        new=resolve_thread,
                    ),
                    patch("app.routes.messages.StreamingHandler") as streaming_handler,
                ):
                    with self.assertRaises(HTTPException) as captured:
                        await post_message(
                            _message(),
                            authorization="Bearer presented-token",
                            session=None,
                            session_factory=None,
                        )

                self.assertEqual(captured.exception.status_code, status_code)
                if detail:
                    self.assertEqual(captured.exception.detail, detail)
                resolve_thread.assert_not_awaited()
                streaming_handler.assert_not_called()

    async def test_message_rejects_missing_bearer_instead_of_stale_thread_token(
        self,
    ) -> None:
        """A stale thread-stored bearer cannot authenticate a later write."""
        refresh_token = AsyncMock()
        with (
            patch(
                "app.services.citycatalyst_client.CityCatalystClient.refresh_token",
                new=refresh_token,
            ),
            patch("app.routes.messages.StreamingHandler") as streaming_handler,
        ):
            with self.assertRaises(HTTPException) as captured:
                await post_message(
                    _message(),
                    authorization=None,
                    session=None,
                    session_factory=None,
                )

        self.assertEqual(captured.exception.status_code, 401)
        streaming_handler.assert_not_called()
        refresh_token.assert_not_awaited()


class ThreadMessagesRouteTests(unittest.IsolatedAsyncioTestCase):
    """Tests for the thread history endpoint."""

    async def test_messages_include_stored_visuals(self) -> None:
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        visual = {"title": "Emissions by sector", "html": "<html></html>"}
        legacy = {"title": "Older chart", "html": "<html>old</html>"}
        try:
            async with session_factory() as session:
                thread = await ThreadService(session).create_thread(
                    ThreadCreateRequest(user_id="owner")
                )
                message_service = MessageService(session)
                await message_service.create_user_message(
                    thread_id=thread.thread_id, user_id="owner", text="Chart it"
                )
                await message_service.create_assistant_message(
                    thread_id=thread.thread_id,
                    user_id="owner",
                    text="",
                    tools_used=[
                        {
                            "name": "concept_note_render_visual",
                            "arguments": visual,
                            "result_json": {
                                "action": "concept_note.visual.render",
                                "success": True,
                                "data": {"title": visual["title"], "html_chars": 13},
                                "error_code": None,
                            },
                        },
                        # Rows saved before results dropped the HTML.
                        {
                            "name": "concept_note_render_visual",
                            "result_json": {
                                "action": "concept_note.visual.render",
                                "success": True,
                                "data": legacy,
                                "error_code": None,
                            },
                        },
                        {
                            "name": "concept_note_render_visual",
                            "result_json": {
                                "action": "concept_note.visual.render",
                                "success": False,
                                "data": None,
                                "error_code": "visual_invalid_input",
                            },
                        },
                        {"name": "concept_note_gaps", "result_json": {"success": True}},
                    ],
                )
                await session.commit()
                response = await get_thread_messages(
                    thread_id=thread.thread_id,
                    user_id="owner",
                    limit=None,
                    session=session,
                )
        finally:
            await engine.dispose()

        by_role = {message.role: message for message in response.messages}
        self.assertEqual(by_role["user"].visuals, [])
        self.assertEqual(by_role["assistant"].text, "")
        self.assertEqual(by_role["assistant"].model_dump()["visuals"], [visual, legacy])


class ResponseFormatTests(unittest.TestCase):
    """Errors follow RFC 7807 Problem Details."""

    def setUp(self) -> None:
        self.client = TestClient(get_app())

    def test_404_returns_problem_details(self) -> None:
        response = self.client.get("/v1/nonexistent")

        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertTrue({"type", "title", "status"} <= set(data))
        self.assertEqual(data["status"], 404)

    def test_validation_error_returns_problem_details(self) -> None:
        response = self.client.post("/v1/threads", json={"invalid": "payload"})

        self.assertEqual(response.status_code, 422)
        data = response.json()
        self.assertTrue({"type", "title", "status", "detail", "instance"} <= set(data))
        self.assertEqual(data["status"], 422)
