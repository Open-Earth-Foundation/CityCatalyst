"""Utility helpers for persistence of assistant messages (post-stream).

Handles:
- Persisting assistant messages with tool invocation metadata
- Always stores full tool details to database (for audit trail)
- Note: Trimming of tool metadata for LLM context happens in history_manager
"""

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
    """Persist the assistant message to the database with full tool metadata.

    Always persists the complete tool invocation details to the database for:
    - Complete audit trail of all tools used
    - Future retrieval with full context
    - Potential re-analysis or debugging
    
    Note: Trimming of tool metadata for LLM context is handled separately in
    history_manager.build_context() when loading messages for the LLM.

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
                # Always persist full tool metadata to database
                await message_service.create_assistant_message(
                    thread_id=thread.thread_id,
                    user_id=user_id,
                    text=assistant_content,
                    tools_used=tool_invocations or None,
                )
                await thread_service.touch_thread(thread)
                await session.commit()
                
                logger.info(
                    "Assistant message persisted: thread_id=%s, tools_count=%d",
                    thread_id,
                    len(tool_invocations) if tool_invocations else 0,
                )
                return True
            except Exception:
                await session.rollback()
                logger.exception("Failed to persist assistant message")
                return False
    except Exception:
        logger.exception("Failed to persist assistant message")
        return False
