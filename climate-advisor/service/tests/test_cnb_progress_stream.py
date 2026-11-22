"""Worker progress delivery, request isolation, and cancellation.

Ordering and failure propagation shared with the heartbeat wrapper are in
test_sse_heartbeat.py.
"""

from __future__ import annotations

import asyncio
import json

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
            # Async cleanup must finish even inside Starlette's cancelled scope.
            await asyncio.sleep(0)
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
