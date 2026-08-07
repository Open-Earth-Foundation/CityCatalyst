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

import json
import unittest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

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
        
        async def get_session_optional():
            async with self.session_factory() as session:
                yield session

        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session"]).get_session
        ] = get_session
        
        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session_factory"]).get_session_factory
        ] = get_session_factory
        
        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session_optional"]).get_session_optional
        ] = get_session_optional

        self.client = TestClient(self.app)

    async def asyncTearDown(self) -> None:
        """Clean up test database and close connections."""
        # Close test client first
        if hasattr(self, 'client'):
            self.client.close()
        
        # Dispose of the engine to close all connections
        if hasattr(self, 'engine'):
            await self.engine.dispose()
        
        # Clear dependency overrides
        if hasattr(self, 'app'):
            self.app.dependency_overrides.clear()

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
        """Test message creation rejects a non-existent thread_id."""
        thread_id = str(uuid4())
        response = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "thread_id": thread_id,
                "content": "Test"
            }
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], f"Thread {thread_id} not found")

    def test_message_without_thread_id_creates_thread_auto(self) -> None:
        """Test message creation without thread_id automatically creates a thread."""
        response = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "content": "Test message without thread"
            }
        )
        
        # Should succeed with streaming response
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers.get("content-type", ""))
        
        # Parse SSE stream to find thread_id in done event
        thread_id = None
        for line in response.text.split('\n'):
            if line.startswith('data:'):
                try:
                    data = json.loads(line[5:].strip())
                    if data.get("thread_id"):
                        thread_id = data["thread_id"]
                        break
                except json.JSONDecodeError:
                    continue
        
        # Verify thread_id was found
        self.assertIsNotNone(thread_id, "thread_id not found in SSE stream")
        
        # Verify thread_id is a valid UUID string
        try:
            from uuid import UUID
            UUID(thread_id)
        except (ValueError, TypeError):
            self.fail(f"thread_id '{thread_id}' is not a valid UUID")

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
        
        # Parse SSE stream to find thread_id in done event
        thread_id = None
        for line in response1.text.split('\n'):
            if line.startswith('data:'):
                try:
                    data = json.loads(line[5:].strip())
                    if data.get("thread_id"):
                        thread_id = data["thread_id"]
                        break
                except json.JSONDecodeError:
                    continue
        
        self.assertIsNotNone(thread_id, "thread_id not found in first message SSE stream")
        
        # Second message with the same thread_id
        response2 = self.client.post(
            "/v1/messages",
            json={
                "user_id": "user-1",
                "thread_id": thread_id,
                "content": "Second message in same thread"
            }
        )
        
        # Should succeed with streaming response
        self.assertEqual(response2.status_code, 200)
        self.assertIn("text/event-stream", response2.headers.get("content-type", ""))
        
        # Verify thread_id in second response matches
        thread_id_2 = None
        for line in response2.text.split('\n'):
            if line.startswith('data:'):
                try:
                    data = json.loads(line[5:].strip())
                    if data.get("thread_id"):
                        thread_id_2 = data["thread_id"]
                        break
                except json.JSONDecodeError:
                    continue
        
        self.assertEqual(thread_id_2, thread_id, "thread_id mismatch in second message")


if __name__ == "__main__":
    unittest.main(verbosity=2)
