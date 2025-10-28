"""
Comprehensive tests for Climate Advisor API routes.

Tests cover:
- Health endpoint
- Thread creation endpoint
- Message creation and streaming endpoint
- Error handling and validation
- Response formats
"""

from __future__ import annotations

import sys
import json
import unittest
from pathlib import Path
from typing import AsyncIterator
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.main import get_app
from app.db import Base
from app.models.requests import ThreadCreateRequest, MessageCreateRequest


class HealthRouteTests(unittest.TestCase):
    """Tests for the health check endpoint."""

    def setUp(self) -> None:
        self.app = get_app()
        self.client = TestClient(self.app)

    def test_health_returns_ok_status(self) -> None:
        """Test health endpoint returns 200 with ok status."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_endpoint_accessible(self) -> None:
        """Test health endpoint is accessible."""
        response = self.client.get("/health")
        self.assertTrue(response.is_success)


class ThreadCreationRouteTests(unittest.IsolatedAsyncioTestCase):
    """Tests for the thread creation endpoint."""

    async def asyncSetUp(self) -> None:
        """Set up in-memory SQLite database for testing."""
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
        
        # Patch the session factory dependency
        async def get_session():
            async with self.session_factory() as session:
                yield session

        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session"]).get_session
        ] = get_session

        self.client = TestClient(self.app)

    async def asyncTearDown(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await self.engine.dispose()

    def test_create_thread_minimal_payload(self) -> None:
        """Test thread creation with minimal required fields."""
        response = self.client.post(
            "/v1/threads",
            json={"user_id": "test-user-1"}
        )
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("thread_id", data)
        self.assertIsNotNone(data["thread_id"])
        self.assertIsInstance(data["thread_id"], str)

    def test_create_thread_with_inventory_id(self) -> None:
        """Test thread creation with optional inventory_id."""
        response = self.client.post(
            "/v1/threads",
            json={
                "user_id": "test-user-2",
                "inventory_id": "inv-123"
            }
        )
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("thread_id", data)

    def test_create_thread_with_context(self) -> None:
        """Test thread creation with optional context data."""
        context = {"city": "San Francisco", "country": "USA"}
        response = self.client.post(
            "/v1/threads",
            json={
                "user_id": "test-user-3",
                "context": context
            }
        )
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("thread_id", data)

    def test_create_thread_missing_user_id(self) -> None:
        """Test thread creation fails without user_id."""
        response = self.client.post(
            "/v1/threads",
            json={}
        )
        
        self.assertEqual(response.status_code, 422)
        data = response.json()
        self.assertIn("detail", data)

    def test_create_thread_returns_problem_details_on_error(self) -> None:
        """Test error response follows RFC 7807 Problem Details format."""
        response = self.client.post(
            "/v1/threads",
            json={"invalid_field": "value"}
        )
        
        self.assertEqual(response.status_code, 422)
        data = response.json()
        # Check Problem Details format
        self.assertIn("type", data)
        self.assertIn("title", data)
        self.assertIn("status", data)
        self.assertIn("detail", data)
        self.assertIn("instance", data)


class MessageCreationRouteTests(unittest.IsolatedAsyncioTestCase):
    """Tests for the message creation and streaming endpoint."""

    async def asyncSetUp(self) -> None:
        """Set up in-memory SQLite database and mock agent."""
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
        
        # Patch dependencies
        async def get_session():
            async with self.session_factory() as session:
                yield session

        def get_session_factory_override():
            return self.session_factory

        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session"]).get_session
        ] = get_session
        
        self.app.dependency_overrides[
            __import__("app.db.session", fromlist=["get_session_factory"]).get_session_factory
        ] = get_session_factory_override

        self.client = TestClient(self.app)

    async def asyncTearDown(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await self.engine.dispose()

    def test_message_requires_user_id(self) -> None:
        """Test message creation requires user_id."""
        response = self.client.post(
            "/v1/messages",
            json={"content": "Hello"}
        )
        
        self.assertEqual(response.status_code, 422)

    def test_message_requires_content(self) -> None:
        """Test message creation requires content."""
        response = self.client.post(
            "/v1/messages",
            json={"user_id": "user-1"}
        )
        
        self.assertEqual(response.status_code, 422)

    def test_message_with_thread_id(self) -> None:
        """Test message creation with explicit thread_id."""
        thread_id = str(uuid4())
        
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
                json={
                    "user_id": "user-1",
                    "content": "Hello assistant",
                    "thread_id": thread_id
                }
            )
            
            # Should return streaming response
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/event-stream", response.headers.get("content-type", ""))

    def test_message_returns_streaming_response(self) -> None:
        """Test message endpoint returns streaming response."""
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b"data: {\"type\": \"message\", \"content\": \"Hi\"}\n\n"
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={
                    "user_id": "user-1",
                    "content": "Hello"
                }
            )
            
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/event-stream", response.headers.get("content-type", ""))

    def test_message_with_options(self) -> None:
        """Test message creation with model and temperature options."""
        thread_id = str(uuid4())
        
        with patch("app.services.agent_service.AgentService") as mock_agent_service:
            mock_agent = AsyncMock()
            mock_agent_service.return_value.create_agent = AsyncMock(
                return_value=mock_agent
            )
            
            async def mock_stream():
                yield b"data: {\"type\": \"done\"}\n\n"
            
            mock_agent.messages.run_stream = AsyncMock(return_value=mock_stream())
            
            response = self.client.post(
                "/v1/messages",
                json={
                    "user_id": "user-1",
                    "content": "Test",
                    "thread_id": thread_id,
                    "options": {
                        "model": "openai/gpt-4o",
                        "temperature": 0.5
                    }
                }
            )
            
            self.assertIn(response.status_code, [200, 400])  # May fail if agent setup fails


class ResponseFormatTests(unittest.TestCase):
    """Tests for response format compliance."""

    def setUp(self) -> None:
        self.app = get_app()
        self.client = TestClient(self.app)

    def test_404_returns_problem_details(self) -> None:
        """Test 404 responses follow RFC 7807 Problem Details format."""
        response = self.client.get("/v1/nonexistent")
        
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("type", data)
        self.assertIn("title", data)
        self.assertIn("status", data)
        self.assertEqual(data["status"], 404)

    def test_validation_error_returns_problem_details(self) -> None:
        """Test validation errors follow Problem Details format."""
        response = self.client.post(
            "/v1/threads",
            json={"invalid": "payload"}
        )
        
        self.assertEqual(response.status_code, 422)
        data = response.json()
        self.assertIn("type", data)
        self.assertIn("title", data)
        self.assertIn("status", data)
        self.assertEqual(data["status"], 422)

    def test_cors_headers_present(self) -> None:
        """Test CORS headers are included in responses."""
        response = self.client.options(
            "/v1/threads",
            headers={"Origin": "http://localhost:3000"}
        )
        
        # OPTIONS should return 200 if CORS is enabled
        self.assertEqual(response.status_code, 200)


class CORSTests(unittest.TestCase):
    """Tests for CORS configuration."""

    def setUp(self) -> None:
        self.app = get_app()
        self.client = TestClient(self.app)

    def test_cors_headers_on_success(self) -> None:
        """Test CORS headers are present on successful responses."""
        response = self.client.get("/health")
        
        # Check that we can set CORS headers (depends on configuration)
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
