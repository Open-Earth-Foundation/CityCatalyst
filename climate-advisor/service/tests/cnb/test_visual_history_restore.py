"""Saved CNB visuals after sign-in: what the chat restores vs. what the model sees.

The thread endpoint restores every saved visual, while the model gets a
bounded, compacted history (HTML replaced by a placeholder, at most
``max_loaded_messages`` rows). These tests pin both views on a real SQLite
thread, including the case where the visual turn has left the model window.
"""

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import Base
from app.models.db.message import Message, MessageRole
from app.models.requests import ThreadCreateRequest
from app.routes.threads import get_thread_messages
from app.services.thread_service import ThreadService
from app.utils.concept_note_context import clean_cnb_history
from app.utils.history_manager import OMITTED_HISTORY_NOTICE, load_conversation_history

QUESTION = (
    "Can you draw a donut chart of the EUR 100 budget split between "
    "insulation (60), solar (25) and training (15)?"
)
HTML = "<html><body><svg><text>Insulation 60</text></svg></body></html>"
VISUAL_CALL = {
    "name": "concept_note_render_visual",
    "status": "success",
    "arguments": {"title": "EUR 100 budget split", "html": HTML},
    "result_json": {
        "action": "concept_note.visual.render",
        "success": True,
        "data": {"title": "EUR 100 budget split", "html_chars": len(HTML)},
        "error_code": None,
    },
}


@pytest.fixture
async def factory():
    """In-memory database with every service table."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def thread_with_visual(factory, later_turns: int, call=VISUAL_CALL):
    """Store a visual-only turn, then `later_turns` text turns, oldest first."""
    start = datetime.now(timezone.utc)
    rows = [
        (MessageRole.USER, QUESTION, None),
        # A visual-only reply is saved with empty text.
        (MessageRole.ASSISTANT, "", [call]),
    ]
    for i in range(later_turns):
        rows += [
            (MessageRole.USER, f"What is a logframe? ({i})", None),
            (MessageRole.ASSISTANT, "It links activities to outcomes.", None),
        ]
    async with factory() as session:
        thread = await ThreadService(session).create_thread(
            ThreadCreateRequest(user_id="owner")
        )
        # Explicit timestamps keep the order stable at SQLite's resolution.
        for offset, (role, text, tools) in enumerate(rows):
            session.add(
                Message(
                    message_id=uuid4(),
                    thread_id=thread.thread_id,
                    user_id="owner",
                    role=role,
                    text=text,
                    tools_used=tools,
                    created_at=start + timedelta(seconds=offset),
                )
            )
        await session.commit()
    return thread.thread_id


async def both_views(factory, thread_id):
    """Return (restored visuals, model-facing CNB history)."""
    async with factory() as session:
        restored = await get_thread_messages(
            thread_id=thread_id, user_id="owner", limit=None, session=session
        )
    visuals = [
        {"title": v["title"], "html": v["html"]}
        for m in restored.messages
        for v in m.model_dump()["visuals"]
    ]
    history = clean_cnb_history(
        await load_conversation_history(
            thread_id, "owner", factory, note_omitted_messages=True
        )
    )
    return visuals, history


async def test_recent_visual_restores_and_replays_compacted(factory) -> None:
    thread_id = await thread_with_visual(factory, later_turns=1)

    visuals, history = await both_views(factory, thread_id)

    assert visuals == [{"title": "EUR 100 budget split", "html": HTML}]
    # The model keeps the question that holds the values and the visual title,
    # but never the HTML, and is not told anything was omitted.
    assert history[0] == {"role": "user", "content": QUESTION}
    [replay] = [
        m for m in history if m["content"].startswith("INTERNAL_TOOL_OUTPUT_JSON\n")
    ]
    [call] = json.loads(replay["content"].split("\n", 1)[1])["tools_used"]
    assert call["arguments"] == {
        "title": "EUR 100 budget split",
        "html": f"[{len(HTML)} chars omitted]",
    }
    assert HTML not in json.dumps(history)
    assert OMITTED_HISTORY_NOTICE not in history


async def test_visual_beyond_model_window_is_flagged(factory) -> None:
    window = get_settings().llm.conversation.retention.max_loaded_messages
    # Enough later turns that the visual turn falls outside the loaded window.
    thread_id = await thread_with_visual(factory, later_turns=window // 2)

    visuals, history = await both_views(factory, thread_id)

    # The user still sees the chart, but the model no longer has its values.
    assert visuals == [{"title": "EUR 100 budget split", "html": HTML}]
    assert QUESTION not in json.dumps(history)
    assert "EUR 100 budget split" not in json.dumps(history)
    assert history[0] == OMITTED_HISTORY_NOTICE
    assert len(history) == window + 1


async def test_omitted_notice_is_opt_in(factory) -> None:
    window = get_settings().llm.conversation.retention.max_loaded_messages
    thread_id = await thread_with_visual(factory, later_turns=window // 2)

    history = await load_conversation_history(thread_id, "owner", factory)

    assert OMITTED_HISTORY_NOTICE not in history
    assert len(history) == window


@pytest.mark.parametrize("cnb", [True, False])
async def test_streaming_handler_requests_notice_only_for_cnb(cnb: bool) -> None:
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.models.requests import MessageCreateRequest
    from app.utils.chat_workflow_context import ChatWorkflowContext
    from app.utils.streaming_handler import StreamingHandler

    handler = StreamingHandler(
        thread_id=str(uuid4()), user_id="owner", session_factory=MagicMock()
    )
    handler.workflow_context = ChatWorkflowContext(
        concept_note_run_id=str(uuid4()) if cnb else None
    )
    loader = AsyncMock(return_value=[])
    with (
        patch("app.utils.streaming_handler.load_conversation_history", new=loader),
        patch(
            "app.utils.streaming_context.load_agent_context",
            new=AsyncMock(return_value={}),
        ),
        patch(
            "app.utils.streaming_context.load_source_documents",
            new=AsyncMock(return_value=[]),
        ),
    ):
        await handler._load_conversation_history(
            get_settings(), MessageCreateRequest(user_id="owner", content="Bars?")
        )

    assert loader.call_args.kwargs["note_omitted_messages"] is cnb


# Two levels of nested <use>: enough to trip the chat's check, never a freeze.
NESTED_USE = (
    '<svg><symbol id="a"><path d="M0 0"/></symbol><g id="b"><use href="#a"/></g>'
    '<use href="#b"/></svg>'
)
NEW_FORMAT = {
    **VISUAL_CALL,
    "arguments": {"title": "Icons", "html": NESTED_USE},
    "result_json": {**VISUAL_CALL["result_json"], "data": {"title": "Icons"}},
}
# Rows saved before the result dropped the HTML kept it only in data.html.
OLD_FORMAT = {
    **VISUAL_CALL,
    "arguments": "{...}",
    "result_json": {
        **VISUAL_CALL["result_json"],
        "data": {"title": "Icons", "html": NESTED_USE},
    },
}


@pytest.mark.parametrize("call", [NEW_FORMAT, OLD_FORMAT])
async def test_saved_visual_in_either_format_reaches_the_chat_check(
    factory, call
) -> None:
    """Visuals saved before the <use> check reopen as-is for the chat to refuse.

    app/tests/concept-note-chat-visual-use.jest.tsx feeds this restored shape
    to the chat frame, which shows a note instead of rendering it.
    """
    thread_id = await thread_with_visual(factory, later_turns=1, call=call)

    visuals, _history = await both_views(factory, thread_id)

    assert visuals == [{"title": "Icons", "html": NESTED_USE}]
