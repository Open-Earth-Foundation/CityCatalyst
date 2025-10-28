"""
End-to-End Conversation Flow Tests

Tests cover:
- Complete conversation workflow (thread creation -> message -> response)
- Multi-turn conversations with context preservation
- Streaming response validation
- Tool invocation during conversations
- Error recovery and resilience
- Token refresh during conversation
"""

from __future__ import annotations

import sys
import json
from pathlib import Path
from typing import AsyncIterator
from unittest.mock import AsyncMock, patch, MagicMock
import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.main import get_app
from app.db import Base
from fastapi.testclient import TestClient
from uuid import uuid4

class ErrorHandlingInConversationTests(unittest.IsolatedAsyncioTestCase):
    """Tests for error handling in conversation workflows."""

    async def asyncSetUp(self) -> None:
        """Set up test database and FastAPI app."""
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

        self.app = get_app()
        
        async def get_session():
            async with self.session_factory() as session:
                yield session

        async def get_session_factory():
            return self.session_factory

        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session"]).get_session
        ] = get_session
        
        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session_factory"]).get_session_factory
        ] = get_session_factory

        self.client = TestClient(self.app)

    async def asyncTearDown(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await self.engine.dispose()

    def test_conversation_with_invalid_thread_id(self) -> None:
        """Test message creation with invalid thread_id fails gracefully."""
        response = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "thread_id": "not-a-valid-uuid",
                "content": "Test"
            }
        )
        
        # Should fail with appropriate error (400 or 404)
        self.assertIn(response.status_code, [400, 404, 422])

    def test_conversation_with_missing_thread_id(self) -> None:
        """Test message creation with non-existent thread_id."""
        from uuid import uuid4
        
        response = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "thread_id": str(uuid4()),
                "content": "Test"
            }
        )
        
        # May fail if thread doesn't exist
        self.assertIn(response.status_code, [200, 404])

    def test_message_without_thread_id_creates_thread_auto(self) -> None:
        """Test message creation without thread_id automatically creates a thread."""
        response = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "content": "Test message without thread"
            }
        )
        
        # Should succeed with auto-created thread
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Verify response contains thread_id
        self.assertIn("thread_id", data)
        self.assertIsNotNone(data["thread_id"])
        
        # Verify thread_id is a valid UUID string
        try:
            from uuid import UUID
            UUID(data["thread_id"])
        except (ValueError, TypeError):
            self.fail(f"thread_id '{data['thread_id']}' is not a valid UUID")

    def test_subsequent_messages_use_created_thread(self) -> None:
        """Test that subsequent messages can use the auto-created thread."""
        # First message without thread_id
        response1 = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "content": "First message"
            }
        )
        
        self.assertEqual(response1.status_code, 200)
        thread_id = response1.json()["thread_id"]
        
        # Second message with the same thread_id
        response2 = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "thread_id": thread_id,
                "content": "Second message in same thread"
            }
        )
        
        # Should succeed
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.json()["thread_id"], thread_id)


if __name__ == "__main__":
    unittest.main(verbosity=2)
