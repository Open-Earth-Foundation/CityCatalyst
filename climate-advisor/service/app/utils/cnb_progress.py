"""Request-local workflow events and provider-visible reasoning text."""

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable, Iterator
from contextlib import aclosing, contextmanager
from contextvars import ContextVar
from types import SimpleNamespace
from typing import Any, Literal
from uuid import uuid4

from agents import Agent, RunConfig, RunResultStreaming
from anyio import CancelScope

from app.utils.sse import format_sse

_sink: ContextVar[Callable[[bytes], Awaitable[None]] | None] = ContextVar(
    "cnb_progress_sink", default=None
)
_reasoning: ContextVar[dict[str, str] | None] = ContextVar(
    "cnb_reasoning_parts", default=None
)


async def stream_cnb_events(
    source: AsyncGenerator[bytes, None],
) -> AsyncGenerator[bytes, None]:
    """Merge request-local worker events with the answer without adding heartbeats.

    Keep the source and its tracing context in one task, preserve backpressure,
    and cancel it when the consumer disconnects. This is not durable execution.
    """
    queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)

    async def produce() -> None:
        """Own the source lifecycle and expose the queue to its child workers."""
        with bind_cnb_progress(queue.put):
            async with aclosing(source):
                async for chunk in source:
                    await queue.put(chunk)

    producer = asyncio.create_task(produce())
    next_chunk = asyncio.create_task(queue.get())
    try:
        # Forward worker events before the enclosing model/tool call completes.
        while True:
            ready, _ = await asyncio.wait(
                {producer, next_chunk}, return_when=asyncio.FIRST_COMPLETED
            )
            if next_chunk in ready:
                yield next_chunk.result()
                next_chunk = asyncio.create_task(queue.get())
            else:
                producer.result()
                if queue.empty():
                    break
                yield await next_chunk
                next_chunk = asyncio.create_task(queue.get())
    finally:
        # Starlette cancellation must not interrupt worker/source cleanup.
        producer.cancel()
        next_chunk.cancel()
        with CancelScope(shield=True):
            await asyncio.gather(producer, next_chunk, return_exceptions=True)


def has_cnb_progress_sink() -> bool:
    """Tell source workers whether a live request can receive their summaries."""
    return _sink.get() is not None


async def emit_cnb_reasoning(
    event: Any,
    *,
    stream_id: str,
    stage: Literal["chat", "planning", "reviewing", "reading"],
    chapter_title: str | None = None,
) -> None:
    """Reconcile readable deltas and final snapshots within this request only.

    Completed events recover omitted deltas; they cannot create summaries that
    the provider never returned. Encrypted content is never inspected or sent.
    """
    sink = _sink.get()
    parts = _reasoning.get()
    if sink is None or parts is None:
        return
    kind = getattr(event, "type", "")
    if kind in {"response.output_item.done", "response.completed"}:
        items = (
            [event.item]
            if kind == "response.output_item.done"
            else getattr(event.response, "output", [])
        )
        for item in items:
            if getattr(item, "type", "") == "reasoning":
                for index, part in enumerate(getattr(item, "summary", []) or []):
                    await emit_cnb_reasoning(
                        _summary_done(item.id, index, getattr(part, "text", None)),
                        stream_id=stream_id,
                        stage=stage,
                        chapter_title=chapter_title,
                    )
        return
    is_delta = kind in {
        "response.reasoning_summary_text.delta",
        "response.reasoning_text.delta",
    }
    if not is_delta and kind not in {
        "response.reasoning_summary_text.done",
        "response.reasoning_summary_part.done",
        "response.reasoning_text.done",
    }:
        return
    if is_delta:
        text = getattr(event, "delta", None)
    elif kind == "response.reasoning_summary_part.done":
        text = getattr(event.part, "text", None)
    else:
        text = getattr(event, "text", None)
    if not isinstance(text, str) or not text:
        return
    item_id = getattr(event, "item_id", None)
    index = getattr(event, "summary_index", 0)
    part_id = f"{stream_id}:{item_id}:{index}" if item_id else stream_id
    previous = parts.get(part_id, "")
    replacement = not is_delta and not text.startswith(previous)
    delta = text if is_delta or replacement else text[len(previous) :]
    if not delta:
        return
    parts[part_id] = previous + text if is_delta else text
    payload = {
        "id": part_id,
        "stage": stage,
        "chapter_title": chapter_title,
        "delta": delta,
    }
    if replacement:
        payload["replace"] = True
    await sink(format_sse(payload, event="reasoning").encode("utf-8"))


def _summary_done(item_id: str, index: int, text: str | None) -> SimpleNamespace:
    """Normalize a final summary part to the same reconciliation path."""
    return SimpleNamespace(
        type="response.reasoning_summary_text.done",
        item_id=item_id,
        summary_index=index,
        text=text,
    )


async def run_with_cnb_reasoning(
    runner: Any,
    agent: Agent,
    payload: str,
    *,
    run_config: RunConfig,
    stage: Literal["planning", "reviewing", "reading"],
    chapter_title: str | None = None,
) -> RunResultStreaming:
    """Consume a worker stream while retaining its typed final result."""
    result = runner.run_streamed(agent, payload, run_config=run_config)
    stream_id = str(uuid4())
    try:
        async for event in result.stream_events():
            if event.type == "raw_response_event":
                await emit_cnb_reasoning(
                    event.data,
                    stream_id=stream_id,
                    stage=stage,
                    chapter_title=chapter_title,
                )
        return result
    finally:
        if not result.is_complete:
            result.cancel()


@contextmanager
def bind_cnb_progress(sink: Callable[[bytes], Awaitable[None]]) -> Iterator[None]:
    """Share this response's sink with awaited child tasks, then reset it."""
    token = _sink.set(sink)
    reasoning_token = _reasoning.set({})
    try:
        yield
    finally:
        _reasoning.reset(reasoning_token)
        _sink.reset(token)


async def emit_cnb_progress(
    stage: Literal[
        "preparing", "planning", "reviewing", "chapter_completed", "validating"
    ],
    *,
    chapter_title: str | None = None,
    completed: int | None = None,
    total: int | None = None,
) -> None:
    """Emit only explicit workflow metadata; calls outside a stream are no-ops."""
    sink = _sink.get()
    if sink is not None:
        await sink(
            format_sse(
                {
                    "stage": stage,
                    "chapter_title": chapter_title,
                    "completed": completed,
                    "total": total,
                },
                event="progress",
            ).encode("utf-8")
        )
