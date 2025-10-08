"""Utility helpers for persistence of assistant messages (post-stream)."""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


async def persist_assistant_message(
    *,
    session_factory: Optional[async_sessionmaker[AsyncSession]],
    thread_id: Any,
    user_id: str,
    assistant_content: str,
    tool_invocations: Optional[List[dict]],
) -> bool:
    """
    Persist the assistant message to the database.

    Returns True if successful, False otherwise.
    """
    if session_factory is None:
        logger.warning(
            "Skipping assistant message persistence because database is unavailable"
        )
        return False

    try:
        # Import lazily to avoid circular dependencies.
        from ..services.message_service import MessageService
        from ..services.thread_service import ThreadService

        async with session_factory() as session:
            message_service = MessageService(session)
            thread_service = ThreadService(session)
            thread = await thread_service.get_thread_for_user(thread_id, user_id)
            try:
                await message_service.create_assistant_message(
                    thread_id=thread.thread_id,
                    user_id=user_id,
                    text=assistant_content,
                    tools_used=tool_invocations[0] if tool_invocations else None,
                )
                await thread_service.touch_thread(thread)
                await session.commit()
                return True
            except Exception:
                await session.rollback()
                logger.exception("Failed to persist assistant message")
                return False
    except Exception:
        logger.exception("Failed to persist assistant message")
        return False
