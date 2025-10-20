from __future__ import annotations

from typing import Any, List, Optional, Union
from uuid import uuid4, UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.db.message import Message, MessageRole


class MessageService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_message(
        self,
        *,
        thread_id: Union[str, UUID],
        user_id: str,
        text: str,
        role: MessageRole,
        tools_used: Optional[Any] = None,
    ) -> Message:
        message = Message(
            message_id=uuid4(),
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
        thread_id: Union[str, UUID],
        user_id: str,
        text: str,
        tools_used: Optional[Any] = None,
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
        thread_id: Union[str, UUID],
        user_id: str,
        text: str,
        tools_used: Optional[Any] = None,
    ) -> Message:
        return await self.create_message(
            thread_id=thread_id,
            user_id=user_id,
            text=text,
            role=MessageRole.ASSISTANT,
            tools_used=tools_used,
        )

    async def get_thread_messages(
        self,
        *,
        thread_id: Union[str, UUID],
        limit: Optional[int] = None,
    ) -> List[Message]:
        """Get messages for a thread, ordered by creation time (oldest first).
        
        Args:
            thread_id: The thread ID to get messages for
            limit: Maximum number of messages to retrieve (most recent if limited)
            
        Returns:
            List of messages ordered by creation time (oldest first)
        """
        query = (
            select(Message)
            .where(Message.thread_id == thread_id)
            .order_by(Message.created_at.desc())  # Get most recent first for limit
        )
        
        if limit:
            query = query.limit(limit)
        
        result = await self.session.execute(query)
        messages = list(result.scalars().all())
        
        # Reverse to get chronological order (oldest first)
        messages.reverse()
        
        return messages
