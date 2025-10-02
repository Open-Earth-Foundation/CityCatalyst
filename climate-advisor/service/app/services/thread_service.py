from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Union
from uuid import uuid4, UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..exceptions import ThreadNotFoundException, ThreadAccessDeniedException
from ..models.db.thread import Thread
from ..models.requests import ThreadCreateRequest


class ThreadService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_thread(
        self, payload: ThreadCreateRequest, *, thread_id: Optional[str] = None
    ) -> Thread:
        thread = Thread(
            thread_id=thread_id or uuid4(),
            user_id=payload.user_id,
            inventory_id=payload.inventory_id,
            context=payload.context,
        )
        self.session.add(thread)
        await self.session.flush()
        return thread

    async def get_thread(self, thread_id: Union[str, UUID]) -> Thread | None:
        # Validate UUID format before querying
        if isinstance(thread_id, str):
            try:
                thread_id = UUID(thread_id)
            except ValueError:
                return None

        result = await self.session.execute(
            select(Thread).where(Thread.thread_id == thread_id)
        )
        return result.scalar_one_or_none()

    async def touch_thread(self, thread: Thread) -> None:
        thread.last_updated = datetime.now(timezone.utc)
        await self.session.flush()

    async def get_thread_for_user(self, thread_id: Union[str, UUID], user_id: str) -> Thread:
        """Return the thread if it is owned by ``user_id``.

        Raises:
            ThreadNotFoundException: if the thread does not exist.
            ThreadAccessDeniedException: if the thread belongs to a different user.
        """
        thread = await self.get_thread(thread_id)
        if thread is None:
            raise ThreadNotFoundException(thread_id)
        if thread.user_id != user_id:
            raise ThreadAccessDeniedException()
        return thread
