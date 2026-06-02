from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.utils.sse import format_sse
from app.utils.streaming_handler import StreamingHandler


def _parse_sse_payload(chunk: bytes) -> dict:
    event_type = None
    data_lines: list[str] = []

    for line in chunk.decode("utf-8").splitlines():
        if line.startswith("event:"):
            event_type = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())

    return {
        "event": event_type,
        "data": json.loads("\n".join(data_lines)),
    }


class StreamingHandlerCompletionTests(unittest.IsolatedAsyncioTestCase):
    async def test_done_event_reflects_persisted_history(self) -> None:
        payload = MessageCreateRequest(user_id="user-1", content="hello")
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="user-1",
            session_factory=MagicMock(),
        )

        fake_agent_service = MagicMock()
        fake_agent_service.create_agent = AsyncMock(return_value=object())
        fake_agent_service.close = AsyncMock()

        async def fake_stream_events(self, agent, request_payload, conversation_history):
            self.assistant_tokens.append("Persisted answer")
            yield format_sse(
                {"index": 0, "content": "Persisted answer"},
                event="message",
                id="0",
            ).encode("utf-8")

        with (
            patch("app.utils.streaming_handler.AgentService", return_value=fake_agent_service),
            patch.object(
                StreamingHandler,
                "_load_conversation_history",
                AsyncMock(return_value=[]),
            ),
            patch.object(
                StreamingHandler,
                "_stream_agent_events",
                new=fake_stream_events,
            ),
            patch(
                "app.utils.streaming_handler.persist_assistant_message",
                AsyncMock(return_value=True),
            ),
        ):
            chunks = [chunk async for chunk in handler.stream_response(payload)]

        done_payload = _parse_sse_payload(chunks[-1])

        self.assertEqual(done_payload["event"], "done")
        self.assertTrue(done_payload["data"]["history_saved"])
        self.assertTrue(handler.history_saved)
        fake_agent_service.close.assert_awaited_once()

    async def test_run_config_uses_persisted_stationary_energy_context_marker(self) -> None:
        draft_run_id = str(uuid4())
        payload = MessageCreateRequest(user_id="user-1", content="hello")
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.stationary_energy_draft_run_id = draft_run_id

        run_config = handler._run_config(payload)

        self.assertEqual(
            run_config.workflow_name,
            "Climate Advisor Stationary Energy Context Chat",
        )
        self.assertEqual(
            run_config.trace_metadata["trace_category"],
            "ca_agentic_context_chat",
        )
        self.assertTrue(run_config.trace_metadata["ca_agentic_flow"])
        self.assertEqual(
            run_config.trace_metadata["stationary_energy_draft_run_id"],
            draft_run_id,
        )
