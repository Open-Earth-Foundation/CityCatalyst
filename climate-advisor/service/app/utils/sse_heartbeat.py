"""Keep request-bound SSE responses active while their producer is silent."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from contextlib import aclosing

from anyio import CancelScope

SSE_HEARTBEAT_INTERVAL_SECONDS = 15.0
SSE_HEARTBEAT = b": keep-alive\n\n"


async def with_sse_heartbeats(
    source: AsyncGenerator[bytes, None],
    *,
    interval_seconds: float = SSE_HEARTBEAT_INTERVAL_SECONDS,
) -> AsyncGenerator[bytes, None]:
    """Forward bytes unchanged and send comments during idle periods.

    Keep the source in one task so tracing context managers enter and exit in
    the same context. The bounded queue preserves backpressure. Disconnects
    still cancel the producer; this transport helper is not durable execution.
    """
    if interval_seconds <= 0:
        raise ValueError("The heartbeat interval must be positive")

    queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)

    async def produce() -> None:
        # Close the generator in its owning task, including on disconnection.
        async with aclosing(source):
            async for chunk in source:
                await queue.put(chunk)

    producer = asyncio.create_task(produce())
    next_chunk = asyncio.create_task(queue.get())
    try:
        # Flush response bytes before agent setup or model work can go quiet.
        yield SSE_HEARTBEAT
        while True:
            ready, _ = await asyncio.wait(
                {producer, next_chunk},
                timeout=interval_seconds,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if next_chunk in ready:
                yield next_chunk.result()
                next_chunk = asyncio.create_task(queue.get())
            elif producer in ready:
                # Propagate failures and drain buffered output before closing.
                producer.result()
                if queue.empty():
                    break
                yield await next_chunk
                next_chunk = asyncio.create_task(queue.get())
            else:
                yield SSE_HEARTBEAT
    finally:
        # Starlette's cancellation scope must not interrupt producer cleanup.
        producer.cancel()
        next_chunk.cancel()
        with CancelScope(shield=True):
            await asyncio.gather(producer, next_chunk, return_exceptions=True)
