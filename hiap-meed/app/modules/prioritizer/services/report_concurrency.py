"""Per-pod admission control for City Action Report generation."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

DEFAULT_MAX_CONCURRENT_REPORTS = 3
DEFAULT_QUEUE_TIMEOUT_SECONDS = 120.0


class ReportGenerationCapacityError(RuntimeError):
    """Raised when a report cannot enter the per-pod generation queue in time."""


MAX_CONCURRENT_REPORTS = int(
    os.getenv("OUTPUT_PLAN_MAX_CONCURRENT_REPORTS", str(DEFAULT_MAX_CONCURRENT_REPORTS))
)
QUEUE_TIMEOUT_SECONDS = float(
    os.getenv("OUTPUT_PLAN_QUEUE_TIMEOUT_SECONDS", str(DEFAULT_QUEUE_TIMEOUT_SECONDS))
)
_REPORT_SLOTS = asyncio.BoundedSemaphore(MAX_CONCURRENT_REPORTS)


@asynccontextmanager
async def reserve_report_generation_slot() -> AsyncIterator[None]:
    """
    Reserve one per-pod report slot or fail after the configured queue timeout.

    Waiting callers suspend without holding FastAPI thread-pool workers, chapter
    workers, or report-specific LLM resources.
    The slot is always released when report generation finishes or raises.
    """
    try:
        await asyncio.wait_for(
            _REPORT_SLOTS.acquire(),
            timeout=QUEUE_TIMEOUT_SECONDS,
        )
    except TimeoutError as error:
        raise ReportGenerationCapacityError(
            "Report generation is currently busy; retry shortly"
        ) from error
    try:
        yield
    finally:
        _REPORT_SLOTS.release()
