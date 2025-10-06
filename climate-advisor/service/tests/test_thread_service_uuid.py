from __future__ import annotations

import unittest
from unittest.mock import AsyncMock

from app.exceptions import ThreadNotFoundException
from app.services.thread_service import ThreadService


class ThreadServiceUUIDValidationTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_uuid_raises_not_found(self) -> None:
        session = AsyncMock()
        service = ThreadService(session)

        with self.assertRaises(ThreadNotFoundException):
            await service.get_thread('not-a-valid-uuid')

        session.execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
