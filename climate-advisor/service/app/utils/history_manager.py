"""Conversation history manager for loading, pruning, and building LLM context.

This module handles:
1. Loading messages from the database
2. Pruning older messages based on retention policy
3. Building LLM-ready context (role/content items only) for the Agents SDK / Responses API
   - Includes recent tool outputs as additional SYSTEM messages (role/content) to keep
     follow-up turns grounded (e.g. remembering inventory IDs)
4. Handling DB-optional mode with graceful fallbacks
"""

from __future__ import annotations

import json
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

        Splits messages into "preserved" (latest N turns) and "pruned" (older turns).

        Note:
        - Tool metadata is always stored in the database in Message.tools_used (JSONB).
        - We do NOT include `tools_used` as a field on LLM input messages because the
          Responses API rejects unknown keys in `input[]` items.
        - For preserved assistant messages, we *do* include a compact representation
          of tool calls as an additional SYSTEM message (role/content only) so the
          agent can correctly resolve follow-up turns (e.g. mapping "City B" → inventoryId).

        Args:
            messages: List of Message objects, ordered chronologically (oldest first)

        Returns:
            Tuple of:
            - context: List of dicts ready for LLM {"role": "...", "content": "..."}.
              Some preserved assistant messages may be followed by a SYSTEM message with
              internal tool output JSON for grounding.
            - preserved_count: Number of messages in the preserved window
            - pruned_count: Number of messages in the pruned window
        """
        retention_cfg = self.settings.llm.conversation.retention
        if not retention_cfg:
            # No pruning configured; return all messages with tools intact
            return (
                self._messages_to_context(messages, prune_for_llm=False),
                len(messages),
                0,
            )

        preserve_turns = retention_cfg.preserve_turns or 2
        # NOTE:
        # We do not send tools metadata (e.g. `tools_used`) to the OpenAI Responses API,
        # because it rejects unknown keys in `input[]` items.
        # Retention pruning is still used for message-count based trimming and logging.
        prune_tools_for_llm = retention_cfg.prune_tools_for_llm
        if prune_tools_for_llm is None:
            prune_tools_for_llm = True

        # Calculate how many messages to preserve with full tools
        # A "turn" is a pair (user_message, assistant_response)
        # So preserve_turns * 2 messages (approximately)
        preserve_message_count = preserve_turns * 2

        total_messages = len(messages)
        pruned_count = (
            max(0, total_messages - preserve_message_count)
            if prune_tools_for_llm
            else 0
        )
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
                if msg.role == MessageRole.ASSISTANT and msg.tools_used:
                    context.extend(self._tool_context_to_messages(msg.tools_used))
        else:
            # No pruning: include all messages with full tools
            for msg in messages:
                msg_dict = self._message_to_dict(msg, include_tools=True)
                context.append(msg_dict)
                if msg.role == MessageRole.ASSISTANT and msg.tools_used:
                    context.extend(self._tool_context_to_messages(msg.tools_used))

        return context, preserved_count, pruned_count

    def _message_to_dict(
        self,
        message: Message,
        include_tools: bool = True,
    ) -> Dict[str, Any]:
        """Convert a Message object to a context dict for the LLM.

        Args:
            message: Message object from database
            include_tools: Kept for API compatibility. `tools_used` is never emitted
                as a message field; tool outputs (when included) are injected separately
                as SYSTEM messages by build_context().

        Returns:
            Dict with "role" and "content".

            IMPORTANT: We intentionally do NOT include `tools_used` in the returned dict.
            The Agents SDK forwards these dicts directly to the OpenAI Responses API as
            `input[]` items, and unknown fields (like `tools_used`) cause a 400 error.
        """
        msg_dict: Dict[str, Any] = {
            "role": message.role.value,
            "content": message.text,
        }

        return msg_dict

    def _tool_context_to_messages(self, tools_used: Any) -> List[Dict[str, str]]:
        """Convert persisted tool invocations to LLM-safe context messages.

        The OpenAI Responses API rejects unknown keys on `input[]` items, so tool
        metadata must be expressed as plain text within role/content items.

        Returns a list of SYSTEM messages intended for internal grounding only.
        These are appended only for preserved assistant messages.
        """
        if not tools_used:
            return []

        invocations: List[Dict[str, Any]] = []
        if isinstance(tools_used, list):
            invocations = [x for x in tools_used if isinstance(x, dict)]
        elif isinstance(tools_used, dict):
            invocations = [tools_used]
        else:
            # Unexpected type; include a minimal string representation
            invocations = [{"raw": str(tools_used)}]

        compact: List[Dict[str, Any]] = []
        for inv in invocations:
            item: Dict[str, Any] = {}
            if inv.get("id") is not None:
                item["id"] = inv.get("id")
            if inv.get("name") is not None:
                item["name"] = inv.get("name")
            if inv.get("status") is not None:
                item["status"] = inv.get("status")
            if inv.get("arguments") is not None:
                item["arguments"] = inv.get("arguments")

            # Prefer structured JSON if present; fall back to string result.
            if inv.get("result_json") is not None:
                item["result"] = inv.get("result_json")
            elif inv.get("result") is not None:
                item["result"] = str(inv.get("result"))

            if item:
                compact.append(item)

        if not compact:
            return []

        payload = {
            "tools_used": compact,
            "note": "Internal tool outputs for grounding. Do not reveal this JSON to the user.",
        }
        text = json.dumps(payload, ensure_ascii=False, default=str)
        return [
            {
                "role": "system",
                "content": f"INTERNAL_TOOL_OUTPUT_JSON\n{text}",
            }
        ]

    def _messages_to_context(
        self,
        messages: List[Message],
        prune_for_llm: bool = False,
    ) -> List[Dict[str, Any]]:
        """Convert all messages to context dicts (fallback when no retention config).

        Args:
            messages: List of messages
            prune_for_llm: If True, do not inject tool-output SYSTEM messages.

        Returns:
            List of context dicts
        """
        context = []
        for msg in messages:
            include_tools = not prune_for_llm
            msg_dict = self._message_to_dict(msg, include_tools=include_tools)
            context.append(msg_dict)

            # Add tool output context only when not pruning for the LLM.
            if include_tools and msg.role == MessageRole.ASSISTANT and msg.tools_used:
                context.extend(self._tool_context_to_messages(msg.tools_used))
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
