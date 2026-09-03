"""Bounded asynchronous TTL cache with per-key request coalescing."""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass
from typing import Generic, TypeVar

ValueT = TypeVar("ValueT")


@dataclass(frozen=True)
class _CacheEntry(Generic[ValueT]):
    """One cached value and its monotonic expiry timestamp."""

    value: ValueT
    expires_at: float


class SingleFlightTTLCache(Generic[ValueT]):
    """Reuse successful values and coalesce concurrent loads for each key."""

    def __init__(
        self,
        *,
        max_entries: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Initialize a bounded cache using a monotonic clock."""
        if max_entries < 1:
            raise ValueError("max_entries must be positive")
        self._max_entries = max_entries
        self._clock = clock
        self._values: OrderedDict[Hashable, _CacheEntry[ValueT]] = OrderedDict()
        self._inflight: dict[Hashable, asyncio.Task[ValueT]] = {}

    async def get_or_load(
        self,
        key: Hashable,
        *,
        ttl_seconds: float,
        loader: Callable[[], Awaitable[ValueT]],
    ) -> ValueT:
        """Return a live value or share one in-flight load for the key.

        Loader failures are propagated and never cached. A non-positive TTL still
        coalesces concurrent callers but does not retain the successful value.
        """
        now = self._clock()
        entry = self._values.get(key)
        if entry is not None:
            if entry.expires_at > now:
                self._values.move_to_end(key)
                return entry.value
            self._values.pop(key, None)

        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(
                self._load(
                    key,
                    expires_at=now + max(0.0, ttl_seconds),
                    loader=loader,
                )
            )
            self._inflight[key] = task
        return await asyncio.shield(task)

    async def _load(
        self,
        key: Hashable,
        *,
        expires_at: float,
        loader: Callable[[], Awaitable[ValueT]],
    ) -> ValueT:
        """Load one value, retaining only successful results with a positive TTL."""
        try:
            value = await loader()
            now = self._clock()
            if expires_at > now:
                self._discard_expired(now)
                self._values[key] = _CacheEntry(
                    value=value,
                    expires_at=expires_at,
                )
                self._values.move_to_end(key)
                while len(self._values) > self._max_entries:
                    self._values.popitem(last=False)
            return value
        finally:
            if self._inflight.get(key) is asyncio.current_task():
                self._inflight.pop(key, None)

    def _discard_expired(self, now: float) -> None:
        """Remove expired values before enforcing the cache size bound."""
        expired_keys = [
            key for key, entry in self._values.items() if entry.expires_at <= now
        ]
        for key in expired_keys:
            self._values.pop(key, None)
