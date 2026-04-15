"""Unit tests for conversation history manager and pruning behavior."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List

from app.models.db.message import Message, MessageRole
from app.utils.history_manager import HistoryManager, load_conversation_history
from app.config.settings import RetentionConfig, ConversationConfig


class MockMessage:
    """Mock Message object for testing."""

    def __init__(
        self,
        message_id: str,
        role: MessageRole,
        text: str,
        tools_used=None,
        created_at=None,
    ):
        self.message_id = message_id
        self.role = role
        self.text = text
        self.tools_used = tools_used
        self.created_at = created_at


@pytest.fixture
def mock_session_factory():
    """Create a mock session factory."""
    return AsyncMock()


@pytest.fixture
def sample_messages() -> List[MockMessage]:
    """Create sample messages for testing."""
    return [
        MockMessage("msg1", MessageRole.USER, "Hello, what is climate change?"),
        MockMessage(
            "msg2",
            MessageRole.ASSISTANT,
            "Climate change is...",
            tools_used=[
                {"name": "climate_vector_search", "status": "success", "result": "..."}
            ],
        ),
        MockMessage("msg3", MessageRole.USER, "What are emissions factors?"),
        MockMessage(
            "msg4",
            MessageRole.ASSISTANT,
            "Emissions factors are...",
            tools_used=[
                {"name": "cc_inventory_tool", "status": "success", "result": "..."}
            ],
        ),
        MockMessage("msg5", MessageRole.USER, "How do I reduce emissions?"),
        MockMessage(
            "msg6",
            MessageRole.ASSISTANT,
            "To reduce emissions, you can...",
            tools_used=[
                {"name": "climate_vector_search", "status": "success"},
                {"name": "cc_inventory_tool", "status": "success"},
            ],
        ),
    ]


class TestHistoryManagerLoadMessages:
    """Test message loading functionality."""

    @pytest.mark.asyncio
    async def test_load_messages_with_session_factory(
        self, mock_session_factory, sample_messages
    ):
        """Test loading messages when session factory is available."""
        # Mock the MessageService
        mock_message_service = AsyncMock()
        mock_message_service.get_thread_messages.return_value = sample_messages

        with patch(
            "app.utils.history_manager.MessageService",
            return_value=mock_message_service,
        ):
            manager = HistoryManager(
                thread_id="thread123",
                user_id="user456",
                session_factory=mock_session_factory,
            )

            messages = await manager.load_messages(limit=10)

            assert len(messages) == 6
            assert messages[0].text == "Hello, what is climate change?"
            assert messages[-1].text == "To reduce emissions, you can..."

    @pytest.mark.asyncio
    async def test_load_messages_without_session_factory(self):
        """Test loading messages when database is unavailable."""
        manager = HistoryManager(
            thread_id="thread123",
            user_id="user456",
            session_factory=None,
        )

        messages = await manager.load_messages()

        assert messages == []

    @pytest.mark.asyncio
    async def test_load_messages_respects_limit(self, mock_session_factory):
        """Test that load_messages respects the limit parameter."""
        # Create 10 sample messages
        messages = [
            MockMessage(
                f"msg{i}",
                MessageRole.USER if i % 2 == 0 else MessageRole.ASSISTANT,
                f"Message {i}",
            )
            for i in range(10)
        ]

        mock_message_service = AsyncMock()
        mock_message_service.get_thread_messages.return_value = messages[:5]

        with patch(
            "app.utils.history_manager.MessageService",
            return_value=mock_message_service,
        ):
            manager = HistoryManager("thread123", "user456", mock_session_factory)
            loaded = await manager.load_messages(limit=5)

            assert len(loaded) == 5
            mock_message_service.get_thread_messages.assert_called_once()
            call_kwargs = mock_message_service.get_thread_messages.call_args[1]
            assert call_kwargs["limit"] == 5


class TestHistoryManagerBuildContext:
    """Test context building and pruning functionality."""

    def test_build_context_preserves_latest_turns(self, sample_messages):
        """Test that latest turns are preserved (message-count pruning)."""
        # Mock retention config: preserve 2 turns (4 messages max)
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=2,
                prune_tools_for_llm=True,
            )

            manager = HistoryManager("thread123", "user456", None)
            context, preserved_count, pruned_count = manager.build_context(
                sample_messages
            )

            # With 6 messages and preserve_turns=2, should preserve last 4 (prune 2 for LLM)
            assert preserved_count == 4
            assert pruned_count == 2
            # Tool outputs for preserved assistant messages are added as system messages.
            assert len(context) == 8

            # LLM context must not include `tools_used` because the Responses API rejects it.
            assert all("tools_used" not in msg for msg in context)
            assert any(
                msg.get("role") == "system"
                and "INTERNAL_TOOL_OUTPUT_JSON" in (msg.get("content") or "")
                for msg in context
            )

    def test_build_context_without_retention_config(self, sample_messages):
        """Test that all messages are preserved when no retention config exists."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = None

            manager = HistoryManager("thread123", "user456", None)
            context, preserved_count, discarded_count = manager.build_context(
                sample_messages
            )

            # All messages preserved
            assert preserved_count == 6
            assert discarded_count == 0
            # 3 assistant messages have tool outputs → 3 extra system messages
            assert len(context) == 9
            assert all("tools_used" not in msg for msg in context)

    def test_build_context_strips_tools_for_pruned_messages(self, sample_messages):
        """Test that LLM context never includes `tools_used`."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=1,  # Only preserve last 2 messages for LLM
                prune_tools_for_llm=True,
            )

            manager = HistoryManager("thread123", "user456", None)
            context, _, _ = manager.build_context(sample_messages)

            assert all("tools_used" not in msg for msg in context)
            assert any(
                msg.get("role") == "system"
                and "INTERNAL_TOOL_OUTPUT_JSON" in (msg.get("content") or "")
                for msg in context
            )

    def test_build_context_preserves_full_tools_for_latest_turns(self, sample_messages):
        """Test that context dicts have the expected shape."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=2,
                prune_tools_for_llm=True,
            )

            manager = HistoryManager("thread123", "user456", None)
            context, preserved_count, pruned_count = manager.build_context(
                sample_messages
            )

            assert preserved_count == 4
            assert pruned_count == 2
            for msg in context:
                assert set(msg.keys()) == {"role", "content"}


class TestLoadConversationHistory:
    """Test the main entry point for loading conversation history."""

    @pytest.mark.asyncio
    async def test_load_conversation_history_disabled(self):
        """Test that history is empty when include_history is False."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.include_history = False

            history = await load_conversation_history("thread123", "user456", None)

            assert history == []

    @pytest.mark.asyncio
    async def test_load_conversation_history_with_pruning(
        self, mock_session_factory, sample_messages
    ):
        """Test that load_conversation_history applies pruning correctly."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.include_history = True
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=2,
                prune_tools_for_llm=True,
            )

            mock_message_service = AsyncMock()
            mock_message_service.get_thread_messages.return_value = sample_messages

            with patch(
                "app.utils.history_manager.MessageService",
                return_value=mock_message_service,
            ):
                history = await load_conversation_history(
                    "thread123", "user456", mock_session_factory
                )

                # Should have pruned context
                assert len(history) == 8

                # LLM history must not include `tools_used` because the Responses API rejects it.
                assert all("tools_used" not in msg for msg in history)
                assert any(
                    msg.get("role") == "system"
                    and "INTERNAL_TOOL_OUTPUT_JSON" in (msg.get("content") or "")
                    for msg in history
                )


class TestMessageToDict:
    """Test message-to-dict conversion."""

    def test_message_to_dict_with_tools(self):
        """Test converting message with tools (tools are omitted for LLM context)."""
        msg = MockMessage(
            "msg1",
            MessageRole.ASSISTANT,
            "Response text",
            tools_used=[{"name": "tool1", "status": "success"}],
        )

        manager = HistoryManager("thread123", "user456", None)
        msg_dict = manager._message_to_dict(msg, include_tools=True)

        assert msg_dict["role"] == "assistant"
        assert msg_dict["content"] == "Response text"
        assert "tools_used" not in msg_dict

    def test_message_to_dict_without_tools(self):
        """Test converting message with tools excluded."""
        msg = MockMessage(
            "msg1",
            MessageRole.ASSISTANT,
            "Response text",
            tools_used=[{"name": "tool1", "status": "success", "result": "data"}],
        )

        manager = HistoryManager("thread123", "user456", None)
        msg_dict = manager._message_to_dict(msg, include_tools=False)

        assert msg_dict["role"] == "assistant"
        assert msg_dict["content"] == "Response text"
        assert "tools_used" not in msg_dict

    def test_message_to_dict_user_message(self):
        """Test converting user message (no tools)."""
        msg = MockMessage("msg1", MessageRole.USER, "User question")

        manager = HistoryManager("thread123", "user456", None)
        msg_dict = manager._message_to_dict(msg, include_tools=True)

        assert msg_dict["role"] == "user"
        assert msg_dict["content"] == "User question"
        assert "tools_used" not in msg_dict
