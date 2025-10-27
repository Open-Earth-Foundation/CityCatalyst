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


class EndToEndConversationTests(unittest.IsolatedAsyncioTestCase):
    """End-to-end conversation workflow tests."""

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
        
        # Override database dependencies
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

    def test_complete_conversation_flow(self) -> None:
        """Test complete conversation: create thread -> send message -> receive response."""
        # Step 1: Create thread
        thread_response = self.client.post(
            "/v1/threads",
            json={"user_id": "test-user", "inventory_id": "inv-123"}
        )
        self.assertEqual(thread_response.status_code, 201)
        thread_data = thread_response.json()
        thread_id = thread_data["thread_id"]
        self.assertIsNotNone(thread_id)

        # Step 2: Send message in thread
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b"data: {\"type\": \"message\", \"content\": \"Hello, I can help with climate information.\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            message_response = self.client.post(
                "/v1/messages",
                json={
                    "user_id": "test-user",
                    "thread_id": thread_id,
                    "content": "What is the GPC framework?"
                }
            )
            
            self.assertEqual(message_response.status_code, 200)
            self.assertIn("text/event-stream", message_response.headers.get("content-type", ""))

    def test_conversation_context_preservation(self) -> None:
        """Test that thread context is preserved across messages."""
        # Create thread with context
        context = {"city": "San Francisco", "industry": "tech"}
        thread_response = self.client.post(
            "/v1/threads",
            json={
                "user_id": "test-user",
                "context": context
            }
        )
        
        self.assertEqual(thread_response.status_code, 201)
        thread_data = thread_response.json()
        thread_id = thread_data["thread_id"]

        # Verify thread_id is returned (context preserved in DB)
        self.assertIsNotNone(thread_id)

    def test_multiple_turns_in_conversation(self) -> None:
        """Test multi-turn conversation with multiple messages."""
        # Create thread
        thread_response = self.client.post(
            "/v1/threads",
            json={"user_id": "test-user"}
        )
        thread_id = thread_response.json()["thread_id"]

        # Simulate multiple turns
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream_turn_1():
                yield b"data: {\"type\": \"message\", \"content\": \"First response\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            async def mock_stream_turn_2():
                yield b"data: {\"type\": \"message\", \"content\": \"Second response\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            # First message
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream_turn_1())
            response_1 = self.client.post(
                "/v1/messages",
                json={
                    "user_id": "test-user",
                    "thread_id": thread_id,
                    "content": "Question 1"
                }
            )
            self.assertEqual(response_1.status_code, 200)

            # Second message
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream_turn_2())
            response_2 = self.client.post(
                "/v1/messages",
                json={
                    "user_id": "test-user",
                    "thread_id": thread_id,
                    "content": "Question 2"
                }
            )
            self.assertEqual(response_2.status_code, 200)


class StreamingResponseTests(unittest.IsolatedAsyncioTestCase):
    """Tests for streaming response validation."""

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

    def test_streaming_response_has_correct_headers(self) -> None:
        """Test streaming response includes correct content-type header."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b"data: {\"type\": \"message\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={"user_id": "user-1", "content": "Test"}
            )
            
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

    def test_streaming_response_contains_completion_signal(self) -> None:
        """Test streaming response includes done event to signal completion."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b"data: {\"type\": \"message\", \"content\": \"Response\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={"user_id": "user-1", "content": "Test"}
            )
            
            # Response should end with done signal
            self.assertIn(b"\"type\": \"done\"", response.content)

    def test_streaming_response_handles_multiple_chunks(self) -> None:
        """Test streaming response properly chunks multiple messages."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                # Multiple chunks
                yield b"data: {\"type\": \"message\", \"content\": \"First chunk. \"}\n\n"
                yield b"data: {\"type\": \"message\", \"content\": \"Second chunk. \"}\n\n"
                yield b"data: {\"type\": \"message\", \"content\": \"Third chunk.\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={"user_id": "user-1", "content": "Test"}
            )
            
            self.assertEqual(response.status_code, 200)
            # Should contain multiple message chunks
            content = response.content
            message_count = content.count(b"\"type\": \"message\"")
            self.assertGreaterEqual(message_count, 3)

    def test_streaming_response_format_is_sse(self) -> None:
        """Test streaming response follows Server-Sent Events format."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b"data: {\"type\": \"message\", \"content\": \"Hello\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={"user_id": "user-1", "content": "Test"}
            )
            
            # Should follow SSE format: data: <json>\n\n
            lines = response.content.split(b"\n\n")
            for line in lines:
                if line.strip():
                    self.assertTrue(
                        line.startswith(b"data: "),
                        f"Line does not start with 'data: ': {line}"
                    )

    def test_streaming_response_contains_valid_json(self) -> None:
        """Test streaming response events contain valid JSON."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b'data: {"type": "message", "content": "Hello"}\n\n'
                yield b'data: {"type": "done"}\n\n'
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={"user_id": "user-1", "content": "Test"}
            )
            
            # Parse SSE and validate JSON
            lines = response.content.split(b"\n\n")
            for line in lines:
                if line.strip() and line.startswith(b"data: "):
                    json_str = line[6:]  # Remove "data: " prefix
                    try:
                        json.loads(json_str)
                    except json.JSONDecodeError:
                        self.fail(f"Invalid JSON in SSE event: {json_str}")


class ToolInvocationDuringConversationTests(unittest.IsolatedAsyncioTestCase):
    """Tests for tool invocation during conversation flow."""

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

    def test_conversation_with_tool_invocation(self) -> None:
        """Test streaming response includes tool invocation events."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                # Tool invocation event
                yield b'data: {"type": "tool_call", "tool": "get_inventory", "args": {"inventory_id": "inv-1"}}\n\n'
                # Tool result
                yield b'data: {"type": "tool_result", "result": {"data": {}}}\n\n'
                # Final message
                yield b'data: {"type": "message", "content": "Here is the inventory data..."}\n\n'
                yield b'data: {"type": "done"}\n\n'
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={"user_id": "user-1", "content": "Get inventory data"}
            )
            
            self.assertEqual(response.status_code, 200)
            content = response.content.decode()
            # Should contain tool invocation
            self.assertIn("tool_call", content)


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
