"""Per-pod admission control for City Action Report generation."""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from threading import BoundedSemaphore

DEFAULT_MAX_CONCURRENT_REPORTS = 3
DEFAULT_QUEUE_TIMEOUT_SECONDS = 120.0


class ReportGenerationCapacityError(RuntimeError):
    """Raised when a report cannot enter the per-pod generation queue in time."""


def _positive_int_environment(name: str, default: int) -> int:
    """Read a strictly positive integer environment setting."""
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _positive_float_environment(name: str, default: float) -> float:
    """Read a strictly positive floating-point environment setting."""
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = float(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be a number") from error
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


MAX_CONCURRENT_REPORTS = _positive_int_environment(
    "OUTPUT_PLAN_MAX_CONCURRENT_REPORTS",
    DEFAULT_MAX_CONCURRENT_REPORTS,
)
QUEUE_TIMEOUT_SECONDS = _positive_float_environment(
    "OUTPUT_PLAN_QUEUE_TIMEOUT_SECONDS",
    DEFAULT_QUEUE_TIMEOUT_SECONDS,
)
_REPORT_SLOTS = BoundedSemaphore(MAX_CONCURRENT_REPORTS)


@contextmanager
def reserve_report_generation_slot() -> Iterator[None]:
    """
    Reserve one per-pod report slot or fail after the configured queue timeout.

    Waiting callers hold no chapter workers or report-specific LLM resources.
    The slot is always released when report generation finishes or raises.
    """
    acquired = _REPORT_SLOTS.acquire(timeout=QUEUE_TIMEOUT_SECONDS)
    if not acquired:
        raise ReportGenerationCapacityError(
            "Report generation is currently busy; retry shortly"
        )
    try:
        yield
    finally:
        _REPORT_SLOTS.release()
