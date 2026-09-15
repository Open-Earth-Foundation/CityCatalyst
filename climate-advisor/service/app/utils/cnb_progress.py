"""Request-local workflow events and provider-visible reasoning text."""

from collections.abc import Awaitable, Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Literal
from uuid import uuid4

from app.utils.sse import format_sse
from agents import Agent, RunConfig, RunResultStreaming

_sink: ContextVar[Callable[[bytes], Awaitable[None]] | None] = ContextVar(
    "cnb_progress_sink", default=None
)


async def emit_cnb_reasoning(
    event: Any,
    *,
    stream_id: str,
    stage: Literal["chat", "planning", "reviewing"],
    chapter_title: str | None = None,
) -> None:
    """Forward readable SDK deltas only, never opaque/encrypted reasoning items.

    OpenRouter exposes OpenAI summaries through its legacy reasoning text field;
    the Agents SDK maps that field to response.reasoning_text.delta.
    """
    sink = _sink.get()
    if sink is None or getattr(event, "type", "") not in {
        "response.reasoning_summary_text.delta",
        "response.reasoning_text.delta",
    }:
        return
    delta = getattr(event, "delta", None)
    if not isinstance(delta, str) or not delta:
        return
    await sink(
        format_sse(
            {
                "id": stream_id,
                "stage": stage,
                "chapter_title": chapter_title,
                "delta": delta,
            },
            event="reasoning",
        ).encode("utf-8")
    )


async def run_with_cnb_reasoning(
    runner: Any,
    agent: Agent,
    payload: str,
    *,
    run_config: RunConfig,
    stage: Literal["planning", "reviewing"],
    chapter_title: str,
) -> RunResultStreaming:
    """Consume a chapter model stream while retaining its typed final result."""
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
    try:
        yield
    finally:
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
