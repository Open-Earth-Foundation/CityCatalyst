from __future__ import annotations

import unittest
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models.db.message import Message, MessageRole
from app.models.requests import MessageCreateRequest, ThreadCreateRequest
from app.services.message_service import MessageService
from app.services.thread_service import ThreadService


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


class UserIdentityPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            TEST_DATABASE_URL,
            echo=False,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine, expire_on_commit=False
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def asyncTearDown(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await self.engine.dispose()

    async def _create_thread(
        self, user_id: str, inventory_id: Optional[str] = None
    ) -> str:
        async with self.session_factory() as session:
            service = ThreadService(session)
            payload = ThreadCreateRequest(user_id=user_id, inventory_id=inventory_id)
            thread = await service.create_thread(payload)
            await session.commit()
            return thread.thread_id

    async def test_thread_creation_persists_user_id(self) -> None:
        thread_id = await self._create_thread("user-1")

        async with self.session_factory() as session:
            service = ThreadService(session)
            thread = await service.get_thread(thread_id)
            self.assertIsNotNone(thread)
            assert thread is not None
            self.assertEqual(thread.user_id, "user-1")

    async def test_message_persistence_captures_roles_and_user(self) -> None:
        thread_id = await self._create_thread("user-1")

        async with self.session_factory() as session:
            message_service = MessageService(session)
            await message_service.create_user_message(
                thread_id=thread_id,
                user_id="user-1",
                content="Hello",
            )
            await message_service.create_assistant_message(
                thread_id=thread_id,
                user_id="user-1",
                content="Hi there",
            )
            await session.commit()

            result = await session.execute(select(Message).order_by(Message.created_at))
            messages = result.scalars().all()

            self.assertEqual(len(messages), 2)
            self.assertEqual(messages[0].role, MessageRole.USER.value)
            self.assertEqual(messages[0].user_id, "user-1")
            self.assertEqual(messages[1].role, MessageRole.ASSISTANT.value)
            self.assertEqual(messages[1].user_id, "user-1")

    async def test_get_thread_for_user_allows_owner(self) -> None:
        thread_id = await self._create_thread("user-42")

        async with self.session_factory() as session:
            service = ThreadService(session)
            thread = await service.get_thread_for_user(thread_id, "user-42")
            self.assertEqual(thread.thread_id, thread_id)

    async def test_get_thread_for_user_blocks_other_user(self) -> None:
        thread_id = await self._create_thread("user-42")

        async with self.session_factory() as session:
            service = ThreadService(session)
            with self.assertRaises(PermissionError):
                await service.get_thread_for_user(thread_id, "user-99")


if __name__ == "__main__":
    unittest.main()
