from __future__ import annotations

from typing import Optional
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.db.message import Message, MessageRole


class MessageService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_message(
        self,
        *,
        thread_id: str,
        user_id: str,
        text: str,
        role: MessageRole,
        tools_used: Optional[dict] = None,
    ) -> Message:
        message = Message(
            message_id=str(uuid4()),
            thread_id=thread_id,
            user_id=user_id,
            role=role,
            text=text,
            tools_used=tools_used,
        )
        self.session.add(message)
        await self.session.flush()
        return message

    async def create_user_message(
        self,
        *,
        thread_id: str,
        user_id: str,
        text: str,
        tools_used: Optional[dict] = None,
    ) -> Message:
        return await self.create_message(
            thread_id=thread_id,
            user_id=user_id,
            text=text,
            role=MessageRole.USER,
            tools_used=tools_used,
        )

    async def create_assistant_message(
        self,
        *,
        thread_id: str,
        user_id: str,
        text: str,
        tools_used: Optional[dict] = None,
    ) -> Message:
        return await self.create_message(
            thread_id=thread_id,
            user_id=user_id,
            text=text,
            role=MessageRole.ASSISTANT,
            tools_used=tools_used,
        )
