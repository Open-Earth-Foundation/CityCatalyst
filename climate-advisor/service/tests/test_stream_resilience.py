"""Exercise real Agents/OpenAI streaming and retries with a controlled HTTP provider.

The `chat` fixture (conftest.py) runs the real app and SDK against ProviderStream.
"""

import asyncio

import httpx
import pytest
from agents import FunctionTool
from app.config import get_settings

from tests.streaming_fixtures import (
    ProviderStream,
    _answer,
    _completed,
    _delta,
    _event,
    _tool_call,
)


@pytest.mark.parametrize(
    "error_type", [httpx.ReadTimeout, httpx.ReadError, httpx.RemoteProtocolError]
)
async def test_recovers_disconnect_after_headers_before_answer(chat, error_type):
    result = await chat(
        ProviderStream(
            [_event("response.created", response={"id": "resp-first", "output": []})],
            error_type("controlled disconnect"),
        ),
        ProviderStream(_answer()),
    )
    assert len(result.requests) == 2
    assert result.done["ok"] is True
    assert result.done["history_saved"] is True
    assert result.text == "Recovered answer"
    assert not any(name == "error" for name, _ in result.events)
    result.persist.assert_awaited_once()


@pytest.mark.parametrize(
    "responses, attempts, ok",
    [
        ((ProviderStream([], httpx.ReadTimeout("offline")),), 3, False),
        ((httpx.ReadTimeout("before headers"),), 4, False),
        ((httpx.Response(401, json={"error": {"message": "invalid key"}}),), 1, False),
        (
            (
                httpx.Response(503, json={"error": {"message": "busy"}}),
                ProviderStream(_answer()),
            ),
            2,
            True,
        ),
    ],
    ids=[
        "body-retries-exhausted",
        "provider-budget-preserved",
        "authentication-not-retried",
        "provider-status-recovers",
    ],
)
async def test_retry_budget_and_completion(chat, responses, attempts, ok):
    result = await chat(*responses)
    assert len(result.requests) == attempts
    assert result.done["ok"] is ok
    assert result.done["history_saved"] is ok
    assert result.text == ("Recovered answer" if ok else "")
    assert result.persist.await_count == int(ok)


async def test_partial_answer_is_not_replayed_or_reported_as_saved(chat):
    result = await chat(
        ProviderStream([_delta("Partial answer")], httpx.ReadTimeout("offline"))
    )
    assert len(result.requests) == 1
    assert result.text == "Partial answer"
    assert result.done["ok"] is False
    assert result.done["history_saved"] is False
    result.persist.assert_not_awaited()


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
    call = _tool_call()

    result = await chat(
        ProviderStream(
            [
                _event(
                    "response.output_item.added",
                    output_index=0,
                    item={**call, "status": "in_progress"},
                ),
                _event("response.output_item.done", output_index=0, item=call),
                _completed([call]),
            ]
        ),
        ProviderStream([], httpx.ReadTimeout("disconnect on answer after tool")),
        ProviderStream(_answer()),
        tools=[tool],
    )
    assert len(result.requests) == 3
    assert updates == ["{}"]
    assert result.requests[1]["input"] == result.requests[2]["input"]
    assert result.text == "Recovered answer"
    assert result.done["ok"] is True
    result.persist.assert_awaited_once()


async def test_interrupted_tool_output_does_not_replay(chat):
    call = _tool_call(status="in_progress", arguments="")
    result = await chat(
        ProviderStream(
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

    error = httpx.ReadTimeout("offline")
    result = await chat(error if before_headers else ProviderStream([], error))
    assert len(result.requests) == (4 if before_headers else 1)
    assert result.done["ok"] is False


async def test_cancelled_stream_closes_provider_and_agent_without_retry(
    chat, chat_service
):
    reading = asyncio.Event()
    closed = asyncio.Event()
    attempts = []

    class PendingStream(ProviderStream):
        async def __aiter__(self):
            attempts.append(1)
            reading.set()
            await asyncio.Event().wait()
            yield b""

        async def aclose(self):
            await super().aclose()
            closed.set()

    task = asyncio.create_task(chat(PendingStream([])))
    await asyncio.wait_for(reading.wait(), timeout=3)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.wait_for(closed.wait(), timeout=1)
    assert attempts == [1]
    chat_service.close.assert_awaited_once()
