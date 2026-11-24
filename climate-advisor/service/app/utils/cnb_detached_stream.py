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
    renew: Callable[[], Awaitable[bool]],
    renew_seconds: float,
    release: Callable[[], Awaitable[None]],
) -> AsyncGenerator[bytes, None]:
    """Run ``source`` until done, ``deadline`` or a lost lease, then ``release``.

    ``renew`` runs every ``renew_seconds`` regardless of subscriber or model
    pace. When it reports that the lease is gone, generation stops; persistence
    separately refuses writes from a turn that no longer owns the thread.
    """
    queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=256)
    subscribed = True
    lease_lost = False

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

    async def keep_lease(limit: asyncio.Timeout) -> None:
        nonlocal lease_lost
        while True:
            await asyncio.sleep(renew_seconds)
            try:
                if await renew():
                    continue
            except Exception:
                # A failed renewal retries; an expired lease then reports False.
                logger.exception("Failed to renew Concept Note reply turn")
                continue
            lease_lost = True
            limit.reschedule(asyncio.get_running_loop().time())
            return

    async def produce() -> None:
        terminal = []
        try:
            async with asyncio.timeout_at(deadline) as limit, aclosing(source):
                renewer = asyncio.create_task(keep_lease(limit))
                try:
                    async for chunk in source:
                        if chunk.startswith((b"event: done\n", b"event: error\n")):
                            terminal.append(chunk)
                        else:
                            publish(chunk)
                finally:
                    renewer.cancel()
        except TimeoutError:
            if lease_lost:
                logger.warning("Concept Note reply lost its turn lease")
                message = "This reply was interrupted. Please try again."
            else:
                logger.warning("Concept Note reply exceeded its turn deadline")
                message = "The reply timed out."
            terminal = [format_sse({"message": message}, event="error").encode()]
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
