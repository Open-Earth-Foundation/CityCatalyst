"""Unit tests for per-pod City Action Report admission control."""

from __future__ import annotations

import asyncio

import pytest

from app.modules.prioritizer.services import report_concurrency


@pytest.fixture
def anyio_backend() -> str:
    """Run async admission tests on the asyncio backend used by the service."""
    return "asyncio"


def test_default_report_capacity_is_three_per_pod() -> None:
    """Default deployment capacity should admit three active reports per process."""
    assert report_concurrency.DEFAULT_MAX_CONCURRENT_REPORTS == 3


@pytest.mark.anyio
async def test_report_slot_times_out_and_is_reusable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An async queued request should time out without leaking its report slot."""
    monkeypatch.setattr(
        report_concurrency,
        "_REPORT_SLOTS",
        asyncio.BoundedSemaphore(1),
    )
    monkeypatch.setattr(report_concurrency, "QUEUE_TIMEOUT_SECONDS", 0.01)

    async with report_concurrency.reserve_report_generation_slot():
        with pytest.raises(
            report_concurrency.ReportGenerationCapacityError,
            match="currently busy",
        ):
            async with report_concurrency.reserve_report_generation_slot():
                pass

    async with report_concurrency.reserve_report_generation_slot():
        pass


@pytest.mark.anyio
async def test_waiting_report_is_admitted_when_slot_is_released(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A suspended report should resume when capacity becomes available."""
    monkeypatch.setattr(
        report_concurrency,
        "_REPORT_SLOTS",
        asyncio.BoundedSemaphore(1),
    )
    monkeypatch.setattr(report_concurrency, "QUEUE_TIMEOUT_SECONDS", 1.0)

    async def wait_for_slot() -> bool:
        """Return after acquiring and releasing the queued report slot."""
        async with report_concurrency.reserve_report_generation_slot():
            return True

    async with report_concurrency.reserve_report_generation_slot():
        waiter = asyncio.create_task(wait_for_slot())
        await asyncio.sleep(0)
        assert not waiter.done()

    assert await waiter is True
