import asyncio
import time
from contextlib import asynccontextmanager
from contextvars import ContextVar
from threading import Event
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from app.main import get_app
from app.models.requests import MessageCreateRequest
from app.routes import health
from app.utils import mlflow_logging
from app.utils.sse import format_sse
from app.utils.streaming_handler import StreamingHandler
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client() -> TestClient:
    """Create an isolated test client for health-route checks."""
    return TestClient(get_app())


def test_readiness_returns_ready_when_database_query_succeeds() -> None:
    session = AsyncMock()

    @asynccontextmanager
    async def open_session():
        yield session

    with patch(
        "app.routes.health.get_session_factory",
        return_value=open_session,
    ):
        response = _client().get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    session.execute.assert_awaited_once()


def test_readiness_returns_503_when_database_is_not_configured() -> None:
    with patch(
        "app.routes.health.get_session_factory",
        side_effect=RuntimeError("CA_DATABASE_URL is not configured"),
    ):
        response = _client().get("/ready")

    assert response.status_code == 503
    assert response.json()["detail"] == "Workflow database is unavailable"


def test_readiness_returns_503_when_database_query_fails() -> None:
    session = AsyncMock()
    session.execute.side_effect = OSError("database is unreachable")

    @asynccontextmanager
    async def open_session():
        yield session

    with patch(
        "app.routes.health.get_session_factory",
        return_value=open_session,
    ):
        response = _client().get("/ready")

    assert response.status_code == 503
    assert response.json()["detail"] == "Workflow database is unavailable"


@pytest.mark.parametrize("blocked_stage", ["acquire", "query"])
async def test_readiness_times_out_and_closes_session(monkeypatch, blocked_stage):
    closed = asyncio.Event()
    session = AsyncMock()

    async def query(*args):
        await asyncio.Event().wait()

    session.execute.side_effect = query if blocked_stage == "query" else None

    @asynccontextmanager
    async def open_session():
        try:
            if blocked_stage == "acquire":
                await asyncio.Event().wait()
            yield session
        finally:
            closed.set()

    monkeypatch.setattr(health, "get_session_factory", lambda: open_session)
    monkeypatch.setattr(health, "READINESS_TIMEOUT_SECONDS", 0.02)
    app = FastAPI()
    app.include_router(health.router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await asyncio.wait_for(client.get("/ready"), timeout=0.5)
        assert response.status_code == 503
        assert closed.is_set()
        assert (await client.get("/health")).status_code == 200


@pytest.mark.parametrize(
    "stage", ["initialize", "create", "batch", "json", "text", "wait", "close"]
)
async def test_health_responds_while_chat_telemetry_is_blocked(monkeypatch, stage):
    """Hold actual chat telemetry in a thread until an independent health request succeeds.

    The two-second escape avoids hanging the old implementation. Measure from
    the blocking call's start so event-loop starvation cannot hide the delay.
    """
    blocked = Event()
    release = Event()
    started_at = []
    client = MagicMock()

    def slow_operation():
        if not blocked.is_set():
            started_at.append(time.perf_counter())
            blocked.set()
            release.wait(timeout=2)

    def initialize():
        if stage == "initialize":
            slow_operation()
        return True

    def create(**kwargs):
        if stage == "create":
            slow_operation()
        return SimpleNamespace(info=SimpleNamespace(run_id="health-test"))

    def batch(**kwargs):
        if stage == "batch":
            slow_operation()
        return SimpleNamespace(wait=slow_operation if stage == "wait" else lambda: None)

    client.create_run.side_effect = create
    client.log_batch.side_effect = batch
    for method, name in (
        (client.log_dict, "json"),
        (client.log_text, "text"),
        (client.set_terminated, "close"),
    ):
        if stage == name:
            method.side_effect = lambda *args, **kwargs: slow_operation()
    monkeypatch.setattr(mlflow_logging, "initialize_mlflow", initialize)
    monkeypatch.setattr(
        mlflow_logging, "_experiment_id", lambda name: "experiment-test"
    )
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("health_test_run", default=None)
    )
    monkeypatch.setattr(
        mlflow_logging,
        "mlflow",
        SimpleNamespace(tracking=SimpleNamespace(MlflowClient=lambda: client)),
    )

    service = MagicMock()
    service.preferred_model_for_context.return_value = "test-model"
    service.create_agent = AsyncMock(return_value=object())
    service.close = AsyncMock()
    service.current_cc_token.return_value = None
    monkeypatch.setattr(
        "app.utils.streaming_handler.AgentService", lambda **kwargs: service
    )
    monkeypatch.setattr(
        StreamingHandler, "_load_conversation_history", AsyncMock(return_value=[])
    )

    async def answer(self, *args):
        self.assistant_tokens.append("Answer")
        yield format_sse({"index": 0, "content": "Answer"}, event="message").encode()

    monkeypatch.setattr(StreamingHandler, "_stream_agent_events", answer)
    handler = StreamingHandler(
        thread_id="health-test", user_id="test-user", session_factory=None
    )

    async def collect():
        return [
            chunk
            async for chunk in handler.stream_response(
                MessageCreateRequest(user_id="test-user", content="Help")
            )
        ]

    app = FastAPI()
    app.include_router(health.router)
    chat = asyncio.create_task(collect())
    try:
        assert await asyncio.to_thread(blocked.wait, 3)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://test"
        ) as browser:
            response = await browser.get("/health")
        assert response.status_code == 200
        assert time.perf_counter() - started_at[0] < 0.5
        assert not chat.done()
    finally:
        release.set()
        await asyncio.wait_for(chat, timeout=3)
    client.set_terminated.assert_called_once()
