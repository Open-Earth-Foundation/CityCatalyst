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
            tools_used=[{"name": "climate_vector_search", "status": "success", "result": "..."}],
        ),
        MockMessage("msg3", MessageRole.USER, "What are emissions factors?"),
        MockMessage(
            "msg4",
            MessageRole.ASSISTANT,
            "Emissions factors are...",
            tools_used=[{"name": "cc_inventory_tool", "status": "success", "result": "..."}],
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
    async def test_load_messages_with_session_factory(self, mock_session_factory, sample_messages):
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
            MockMessage(f"msg{i}", MessageRole.USER if i % 2 == 0 else MessageRole.ASSISTANT, f"Message {i}")
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
        """Test that latest turns are preserved with full tool metadata for LLM."""
        # Mock retention config: preserve 2 turns (4 messages max)
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=2,
                prune_tools_for_llm=True,
            )
            
            manager = HistoryManager("thread123", "user456", None)
            context, preserved_count, pruned_count = manager.build_context(sample_messages)
            
            # With 6 messages and preserve_turns=2, should preserve last 4 (prune 2 for LLM)
            assert preserved_count == 4
            assert pruned_count == 2
            assert len(context) == 6  # All messages in context
            
            # First 2 messages (pruned for LLM) should have tools stripped
            # But tools are still in database!
            assert "tools_used" not in context[0]
            assert "tools_used" not in context[1]
            
            # Last 4 messages (preserved for LLM) should have full tools
            assert context[2].get("tools_used") is not None
            assert context[3].get("tools_used") is not None
            assert context[4].get("tools_used") is not None
            assert context[5].get("tools_used") is not None

    def test_build_context_without_retention_config(self, sample_messages):
        """Test that all messages are preserved when no retention config exists."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = None
            
            manager = HistoryManager("thread123", "user456", None)
            context, preserved_count, discarded_count = manager.build_context(sample_messages)
            
            # All messages preserved
            assert preserved_count == 6
            assert discarded_count == 0
            assert len(context) == 6

    def test_build_context_strips_tools_for_pruned_messages(self, sample_messages):
        """Test that pruned messages (outside preserve window) have tools stripped for LLM."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=1,  # Only preserve last 2 messages for LLM
                prune_tools_for_llm=True,
            )
            
            manager = HistoryManager("thread123", "user456", None)
            context, _, _ = manager.build_context(sample_messages)
            
            # First message should have no tools in LLM context
            # (but full tools remain in database)
            assert "tools_used" not in context[0]
            
            # Second message also should have no tools for LLM context
            assert "tools_used" not in context[1]
            
            # But remaining messages (preserved) should have full tools
            assert context[4].get("tools_used") is not None
            assert context[5].get("tools_used") is not None

    def test_build_context_preserves_full_tools_for_latest_turns(self, sample_messages):
        """Test that preserved turns (latest N) retain full tool metadata for LLM."""
        with patch("app.utils.history_manager.get_settings") as mock_settings:
            mock_settings.return_value.llm.conversation.retention = RetentionConfig(
                preserve_turns=2,
                prune_tools_for_llm=True,
            )
            
            manager = HistoryManager("thread123", "user456", None)
            context, preserved_count, pruned_count = manager.build_context(sample_messages)
            
            # Last 4 messages should have full tools for LLM
            for i in range(len(context) - preserved_count, len(context)):
                last_msg_tools = context[i].get("tools_used")
                assert last_msg_tools is not None
                assert isinstance(last_msg_tools, list)
                # Full tools should have name and status
                for tool in last_msg_tools:
                    assert "name" in tool
                    assert "status" in tool



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
    async def test_load_conversation_history_with_pruning(self, mock_session_factory, sample_messages):
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
                history = await load_conversation_history("thread123", "user456", mock_session_factory)
                
                # Should have pruned context
                assert len(history) == 6
                
                # First messages should have no tools
                assert "tools_used" not in history[0]
                assert "tools_used" not in history[1]
                
                # Last messages should have tools
                assert history[-1].get("tools_used") is not None


class TestMessageToDict:
    """Test message-to-dict conversion."""

    def test_message_to_dict_with_tools(self):
        """Test converting message with tools to dict."""
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
        assert msg_dict["tools_used"] == [{"name": "tool1", "status": "success"}]

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
        # Should have trimmed tools
        assert "tools_used" in msg_dict
        assert msg_dict["tools_used"][0] == {"name": "tool1", "status": "success"}
        assert "result" not in msg_dict["tools_used"][0]

    def test_message_to_dict_user_message(self):
        """Test converting user message (no tools)."""
        msg = MockMessage("msg1", MessageRole.USER, "User question")
        
        manager = HistoryManager("thread123", "user456", None)
        msg_dict = manager._message_to_dict(msg, include_tools=True)
        
        assert msg_dict["role"] == "user"
        assert msg_dict["content"] == "User question"
        assert "tools_used" not in msg_dict

