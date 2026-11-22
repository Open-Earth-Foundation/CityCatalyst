"""
End-to-end message route tests against the real app and an in-memory database.

Tests cover thread validation errors, automatic thread creation, and follow-up
messages reusing the created thread.
"""

from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.db.session import get_session, get_session_factory, get_session_optional
from app.main import get_app


def _thread_id_from_stream(response_text: str) -> str | None:
    """Return the first thread_id announced in an SSE response body."""
    for line in response_text.split("\n"):
        if not line.startswith("data:"):
            continue
        try:
            data = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if data.get("thread_id"):
            return data["thread_id"]
    return None


class ConversationRouteTests(unittest.IsolatedAsyncioTestCase):
    """Message route behaviour across thread creation and reuse."""

    async def asyncSetUp(self) -> None:
        """Set up an in-memory database and the FastAPI app."""
        self.engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            echo=False,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine, expire_on_commit=False
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async def override_session():
            async with self.session_factory() as session:
                yield session

        async def override_session_factory():
            return self.session_factory

        self.app = get_app()
        self.app.dependency_overrides[get_session] = override_session
        self.app.dependency_overrides[get_session_factory] = override_session_factory
        self.app.dependency_overrides[get_session_optional] = override_session
        self.client = TestClient(self.app)
        self.identity_patcher = patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(return_value="user-1"),
        )
        self.identity_patcher.start()

    async def asyncTearDown(self) -> None:
        """Close the client and database and clear dependency overrides."""
        self.identity_patcher.stop()
        self.client.close()
        await self.engine.dispose()
        self.app.dependency_overrides.clear()

    def _post_message(self, **body: str):
        return self.client.post(
            "/v1/messages",
            json={"user_id": "user-1", **body},
            headers={"Authorization": "Bearer user-1"},
        )

    def test_conversation_with_invalid_thread_id(self) -> None:
        response = self._post_message(thread_id="not-a-valid-uuid", content="Test")

        self.assertEqual(response.status_code, 400)

    def test_conversation_with_missing_thread_id(self) -> None:
        """Message creation rejects a non-existent thread_id."""
        thread_id = str(uuid4())

        response = self._post_message(thread_id=thread_id, content="Test")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], f"Thread {thread_id} not found")

    def test_message_without_thread_creates_one_that_later_messages_reuse(
        self,
    ) -> None:
        first = self._post_message(content="First message")

        self.assertEqual(first.status_code, 200)
        self.assertIn("text/event-stream", first.headers.get("content-type", ""))
        thread_id = _thread_id_from_stream(first.text)
        self.assertIsNotNone(thread_id, "thread_id not found in first message stream")
        UUID(thread_id)

        second = self._post_message(
            thread_id=thread_id, content="Second message in same thread"
        )

        self.assertEqual(second.status_code, 200)
        self.assertIn("text/event-stream", second.headers.get("content-type", ""))
        self.assertEqual(_thread_id_from_stream(second.text), thread_id)


if __name__ == "__main__":
    unittest.main(verbosity=2)
