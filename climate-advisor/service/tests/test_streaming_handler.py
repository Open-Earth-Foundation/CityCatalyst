"""Streaming handler identity, persistence, SSE framing, and prompt fallbacks."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from agents.tool import ToolContext
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models.db.thread import Thread
from app.models.requests import MessageCreateRequest
from app.services.native_input_catalog_service import ActiveRequestContext
from app.tools.concept_note_visual_tools import concept_note_render_visual
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.concept_note_context import rendered_visuals
from app.utils.sse import format_sse
from app.utils.streaming_context import native_input_catalog_request
from app.utils.streaming_events import handle_tool_called, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from app.utils.streaming_prompt import (
    CNB_SOURCE_DOCUMENTS_OMITTED_MESSAGE,
    fit_cnb_chat_context_window,
)
from app.utils.streaming_runner import stream_agent_events
from tests.streaming_fixtures import _parse_sse_payload

_FORGED_PAYLOAD = MessageCreateRequest(
    user_id="attacker-supplied-user",
    content="hello",
    context={
        "user_id": "attacker-supplied-user",
        "organization_id": "organization-1",
        "native_input_selection": {
            "catalog_id": "catalog-1",
            "capability_id": "ghgi.inventory.status_overview",
        },
    },
    options={"native_input_selection": {"catalog_id": "forged"}},
)


def _handler(**kwargs: object) -> StreamingHandler:
    return StreamingHandler(
        thread_id="thread-1", user_id="user-1", session_factory=MagicMock(), **kwargs
    )


def test_native_input_catalog_context_uses_authenticated_request_identity() -> None:
    handler = StreamingHandler(
        thread_id="thread-1",
        user_id="body-user",
        session_factory=MagicMock(),
        cc_access_token="trusted-core-token",
        catalog_user_id="authenticated-user",
        inventory_id="inventory-1",
        request_context={
            "city_id": "city-1",
            "native_input_selection": {
                "catalog_id": "request-context-catalog",
                "capability_id": "ghgi.inventory.status_overview",
            },
        },
        request_options={
            "project_id": "project-1",
            "native_input_selection": {
                "catalog_id": "request-options-catalog",
                "capability_id": "ghgi.inventory.status_overview",
            },
        },
    )

    context = native_input_catalog_request(handler, _FORGED_PAYLOAD)

    assert context == ActiveRequestContext(
        user_id="authenticated-user",
        thread_id="thread-1",
        organization_id="organization-1",
        project_id="project-1",
        city_id="city-1",
        inventory_id="inventory-1",
    )


@pytest.mark.parametrize(
    "handler_kwargs",
    [
        {"user_id": "body-user", "cc_access_token": "unvalidated-token"},
        {
            "user_id": "authenticated-user",
            "inventory_id": "inventory-1",
            "request_options": {"project_id": "project-1"},
        },
    ],
    ids=["token-without-validated-identity", "identity-without-core-credential"],
)
def test_native_input_catalog_context_requires_validated_core_credential(
    handler_kwargs: dict[str, object],
) -> None:
    """Body identity and scope alone never establish catalog authorization."""
    handler = StreamingHandler(
        thread_id="thread-1",
        session_factory=MagicMock(),
        request_context={"city_id": "city-1"},
        **handler_kwargs,
    )

    assert native_input_catalog_request(handler, _FORGED_PAYLOAD) is None


async def test_done_event_reflects_persisted_history() -> None:
    handler = _handler()
    fake_agent_service = MagicMock()
    fake_agent_service.create_agent = AsyncMock(return_value=object())
    fake_agent_service.close = AsyncMock()

    async def fake_stream_events(self, agent, request_payload, conversation_history):
        self.assistant_tokens.append("Persisted answer")
        yield format_sse(
            {"index": 0, "content": "Persisted answer"}, event="message", id="0"
        ).encode("utf-8")

    with (
        patch(
            "app.utils.streaming_agent.AgentService", return_value=fake_agent_service
        ),
        patch.object(
            StreamingHandler, "_load_conversation_history", AsyncMock(return_value=[])
        ),
        patch(
            "app.utils.streaming_handler.stream_agent_events", new=fake_stream_events
        ),
        patch(
            "app.utils.streaming_handler.persist_assistant_message",
            AsyncMock(return_value=True),
        ),
    ):
        chunks = [
            chunk
            async for chunk in handler.stream_response(
                MessageCreateRequest(user_id="user-1", content="hello")
            )
        ]

    done_payload = _parse_sse_payload(chunks[-1])
    assert done_payload["event"] == "done"
    assert done_payload["data"]["history_saved"] is True
    fake_agent_service.close.assert_awaited_once()


def test_format_sse_keeps_unicode_line_separators_in_one_data_line() -> None:
    payload = {"html": "a b c\x85d"}

    lines = format_sse(payload, event="done").split("\n")

    data_lines = [line for line in lines if line.startswith("data: ")]
    assert len(data_lines) == 1
    assert json.loads(data_lines[0][len("data: ") :]) == payload


async def test_visual_only_turn_is_persisted_with_empty_text() -> None:
    handler = _handler()
    visual = {
        "name": "concept_note_render_visual",
        "status": "success",
        "arguments": {"title": "Chart", "html": "<html></html>"},
        "result_json": {
            "action": "concept_note.visual.render",
            "success": True,
            "data": {"title": "Chart", "html_chars": 13},
            "error_code": None,
        },
    }
    handler.tool_invocations = [visual]

    with patch(
        "app.utils.streaming_handler.persist_assistant_message",
        AsyncMock(return_value=True),
    ) as persist:
        assert await handler.persist_message() is True

    assert persist.await_args.kwargs["assistant_content"] == ""
    assert persist.await_args.kwargs["tool_invocations"] == [visual]


async def test_visual_html_is_streamed_and_stored_once() -> None:
    handler = _handler()
    html = "<html><body><svg>" + "x" * 500 + "</svg></body></html>"
    arguments = json.dumps({"title": "Chart", "html": html})
    output = await concept_note_render_visual.on_invoke_tool(
        ToolContext(
            context=None,
            tool_call_id="call-1",
            tool_name=concept_note_render_visual.name,
            tool_arguments=arguments,
        ),
        arguments,
    )
    called = SimpleNamespace(
        raw_item=SimpleNamespace(
            name="concept_note_render_visual", call_id="call-1", arguments=arguments
        )
    )
    finished = SimpleNamespace(raw_item=SimpleNamespace(call_id="call-1"), output=output)

    chunks = [chunk async for chunk in handle_tool_called(handler, called)]
    chunks += [chunk async for chunk in handle_tool_output(handler, finished)]
    chunks.append(handler._format_completion_event("req-1", ok=True))
    streamed = b"".join(chunks).decode("utf-8")

    assert streamed.count(html) == 1
    stored = json.dumps(handler._tool_invocations_for_persistence())
    assert stored.count(html) == 1
    assert rendered_visuals(handler.tool_invocations) == [
        {"title": "Chart", "html": html}
    ]


async def test_tool_only_turn_without_visual_is_not_persisted() -> None:
    handler = _handler()
    handler.tool_invocations = [
        {
            "name": "concept_note_render_visual",
            "result_json": {
                "action": "concept_note.visual.render",
                "success": False,
                "data": None,
                "error_code": "visual_invalid_input",
            },
        },
        {"name": "concept_note_gaps", "result_json": {"success": True}},
    ]

    with patch(
        "app.utils.streaming_handler.persist_assistant_message",
        AsyncMock(return_value=True),
    ) as persist:
        assert await handler.persist_message() is False

    persist.assert_not_awaited()


def _fallback_agent(instructions: str, recorded: dict[str, object]) -> SimpleNamespace:
    """Agent whose non-SDK fallback records the instructions it streams with."""
    agent = SimpleNamespace(instructions=instructions)

    class Messages:
        def run_stream(self, prompt: str):
            recorded["fallback_prompt"] = prompt
            recorded["fallback_instructions"] = agent.instructions

            async def chunks():
                yield "fallback answer"

            return chunks()

    agent.messages = Messages()
    return agent


async def test_embedded_stationary_energy_context_restores_instructions_for_fallback() -> (
    None
):
    """The SDK run uses only the embedded prompt; the fallback gets the originals back."""
    recorded: dict[str, object] = {}
    original_instructions = (
        "<role>\n"
        "You are Clima assisting with an active GPC Stationary Energy draft review.\n"
        "</role>"
    )
    conversation_history = [
        {
            "role": "system",
            "content": original_instructions
            + "\n\n<context>\nSTATIONARY_ENERGY_DRAFT_CONTEXT_JSON\n"
            + '{"draft_run": {"draft_run_id": "draft-1"}}\n</context>',
        },
        {"role": "user", "content": "Which rows are gaps?"},
    ]
    payload = MessageCreateRequest(
        user_id="user-1", content="Which rows are gaps?", inventory_id="inventory-1"
    )
    handler = _handler(inventory_id="inventory-1")
    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=str(uuid4())
    )
    agent = _fallback_agent(original_instructions, recorded)

    def fail_run_streamed(agent, runner_input, run_config, max_turns=None, error_handlers=None):
        recorded["runner_instructions"] = agent.instructions
        recorded["runner_input"] = runner_input
        raise RuntimeError("sdk stream unavailable")

    with patch(
        "app.utils.streaming_runner.Runner.run_streamed", side_effect=fail_run_streamed
    ):
        chunks = [
            chunk
            async for chunk in stream_agent_events(
                handler, agent, payload, conversation_history
            )
        ]

    assert chunks == [b"fallback answer"]
    assert recorded["runner_instructions"] == ""
    assert recorded["runner_input"] == conversation_history
    assert recorded["fallback_prompt"] == payload.content
    assert recorded["fallback_instructions"] == original_instructions
    assert agent.instructions == original_instructions


async def test_cnb_fallback_retains_composed_cnb_instructions() -> None:
    recorded: dict[str, object] = {}
    handler = StreamingHandler(
        thread_id=str(uuid4()), user_id="user-1", session_factory=None
    )
    handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
    instructions = "Shared core + CNB-specific instructions"
    agent = _fallback_agent(instructions, recorded)

    with patch(
        "app.utils.streaming_runner.Runner.run_streamed",
        side_effect=RuntimeError("unavailable"),
    ):
        chunks = [
            chunk
            async for chunk in stream_agent_events(
                handler,
                agent,
                MessageCreateRequest(user_id="user-1", content="Check the budget"),
                [],
            )
        ]

    assert chunks == [b"fallback answer"]
    assert recorded["fallback_instructions"] == instructions


def test_cnb_chat_drops_source_text_when_history_exceeds_the_window() -> None:
    handler = _handler()
    agent = SimpleNamespace(instructions="Concept Note assistant.")
    runner_input = [
        {"role": "user", "content": "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n{}"},
        {"role": "user", "content": "CONCEPT_NOTE_SOURCE_DOCUMENTS\n\n" + "flood " * 200},
        {"role": "assistant", "content": "earlier reply " * 200},
        {"role": "user", "content": "What does the plan budget?"},
    ]
    budget = SimpleNamespace(
        tokenizer_encoding="o200k_base",
        cnb_sources=SimpleNamespace(context_window_tokens=100_000),
    )
    settings = SimpleNamespace(
        llm=SimpleNamespace(generation=SimpleNamespace(prompt_budget=budget))
    )

    with patch("app.utils.streaming_prompt.get_settings", return_value=settings):
        assert fit_cnb_chat_context_window(handler, agent, runner_input) is runner_input
        budget.cnb_sources.context_window_tokens = 500
        fitted = fit_cnb_chat_context_window(handler, agent, runner_input)

    assert fitted[1]["content"] == CNB_SOURCE_DOCUMENTS_OMITTED_MESSAGE
    assert [fitted[0], *fitted[2:]] == [runner_input[0], *runner_input[2:]]


async def test_token_refreshed_during_a_turn_is_persisted(chat_service) -> None:
    """A CityCatalyst token a tool refreshed mid-turn is stored on the thread."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    thread_id = uuid4()

    async def refreshing_stream(self, agent, request_payload, conversation_history):
        # A CityCatalyst tool call renewed the agent's token during the turn.
        chat_service.current_cc_token.return_value = "fresh-token"
        self.assistant_tokens.append("Done")
        yield b""

    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            session.add(
                Thread(
                    thread_id=thread_id,
                    user_id="user-1",
                    context={"access_token": "old-token"},
                )
            )
            await session.commit()

        handler = StreamingHandler(
            thread_id=thread_id,
            user_id="user-1",
            session_factory=session_factory,
            cc_access_token="old-token",
        )
        with patch(
            "app.utils.streaming_handler.stream_agent_events", new=refreshing_stream
        ):
            chunks = [
                chunk
                async for chunk in handler.stream_response(
                    MessageCreateRequest(user_id="user-1", content="hello")
                )
            ]

        assert _parse_sse_payload(chunks[-1])["data"]["ok"] is True
        async with session_factory() as session:
            thread = await session.get(Thread, thread_id)
            assert thread.get_access_token() == "fresh-token"
    finally:
        await engine.dispose()
