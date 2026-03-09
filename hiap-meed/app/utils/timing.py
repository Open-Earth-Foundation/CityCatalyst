"""Timing helpers for block and pipeline instrumentation."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from time import perf_counter
from typing import Iterator


@dataclass
class TimedBlock:
    """Stores elapsed duration for a named block."""

    name: str
    elapsed_seconds: float = 0.0
    _start_time: float = 0.0


@contextmanager
def time_block(name: str) -> Iterator[TimedBlock]:
    """Context manager that captures elapsed seconds for a named block."""
    block = TimedBlock(name=name)
    block._start_time = perf_counter()
    try:
        yield block
    finally:
        block.elapsed_seconds = perf_counter() - block._start_time


__all__ = ["TimedBlock", "time_block"]
