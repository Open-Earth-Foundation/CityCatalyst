"""Unit tests for conversation history manager and pruning behavior."""

import json

from typing import List
from unittest.mock import patch

import pytest

from app.config.settings import RetentionConfig
from app.models.db.message import MessageRole
from app.utils.history_manager import HistoryManager, load_conversation_history


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


@pytest.mark.asyncio
async def test_load_messages_without_session_factory():
    """Without a database the chat continues with no history."""
    manager = HistoryManager(
        thread_id="thread123",
        user_id="user456",
        session_factory=None,
    )

    assert await manager.load_messages() == []


@pytest.mark.parametrize(
    "retention, preserved, pruned, context_length",
    [
        # preserve_turns=2 keeps the last 4 messages; 2 tool outputs become system messages.
        (RetentionConfig(preserve_turns=2, prune_tools_for_llm=True), 4, 2, 8),
        # No retention keeps all 6 messages; 3 tool outputs become system messages.
        (None, 6, 0, 9),
    ],
    ids=["preserve-two-turns", "no-retention"],
)
def test_build_context_prunes_turns_and_moves_tools_to_system_messages(
    sample_messages, retention, preserved, pruned, context_length
):
    with patch("app.utils.history_manager.get_settings") as mock_settings:
        mock_settings.return_value.llm.conversation.retention = retention

        manager = HistoryManager("thread123", "user456", None)
        context, preserved_count, pruned_count = manager.build_context(
            sample_messages
        )

    assert preserved_count == preserved
    assert pruned_count == pruned
    assert len(context) == context_length
    # LLM context must not include `tools_used` because the Responses API rejects it.
    assert all(set(msg.keys()) == {"role", "content"} for msg in context)
    assert any(
        msg["role"] == "system" and "INTERNAL_TOOL_OUTPUT_JSON" in msg["content"]
        for msg in context
    )


def test_tool_context_replaces_visual_html_with_placeholder():
    html = "<html>" + "x" * 1000 + "</html>"
    result = {
        "action": "concept_note.visual.render",
        "success": True,
        "data": {"title": "Chart", "html": html},
        "error_code": None,
    }
    invocation = {
        "id": "call-1",
        "name": "concept_note_render_visual",
        "status": "success",
        "arguments": {"title": "Chart", "html": html},
        "result": json.dumps(result),
        "result_json": result,
    }
    manager = HistoryManager("thread123", "user456", None)

    [message] = manager._tool_context_to_messages([invocation])

    assert html not in message["content"]
    [item] = json.loads(message["content"].split("\n", 1)[1])["tools_used"]
    assert item["arguments"] == {
        "title": "Chart",
        "html": f"[{len(html)} chars omitted]",
    }
    assert item["result"]["data"] == {
        "title": "Chart",
        "html": f"[visual 'Chart' rendered, {len(html)} chars omitted]",
    }
    # The stored invocation keeps the full HTML for reload and the done event.
    assert invocation["result_json"]["data"]["html"] == html
    assert invocation["arguments"]["html"] == html


@pytest.mark.asyncio
async def test_load_conversation_history_disabled():
    """History is empty when include_history is False."""
    with patch("app.utils.history_manager.get_settings") as mock_settings:
        mock_settings.return_value.llm.conversation.include_history = False

        history = await load_conversation_history("thread123", "user456", None)

    assert history == []
