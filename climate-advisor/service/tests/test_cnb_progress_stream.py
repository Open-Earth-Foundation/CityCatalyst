"""Worker event delivery, isolation, ordering, and cancellation without heartbeats."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from contextvars import ContextVar

import pytest
from anyio import CancelScope

from app.utils.cnb_progress import emit_cnb_progress, stream_cnb_events


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

    streams = [stream_cnb_events(source(title)) for title in ("Budget", "Timeline")]
    try:
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
    async for chunk in stream_cnb_events(source()):
        actual.append(chunk)
        await asyncio.sleep(0)
    assert actual == expected
    assert context.get() == "outside"
    assert closed


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel_source", [False, True])
async def test_producer_failure_is_propagated_without_waiting_for_more_events(
    cancel_source: bool,
) -> None:
    async def source() -> AsyncGenerator[bytes, None]:
        yield b"data: started\n\n"
        if cancel_source:
            raise asyncio.CancelledError()
        raise RuntimeError("model failed")

    stream = stream_cnb_events(source())
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
            yield b"data: started\n\n"
            await asyncio.Event().wait()
            yield b"unreachable"
        finally:
            await asyncio.sleep(0)
            closed.set()

    stream = stream_cnb_events(source())
    assert await anext(stream) == b"data: started\n\n"
    await asyncio.wait_for(started.wait(), timeout=1)
    with CancelScope() as scope:
        scope.cancel()
        await stream.aclose()
    assert closed.is_set()


@pytest.mark.asyncio
async def test_handler_forwards_worker_progress_without_heartbeat_wrapper(monkeypatch):
    from app.models.requests import MessageCreateRequest
    from app.utils.streaming_handler import StreamingHandler

    release = asyncio.Event()
    closed = asyncio.Event()

    async def source(self, payload, history_warning):
        try:
            await emit_cnb_progress("planning", chapter_title="Budget")
            await release.wait()
            yield b"event: done\ndata: {}\n\n"
        finally:
            closed.set()

    monkeypatch.setattr(StreamingHandler, "_stream_response", source)
    handler = StreamingHandler.__new__(StreamingHandler)
    stream = handler.stream_response(MessageCreateRequest(user_id="owner", content="edit"))
    try:
        chunk = await asyncio.wait_for(anext(stream), 1)
        assert b"event: progress" in chunk
        assert not release.is_set()
        with CancelScope() as scope:
            scope.cancel()
            await stream.aclose()
        assert closed.is_set()
    finally:
        await stream.aclose()
