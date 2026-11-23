from __future__ import annotations

import os
from contextvars import ContextVar
from itertools import count
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

# The --run-manual-llm-e2e option and manual_llm skip are shared with evals/.
from evals.conftest import (  # noqa: F401
    pytest_addoption,
    pytest_collection_modifyitems,
)


@pytest.fixture
def mlflow_client(monkeypatch):
    """Isolate explicit run logging without exposing MLflow's fluent API."""
    from app.utils import mlflow_logging

    client = MagicMock()
    ids = count(1)
    client.create_run.side_effect = lambda **kw: SimpleNamespace(
        info=SimpleNamespace(run_id=f"run-{next(ids)}")
    )
    client.log_batch.return_value = None
    monkeypatch.setattr(
        mlflow_logging, "initialize_mlflow", MagicMock(return_value=True)
    )
    monkeypatch.setattr(mlflow_logging, "_experiment_id", lambda name: "experiment-1")
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("test_run", default=None)
    )
    monkeypatch.setattr(
        mlflow_logging,
        "mlflow",
        SimpleNamespace(tracking=SimpleNamespace(MlflowClient=lambda: client)),
    )
    return client


@pytest.fixture
def chat_service(monkeypatch):
    """Stub chat dependencies while retaining the real streaming handler."""
    from app.utils.streaming_handler import StreamingHandler

    service = MagicMock()
    service.preferred_model_for_context.return_value = "test-model"
    service.create_agent = AsyncMock(return_value=object())
    service.close = AsyncMock()
    service.current_cc_token.return_value = None
    monkeypatch.setattr(
        "app.utils.streaming_agent.AgentService", lambda **kw: service
    )
    monkeypatch.setattr(
        StreamingHandler, "_load_conversation_history", AsyncMock(return_value=[])
    )
    return service


@pytest.fixture
def chat(monkeypatch, chat_service):
    """Run one chat request through the real app and SDK against a scripted provider.

    Call it with provider results (ProviderStream, httpx.Response or an exception)
    in request order; the last one repeats. HTTP, history and persistence are
    isolated; the streaming handler, retries and the Agents SDK stay real.
    """
    import json
    from uuid import uuid4

    import httpx
    from agents import Agent, OpenAIResponsesModel
    from fastapi import FastAPI
    from fastapi.responses import StreamingResponse
    from openai import AsyncOpenAI

    from app.config import get_settings
    from app.models.requests import MessageCreateRequest
    from app.utils.streaming_handler import StreamingHandler

    # Retain retry counts while removing backoff from deterministic local tests.
    monkeypatch.setattr(get_settings().llm.streaming, "retry_delay_ms", 0)

    async def run(*responses, tools=None):
        requests = []
        streams = []

        async def transport(request: httpx.Request) -> httpx.Response:
            requests.append(json.loads(request.content))
            # Repeat the final response when testing retry exhaustion.
            result = responses[min(len(requests), len(responses)) - 1]
            if isinstance(result, Exception):
                raise result
            if isinstance(result, httpx.Response):
                return result
            result = type(result)(result.events, result.error)
            streams.append(result)
            return httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                stream=result,
            )

        client = AsyncOpenAI(
            api_key="test-key",
            base_url="https://provider.invalid/v1",
            max_retries=3,
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(transport)),
        )
        # Preserve the configured retry count while avoiding real backoff in tests.
        monkeypatch.setattr(client, "_calculate_retry_timeout", lambda *args: 0)
        agent = Agent(
            name="Stream regression",
            instructions="Reply briefly",
            model=OpenAIResponsesModel(model="test-model", openai_client=client),
            tools=tools or [],
        )
        chat_service.create_agent.return_value = agent
        persist = AsyncMock(return_value=True)
        monkeypatch.setattr(
            "app.utils.streaming_handler.persist_assistant_message", persist
        )

        handler = StreamingHandler(
            thread_id=uuid4(), user_id="test-user", session_factory=None
        )
        payload = MessageCreateRequest(
            user_id="test-user",
            content="How do I get started?",
            context={"concept_note_run_id": str(uuid4())},
        )
        app = FastAPI()

        @app.post("/chat")
        async def stream():
            return StreamingResponse(
                handler.stream_response(payload), media_type="text/event-stream"
            )

        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app), base_url="http://test"
            ) as browser:
                response = await browser.post("/chat")
        finally:
            await client.close()
        events = []
        for frame in response.text.split("\n\n"):
            fields = dict(
                line.split(":", 1) for line in frame.splitlines() if ":" in line
            )
            if "event" in fields and "data" in fields:
                events.append((fields["event"].strip(), json.loads(fields["data"])))
        assert response.status_code == 200
        assert [name for name, _ in events].count("done") == 1
        assert all(stream.closed for stream in streams)
        chat_service.close.assert_awaited_once()
        return SimpleNamespace(
            requests=requests,
            events=events,
            done=events[-1][1],
            persist=persist,
            text="".join(data["content"] for name, data in events if name == "message"),
        )

    return run


def pytest_configure(config: pytest.Config) -> None:
    """Keep every pytest process from writing runs or traces to remote MLflow."""
    os.environ["MLFLOW_ENABLED"] = "false"
