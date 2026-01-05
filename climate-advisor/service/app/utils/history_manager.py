"""Conversation history manager for loading, pruning, and building LLM context.

This module handles:
1. Loading messages from the database
2. Pruning older messages based on retention policy
3. Building LLM-ready context with full tool metadata for preserved turns only
4. Handling DB-optional mode with graceful fallbacks
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import get_settings
from ..models.db.message import Message, MessageRole
from ..services.message_service import MessageService

logger = logging.getLogger(__name__)


class HistoryManager:
    """Manages conversation history loading and pruning."""

    def __init__(
        self,
        thread_id: Any,
        user_id: str,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
    ):
        """Initialize the history manager.
        
        Args:
            thread_id: The thread ID to load history for
            user_id: The user ID (for authorization)
            session_factory: Optional database session factory (DB can be unavailable)
        """
        self.thread_id = thread_id
        self.user_id = user_id
        self.session_factory = session_factory
        self.settings = get_settings()

    async def load_messages(
        self,
        limit: Optional[int] = None,
    ) -> List[Message]:
        """Load messages from database, ordered chronologically (oldest first).
        
        Args:
            limit: Maximum number of messages to load. If not provided, uses 
                   config max_loaded_messages. None disables the limit.
                   
        Returns:
            List of Message objects ordered oldest -> newest. Returns empty list
            if database is unavailable.
        """
        if not self.session_factory:
            logger.debug("Session factory unavailable; returning empty message history")
            return []

        if limit is None:
            retention_cfg = self.settings.llm.conversation.retention
            if retention_cfg:
                limit = retention_cfg.max_loaded_messages or 20
            else:
                limit = 20

        try:
            async with self.session_factory() as session:
                message_service = MessageService(session)
                messages = await message_service.get_thread_messages(
                    thread_id=self.thread_id,
                    limit=limit,
                )
                logger.info(
                    "Loaded %d messages for thread_id=%s, user_id=%s",
                    len(messages),
                    self.thread_id,
                    self.user_id,
                )
                return messages
        except Exception as e:
            logger.warning(
                "Failed to load conversation history for thread_id=%s: %s",
                self.thread_id,
                e,
            )
            return []

    def build_context(
        self,
        messages: List[Message],
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """Build LLM context from messages with pruning applied.
        
        Splits messages into "preserved" (latest N turns with full tool metadata)
        and "pruned" (older turns with tools stripped before sending to LLM).
        
        Note: Full tool metadata remains in the database for all messages.
        Pruning only affects what is sent to the LLM context.
        
        Args:
            messages: List of Message objects, ordered chronologically (oldest first)
            
        Returns:
            Tuple of:
            - context: List of dicts ready for LLM {"role": "...", "content": "...", ...}
            - preserved_count: Number of messages in preserved window (full tools)
            - pruned_count: Number of messages with tools stripped for LLM
        """
        retention_cfg = self.settings.llm.conversation.retention
        if not retention_cfg:
            # No pruning configured; return all messages with tools intact
            return self._messages_to_context(messages, prune_for_llm=False), len(messages), 0

        preserve_turns = retention_cfg.preserve_turns or 2
        prune_tools_for_llm = retention_cfg.prune_tools_for_llm or True

        # Calculate how many messages to preserve with full tools
        # A "turn" is a pair (user_message, assistant_response)
        # So preserve_turns * 2 messages (approximately)
        preserve_message_count = preserve_turns * 2

        total_messages = len(messages)
        pruned_count = max(0, total_messages - preserve_message_count) if prune_tools_for_llm else 0
        preserved_count = total_messages - pruned_count

        logger.info(
            "History pruning for LLM: total=%d, preserve_turns=%d, preserved_msgs=%d, pruned_msgs=%d, prune_tools_for_llm=%s",
            total_messages,
            preserve_turns,
            preserved_count,
            pruned_count,
            prune_tools_for_llm,
        )

        # Build context
        context: List[Dict[str, Any]] = []

        if prune_tools_for_llm and pruned_count > 0:
            # Older messages have tools stripped for LLM context
            # (but full tools remain in DB)
            pruned_messages = messages[:pruned_count]
            for msg in pruned_messages:
                msg_dict = self._message_to_dict(msg, include_tools=False)
                context.append(msg_dict)
        
            # Latest messages keep full tools
            preserved_messages = messages[pruned_count:]
            for msg in preserved_messages:
                msg_dict = self._message_to_dict(msg, include_tools=True)
                context.append(msg_dict)
        else:
            # No pruning: include all messages with full tools
            for msg in messages:
                msg_dict = self._message_to_dict(msg, include_tools=True)
                context.append(msg_dict)

        return context, preserved_count, pruned_count

    def _message_to_dict(
        self,
        message: Message,
        include_tools: bool = True,
    ) -> Dict[str, Any]:
        """Convert a Message object to a context dict for the LLM.
        
        Args:
            message: Message object from database
            include_tools: Whether to include tools_used metadata in LLM context
                          (Full metadata is always in DB)
            
        Returns:
            Dict with "role", "content", and optionally "tools_used"
        """
        msg_dict: Dict[str, Any] = {
            "role": message.role.value,
            "content": message.text,
        }

        # Include tools in LLM context only if requested
        # When include_tools=False, tools_used field is excluded entirely from LLM context
        # (but full tools_used remain in the database for audit trail)
        if include_tools and message.tools_used:
            msg_dict["tools_used"] = message.tools_used

        return msg_dict


    def _messages_to_context(
        self,
        messages: List[Message],
        prune_for_llm: bool = False,
    ) -> List[Dict[str, Any]]:
        """Convert all messages to context dicts (fallback when no retention config).
        
        Args:
            messages: List of messages
            prune_for_llm: If True, strip tools from all messages for LLM context
            
        Returns:
            List of context dicts
        """
        context = []
        for msg in messages:
            msg_dict = self._message_to_dict(msg, include_tools=not prune_for_llm)
            context.append(msg_dict)
        return context


async def load_conversation_history(
    thread_id: Any,
    user_id: str,
    session_factory: Optional[async_sessionmaker[AsyncSession]],
) -> List[Dict[str, Any]]:
    """Load and prune conversation history for LLM context.
    
    This is the main entry point for loading conversation history with automatic
    pruning applied based on retention configuration.
    
    Args:
        thread_id: Thread ID to load history for
        user_id: User ID (for authorization)
        session_factory: Optional database session factory
        
    Returns:
        List of message dicts ready for LLM, with pruning applied
    """
    settings = get_settings()
    
    # Early return if history is disabled
    if not (settings.llm.conversation and settings.llm.conversation.include_history):
        return []

    manager = HistoryManager(thread_id, user_id, session_factory)
    
    # Load raw messages from database
    messages = await manager.load_messages()
    
    if not messages:
        return []
    
    # Build pruned context for LLM
    context, preserved_count, discarded_count = manager.build_context(messages)
    
    logger.info(
        "Conversation history ready: total_messages=%d, preserved=%d, pruned=%d, context_items=%d",
        len(messages),
        preserved_count,
        discarded_count,
        len(context),
    )
    
    return context

