"""Exercise real Agents/OpenAI streaming and retries with a controlled HTTP provider."""

import asyncio
import json
from collections.abc import AsyncIterator, Callable
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
from agents import Agent, FunctionTool, OpenAIResponsesModel
from app.models.requests import MessageCreateRequest
from app.utils.streaming_handler import StreamingHandler
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from app.config import get_settings


def _event(kind: str, **fields: object) -> dict:
    return {"type": kind, "sequence_number": 1, **fields}


def _delta(text: str) -> dict:
    return _event(
        "response.output_text.delta",
        item_id="msg-test",
        content_index=0,
        output_index=0,
        delta=text,
        logprobs=[],
    )


def _completed(output: list[dict]) -> dict:
    return _event(
        "response.completed",
        response={
            "id": "resp-test",
            "object": "response",
            "created_at": 1,
            "status": "completed",
            "model": "test-model",
            "output": output,
            "parallel_tool_calls": False,
            "tool_choice": "auto",
            "tools": [],
        },
    )


def _answer() -> list[dict]:
    return [
        _delta("Recovered answer"),
        _completed(
            [
                {
                    "type": "message",
                    "id": "msg-test",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Recovered answer",
                            "annotations": [],
                        }
                    ],
                }
            ]
        ),
    ]


class ProviderStream(httpx.AsyncByteStream):
    def __init__(self, events: list[dict], error: Exception | None = None) -> None:
        self.events = events
        self.error = error
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for event in self.events:
            yield ("data: " + json.dumps(event) + "\n\n").encode()
            await asyncio.sleep(0)
        if self.error is not None:
            raise self.error

    async def aclose(self) -> None:
        self.closed = True


@pytest.fixture
def chat(monkeypatch):
    """Keep the application and SDK real; isolate HTTP, history, and persistence."""

    async def run(provider: Callable, *, tools: list | None = None):
        requests = []
        streams = []

        async def transport(request: httpx.Request) -> httpx.Response:
            requests.append(json.loads(request.content))
            result = provider(len(requests))
            if isinstance(result, httpx.Response):
                return result
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
        service = MagicMock()
        service.preferred_model_for_context.return_value = "test-model"
        service.create_agent = AsyncMock(return_value=agent)
        service.close = AsyncMock()
        service.current_cc_token.return_value = None
        persist = AsyncMock(return_value=True)
        monkeypatch.setattr(
            "app.utils.streaming_handler.AgentService", lambda **kwargs: service
        )
        monkeypatch.setattr(
            StreamingHandler, "_load_conversation_history", AsyncMock(return_value=[])
        )
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
        original_config = handler._run_config

        def config(payload):
            result = original_config(payload)
            if result.model_settings and result.model_settings.retry:
                result.model_settings.retry.backoff.initial_delay = 0
                result.model_settings.retry.backoff.max_delay = 0
            return result

        monkeypatch.setattr(handler, "_run_config", config)
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
        service.close.assert_awaited_once()
        return SimpleNamespace(
            requests=requests,
            events=events,
            done=events[-1][1],
            persist=persist,
            text="".join(data["content"] for name, data in events if name == "message"),
        )

    return run


@pytest.mark.parametrize(
    "error_type", [httpx.ReadTimeout, httpx.ReadError, httpx.RemoteProtocolError]
)
async def test_recovers_disconnect_after_headers_before_answer(chat, error_type):
    result = await chat(
        lambda attempt: (
            ProviderStream(
                [
                    _event(
                        "response.created", response={"id": "resp-first", "output": []}
                    )
                ],
                error_type("controlled disconnect"),
            )
            if attempt == 1
            else ProviderStream(_answer())
        )
    )
    assert len(result.requests) == 2
    assert result.done["ok"] is True
    assert result.done["history_saved"] is True
    assert result.text == "Recovered answer"
    assert not any(name == "error" for name, _ in result.events)
    result.persist.assert_awaited_once()


async def test_repeated_disconnect_exhausts_bounded_budget(chat):
    result = await chat(
        lambda attempt: ProviderStream([], httpx.ReadTimeout("offline"))
    )
    assert len(result.requests) == 3
    assert result.done["ok"] is False
    assert result.done["history_saved"] is False
    assert result.text == ""
    result.persist.assert_not_awaited()


async def test_partial_answer_is_not_replayed_or_reported_as_saved(chat):
    result = await chat(
        lambda attempt: ProviderStream(
            [_delta("Partial answer")], httpx.ReadTimeout("offline")
        )
    )
    assert len(result.requests) == 1
    assert result.text == "Partial answer"
    assert result.done["ok"] is False
    assert result.done["history_saved"] is False
    result.persist.assert_not_awaited()


async def test_connection_failure_does_not_multiply_provider_retry_budget(chat):
    def provider(attempt):
        raise httpx.ReadTimeout("failed before response headers")

    result = await chat(provider)
    assert (
        len(result.requests) == 4
    )  # Initial request plus the existing SDK's three retries.
    assert result.done["ok"] is False
    result.persist.assert_not_awaited()


async def test_authentication_error_is_not_retried(chat):
    result = await chat(
        lambda attempt: httpx.Response(401, json={"error": {"message": "invalid key"}})
    )
    assert len(result.requests) == 1
    assert result.done["ok"] is False
    result.persist.assert_not_awaited()


async def test_provider_status_retry_still_recovers(chat):
    result = await chat(
        lambda attempt: (
            httpx.Response(503, json={"error": {"message": "busy"}})
            if attempt == 1
            else ProviderStream(_answer())
        )
    )
    assert len(result.requests) == 2
    assert result.done["ok"] is True
    result.persist.assert_awaited_once()


async def test_retry_after_completed_tool_does_not_execute_tool_twice(chat):
    updates = []

    async def update_note(context, arguments):
        updates.append(arguments)
        return "Saved"

    tool = FunctionTool(
        name="update_note",
        description="Update a note",
        params_json_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
            "required": [],
        },
        on_invoke_tool=update_note,
    )
    call = {
        "type": "function_call",
        "id": "fc-test",
        "call_id": "call-test",
        "name": "update_note",
        "arguments": "{}",
        "status": "completed",
    }

    def provider(attempt):
        if attempt == 1:
            return ProviderStream(
                [
                    _event(
                        "response.output_item.added",
                        output_index=0,
                        item={**call, "status": "in_progress"},
                    ),
                    _event("response.output_item.done", output_index=0, item=call),
                    _completed([call]),
                ]
            )
        if attempt == 2:
            return ProviderStream(
                [], httpx.ReadTimeout("disconnect on answer after tool")
            )
        return ProviderStream(_answer())

    result = await chat(provider, tools=[tool])
    assert len(result.requests) == 3
    assert updates == ["{}"]
    assert result.requests[1]["input"] == result.requests[2]["input"]
    assert result.text == "Recovered answer"
    assert result.done["ok"] is True
    result.persist.assert_awaited_once()


async def test_interrupted_tool_output_does_not_replay(chat):
    call = {
        "type": "function_call",
        "id": "fc-test",
        "call_id": "call-test",
        "name": "update_note",
        "arguments": "",
        "status": "in_progress",
    }
    result = await chat(
        lambda attempt: ProviderStream(
            [
                _event("response.output_item.added", output_index=0, item=call),
            ],
            httpx.ReadTimeout("disconnect in tool arguments"),
        )
    )
    assert len(result.requests) == 1
    assert result.done["ok"] is False
    result.persist.assert_not_awaited()


@pytest.mark.parametrize("before_headers", [True, False])
async def test_disabled_stream_recovery_preserves_provider_retries(
    chat, monkeypatch, before_headers
):
    monkeypatch.setattr(get_settings().llm.streaming, "retry_attempts", 0)

    def provider(attempt):
        if before_headers:
            raise httpx.ReadTimeout("failed before headers")
        return ProviderStream([], httpx.ReadTimeout("failed after headers"))

    result = await chat(provider)
    assert len(result.requests) == (4 if before_headers else 1)
    assert result.done["ok"] is False


async def test_cancelled_stream_closes_provider_without_retry(chat):
    reading = asyncio.Event()
    closed = asyncio.Event()
    attempts = []

    class PendingStream(ProviderStream):
        async def __aiter__(self):
            reading.set()
            await asyncio.Event().wait()
            yield b""

        async def aclose(self):
            await super().aclose()
            closed.set()

    def provider(attempt):
        attempts.append(attempt)
        return PendingStream([])

    task = asyncio.create_task(chat(provider))
    await asyncio.wait_for(reading.wait(), timeout=3)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.wait_for(closed.wait(), timeout=1)
    assert attempts == [1]
