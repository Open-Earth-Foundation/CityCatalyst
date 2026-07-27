"""Unit tests for per-pod City Action Report admission control."""

from __future__ import annotations

from threading import BoundedSemaphore

import pytest

from app.modules.prioritizer.services import report_concurrency


def test_default_report_capacity_is_three_per_pod() -> None:
    """Default deployment capacity should admit three active reports per process."""
    assert report_concurrency.DEFAULT_MAX_CONCURRENT_REPORTS == 3


def test_report_slot_times_out_and_is_reusable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A queued request should time out without leaking the occupied report slot."""
    monkeypatch.setattr(report_concurrency, "_REPORT_SLOTS", BoundedSemaphore(1))
    monkeypatch.setattr(report_concurrency, "QUEUE_TIMEOUT_SECONDS", 0.01)

    with report_concurrency.reserve_report_generation_slot():
        with pytest.raises(
            report_concurrency.ReportGenerationCapacityError,
            match="currently busy",
        ):
            with report_concurrency.reserve_report_generation_slot():
                pass

    with report_concurrency.reserve_report_generation_slot():
        pass
