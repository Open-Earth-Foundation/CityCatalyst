from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock

from app.utils.single_flight_cache import SingleFlightTTLCache


class SingleFlightTTLCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_load_time_does_not_extend_the_requested_ttl(self) -> None:
        now = 10.0
        load_count = 0
        cache = SingleFlightTTLCache[str](max_entries=2, clock=lambda: now)

        async def slow_loader() -> str:
            nonlocal load_count, now
            load_count += 1
            now += 6.0
            return f"value-{load_count}"

        first = await cache.get_or_load("key", ttl_seconds=5, loader=slow_loader)
        second = await cache.get_or_load("key", ttl_seconds=5, loader=slow_loader)

        self.assertEqual((first, second), ("value-1", "value-2"))
        self.assertEqual(load_count, 2)

    async def test_expired_entry_is_reloaded(self) -> None:
        now = 10.0
        cache = SingleFlightTTLCache[str](max_entries=2, clock=lambda: now)
        loader = AsyncMock(side_effect=["first", "second"])

        self.assertEqual(
            await cache.get_or_load("key", ttl_seconds=5, loader=loader),
            "first",
        )
        now = 16.0
        self.assertEqual(
            await cache.get_or_load("key", ttl_seconds=5, loader=loader),
            "second",
        )
        self.assertEqual(loader.await_count, 2)

    async def test_oldest_entry_is_evicted_at_size_limit(self) -> None:
        cache = SingleFlightTTLCache[str](max_entries=2)
        loader = AsyncMock(side_effect=["one", "two", "three", "one-again"])

        await cache.get_or_load("one", ttl_seconds=30, loader=loader)
        await cache.get_or_load("two", ttl_seconds=30, loader=loader)
        await cache.get_or_load("three", ttl_seconds=30, loader=loader)
        reloaded = await cache.get_or_load("one", ttl_seconds=30, loader=loader)

        self.assertEqual(reloaded, "one-again")
        self.assertEqual(loader.await_count, 4)

    async def test_concurrent_failure_is_shared_but_not_retained(self) -> None:
        cache = SingleFlightTTLCache[str](max_entries=2)
        loader = AsyncMock(side_effect=[RuntimeError("failed"), "recovered"])

        first, second = await asyncio.gather(
            cache.get_or_load("key", ttl_seconds=30, loader=loader),
            cache.get_or_load("key", ttl_seconds=30, loader=loader),
            return_exceptions=True,
        )
        recovered = await cache.get_or_load("key", ttl_seconds=30, loader=loader)

        self.assertIsInstance(first, RuntimeError)
        self.assertIsInstance(second, RuntimeError)
        self.assertEqual(recovered, "recovered")
        self.assertEqual(loader.await_count, 2)
