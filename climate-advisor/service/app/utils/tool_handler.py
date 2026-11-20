"""Utility helpers for persistence of assistant messages (post-stream).

Handles:
- Persisting assistant messages with tool invocation metadata
- Always stores full tool details to database (for audit trail)
- Note: Trimming of tool metadata for LLM context happens in history_manager
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


async def persist_assistant_message(
    *,
    session_factory: Optional[async_sessionmaker[AsyncSession]],
    thread_id: Any,
    user_id: str,
    assistant_content: str,
    tool_invocations: Optional[List[dict]],
    message_id: UUID | None = None,
    question_reply_claim: tuple[UUID, str] | None = None,
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
        from app.models.db.message import Message
        from app.services.cnb.question_reply import REPLY_MARKER, cnb_message_time, thread_run_id
        from app.services.message_service import MessageService
        from app.services.thread_service import ThreadService

        async with session_factory() as session:
            message_service = MessageService(session)
            thread_service = ThreadService(session)
            thread = await thread_service.get_thread(thread_id)
            if thread is None or thread.user_id != user_id:
                return False
            is_cnb = bool(thread_run_id(thread))
            if is_cnb:
                thread = await thread_service.get_thread(thread_id, for_update=True)
            if question_reply_claim is not None:
                reply = await session.get(Message, question_reply_claim[0])
                marker = (
                    reply.tools_used[0]
                    if reply and isinstance(reply.tools_used, list) and reply.tools_used
                    else None
                )
                # The thread lock fences an expired request against a newer retry.
                if not isinstance(marker, dict) or (
                    marker.get("claim_id") != question_reply_claim[1]
                    or marker.get("name") != REPLY_MARKER
                    or not marker.get("active")
                    or reply.thread_id != thread.thread_id
                    or reply.user_id != user_id
                ):
                    return False
            try:
                # Always persist full tool metadata to database
                await message_service.create_assistant_message(
                    thread_id=thread.thread_id,
                    user_id=user_id,
                    text=assistant_content,
                    tools_used=tool_invocations or None,
                    message_id=message_id,
                    created_at=(
                        await cnb_message_time(session, thread.thread_id) if is_cnb else None
                    ),
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
