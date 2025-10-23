"""
Lightweight instrumentation helpers to verify real process-level parallelism.

Usage:
    from prioritizer.utils.parallel_probe import ParallelismProbe

    probe = ParallelismProbe(
        enabled=os.getenv("LOG_PARALLELISM", "0") == "1",
        logger=logger,
        task_id=main_task_id,
        subtask_idx=subtask_idx,
    )
    probe.start()
    # ... do work ...
    probe.end()  # or probe.end(failed=True)

The probe logs a single START and a single END line with PID, wall time, and CPU time.
All operations are best-effort and no-op if disabled or unsupported in the environment.
"""

from __future__ import annotations

import os
import time
from typing import Optional


class ParallelismProbe:
    def __init__(self, enabled: bool, logger, task_id: str, subtask_idx: int) -> None:
        self.enabled = enabled
        self.logger = logger
        self.task_id = task_id
        self.subtask_idx = subtask_idx
        self.pid = os.getpid()
        self.start_wall: Optional[float] = None
        self.ru0 = None
        self.resource = None

    def start(self) -> None:
        if not self.enabled:
            return
        self.start_wall = time.perf_counter()
        try:
            import resource  # type: ignore

            self.resource = resource
            self.ru0 = resource.getrusage(resource.RUSAGE_SELF)
        except Exception:
            self.resource = None
            self.ru0 = None
        try:
            self.logger.info(
                "PAR|START|task=%s idx=%s pid=%s",
                self.task_id,
                self.subtask_idx,
                self.pid,
            )
        except Exception:
            pass

    def end(self, failed: bool = False) -> None:
        if not self.enabled:
            return
        try:
            wall = time.perf_counter() - (self.start_wall or time.perf_counter())
            cpu_total = 0.0
            try:
                if self.resource is not None:
                    ru1 = self.resource.getrusage(self.resource.RUSAGE_SELF)
                    if self.ru0 is not None:
                        cpu_total = (ru1.ru_utime - self.ru0.ru_utime) + (
                            ru1.ru_stime - self.ru0.ru_stime
                        )
            except Exception:
                pass
            cpu_pct = (cpu_total / wall * 100.0) if wall > 0 else 0.0
            suffix = " (failed)" if failed else ""
            self.logger.info(
                "PAR|END|task=%s idx=%s pid=%s wall=%.2fs cpu=%.2fs cpu%%=%d%s",
                self.task_id,
                self.subtask_idx,
                self.pid,
                wall,
                cpu_total,
                round(cpu_pct),
                suffix,
            )
        except Exception:
            pass
