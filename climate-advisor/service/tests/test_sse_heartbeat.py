"""Transport regression coverage without model calls or a database."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from contextvars import ContextVar
from unittest.mock import AsyncMock

import pytest
from anyio import CancelScope

from app.utils.sse_heartbeat import SSE_HEARTBEAT, with_sse_heartbeats
from app.utils.cnb_progress import emit_cnb_progress


@pytest.mark.asyncio
async def test_child_task_progress_arrives_before_tool_finishes_and_is_request_local():
    release = asyncio.Event()

    async def source(title):
        async def tool():
            await emit_cnb_progress(
                "planning", chapter_title=title, completed=0, total=1
            )
            await release.wait()

        await asyncio.create_task(tool())
        yield b'event: done\ndata: {"ok":true}\n\n'

    streams = [with_sse_heartbeats(source(title)) for title in ("Budget", "Timeline")]
    try:
        for stream in streams:
            assert await anext(stream) == SSE_HEARTBEAT
        chunks = await asyncio.wait_for(asyncio.gather(*(anext(s) for s in streams)), 1)
        for chunk, title in zip(chunks, ("Budget", "Timeline"), strict=True):
            assert b"event: progress" in chunk
            data = json.loads(chunk.decode().split("data: ")[1])
            assert data == {
                "stage": "planning",
                "chapter_title": title,
                "completed": 0,
                "total": 1,
            }
        assert not release.is_set()
        # A caller outside either producer has no sink.
        await emit_cnb_progress("validating")
        release.set()
        for stream in streams:
            assert [chunk async for chunk in stream] == [
                b'event: done\ndata: {"ok":true}\n\n'
            ]
    finally:
        await asyncio.gather(*(s.aclose() for s in streams))


@pytest.mark.asyncio
async def test_silent_work_keeps_running_across_multiple_heartbeats() -> None:
    release = asyncio.Event()
    started = asyncio.Event()
    starts = 0

    async def source() -> AsyncGenerator[bytes, None]:
        nonlocal starts
        starts += 1
        started.set()
        await release.wait()
        yield b'event: done\ndata: {"ok":true}\n\n'

    stream = with_sse_heartbeats(source(), interval_seconds=0.01)
    try:
        assert await anext(stream) == SSE_HEARTBEAT
        await asyncio.wait_for(started.wait(), timeout=1)
        for _ in range(8):
            assert await asyncio.wait_for(anext(stream), timeout=1) == SSE_HEARTBEAT
        assert starts == 1
        release.set()
        assert [chunk async for chunk in stream] == [
            b'event: done\ndata: {"ok":true}\n\n'
        ]
    finally:
        await stream.aclose()


@pytest.mark.asyncio
async def test_event_order_and_tracing_context_survive_backpressure() -> None:
    context: ContextVar[str] = ContextVar("trace", default="outside")
    expected = [f"data: {index}\n\n".encode() for index in range(10)]
    closed = False

    async def source() -> AsyncGenerator[bytes, None]:
        nonlocal closed
        token = context.set("inside")
        try:
            for chunk in expected:
                assert context.get() == "inside"
                yield chunk
        finally:
            context.reset(token)
            closed = True

    actual = []
    async for chunk in with_sse_heartbeats(source()):
        actual.append(chunk)
        await asyncio.sleep(0)
    assert actual == [SSE_HEARTBEAT, *expected]
    assert context.get() == "outside"
    assert closed


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel_source", [False, True])
async def test_producer_failure_is_propagated_without_waiting_for_heartbeat(
    cancel_source: bool,
) -> None:
    async def source() -> AsyncGenerator[bytes, None]:
        yield b"data: started\n\n"
        if cancel_source:
            raise asyncio.CancelledError()
        raise RuntimeError("model failed")

    stream = with_sse_heartbeats(source(), interval_seconds=60)
    assert await anext(stream) == SSE_HEARTBEAT
    assert await anext(stream) == b"data: started\n\n"
    expected_error = asyncio.CancelledError if cancel_source else RuntimeError
    with pytest.raises(expected_error):
        await asyncio.wait_for(anext(stream), timeout=1)


@pytest.mark.asyncio
async def test_disconnect_closes_source_even_inside_cancelled_starlette_scope() -> None:
    started = asyncio.Event()
    closed = asyncio.Event()

    async def source() -> AsyncGenerator[bytes, None]:
        started.set()
        try:
            await asyncio.Event().wait()
            yield b"unreachable"
        finally:
            await asyncio.sleep(0)
            closed.set()

    stream = with_sse_heartbeats(source())
    assert await anext(stream) == SSE_HEARTBEAT
    await asyncio.wait_for(started.wait(), timeout=1)
    with CancelScope() as scope:
        scope.cancel()
        await stream.aclose()
    assert closed.is_set()


@pytest.mark.asyncio
async def test_message_route_emits_heartbeat_before_silent_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.models.requests import MessageCreateRequest
    from app.routes import messages

    closed = asyncio.Event()
    started = asyncio.Event()

    async def silent_response(*args: object) -> AsyncGenerator[bytes, None]:
        started.set()
        try:
            await asyncio.Event().wait()
            yield b"unreachable"
        finally:
            closed.set()

    monkeypatch.setattr(
        messages.ThreadResolver, "resolve_thread", AsyncMock(return_value="thread-1")
    )
    monkeypatch.setattr(messages, "require_chat_context_ready", AsyncMock())
    monkeypatch.setattr(messages.StreamingHandler, "stream_response", silent_response)
    response = await messages.post_message(
        MessageCreateRequest(
            user_id="owner-1", content="change the stage to V from IV"
        ),
        session=None,
        session_factory=None,
    )
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-accel-buffering"] == "no"
    assert (
        await asyncio.wait_for(anext(response.body_iterator), timeout=1)
        == SSE_HEARTBEAT
    )
    await asyncio.wait_for(started.wait(), timeout=1)
    await response.body_iterator.aclose()
    assert closed.is_set()
