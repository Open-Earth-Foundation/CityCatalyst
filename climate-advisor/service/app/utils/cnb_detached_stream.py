"""Run an accepted CNB turn independently of its SSE subscriber."""

import asyncio
import logging
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import aclosing

from app.utils.sse import format_sse
from app.utils.sse_heartbeat import with_sse_heartbeats

logger = logging.getLogger(__name__)
_tasks: set[asyncio.Task[None]] = set()


def start_detached_cnb_stream(
    source: AsyncGenerator[bytes, None],
    *,
    deadline: float,
    release: Callable[[], Awaitable[None]],
) -> AsyncGenerator[bytes, None]:
    queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=256)
    subscribed = True

    def unsubscribe() -> None:
        nonlocal subscribed
        subscribed = False
        while not queue.empty():
            queue.get_nowait()

    def publish(chunk: bytes | None) -> None:
        if not subscribed:
            return
        if queue.full():
            # A slow subscriber may recover from history. It cannot block the turn.
            unsubscribe()
            queue.put_nowait(None)
        else:
            queue.put_nowait(chunk)

    async def produce() -> None:
        terminal = []
        try:
            async with asyncio.timeout_at(deadline), aclosing(source):
                async for chunk in source:
                    if chunk.startswith((b"event: done\n", b"event: error\n")):
                        terminal.append(chunk)
                    else:
                        publish(chunk)
        except TimeoutError:
            logger.warning("Concept Note reply exceeded its turn deadline")
            terminal = [
                format_sse({"message": "The reply timed out."}, event="error").encode()
            ]
        except Exception:
            logger.exception("Detached Concept Note reply failed")
            terminal = [
                format_sse(
                    {"message": "An internal error has occurred."}, event="error"
                ).encode()
            ]
        finally:
            try:
                async with asyncio.timeout(10):
                    await release()
            except TimeoutError:
                logger.warning("Timed out releasing Concept Note reply turn")
            finally:
                # A fast next send after done must see the lease released.
                for chunk in terminal:
                    publish(chunk)
                publish(None)

    async def forward() -> AsyncGenerator[bytes, None]:
        try:
            while (chunk := await queue.get()) is not None:
                yield chunk
        finally:
            unsubscribe()

    task = asyncio.create_task(produce())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return with_sse_heartbeats(forward())
