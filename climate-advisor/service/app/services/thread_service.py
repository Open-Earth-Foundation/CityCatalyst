from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.db.thread import Thread
from ..models.requests import ThreadCreateRequest


class ThreadService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_thread(
        self, payload: ThreadCreateRequest, *, thread_id: Optional[str] = None
    ) -> Thread:
        thread = Thread(
            thread_id=thread_id or str(uuid4()),
            user_id=payload.user_id,
            inventory_id=payload.inventory_id,
            context=payload.context,
        )
        self.session.add(thread)
        await self.session.flush()
        return thread

    async def get_thread(self, thread_id: str) -> Thread | None:
        result = await self.session.execute(
            select(Thread).where(Thread.thread_id == thread_id)
        )
        return result.scalar_one_or_none()

    async def touch_thread(self, thread: Thread) -> None:
        thread.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
