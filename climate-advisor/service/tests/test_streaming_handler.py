from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
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

        async def fake_stream_events(
            self, agent, request_payload, conversation_history
        ):
            self.assistant_tokens.append("Persisted answer")
            yield format_sse(
                {"index": 0, "content": "Persisted answer"},
                event="message",
                id="0",
            ).encode("utf-8")

        with (
            patch(
                "app.utils.streaming_handler.AgentService",
                return_value=fake_agent_service,
            ),
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

    async def test_persist_refreshed_token_from_agent_service(self) -> None:
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="user-1",
            session_factory=MagicMock(),
            cc_access_token="old-token",
        )
        handler.agent_service = MagicMock()
        handler.agent_service.current_cc_token.return_value = "fresh-token"
        handler.token_handler = MagicMock()
        handler.token_handler.handle_refreshed_token = AsyncMock(return_value=True)

        await handler._persist_refreshed_token_from_agent()

        handler.token_handler.handle_refreshed_token.assert_awaited_once_with(
            "fresh-token",
            handler.agent_service,
        )
        self.assertEqual(handler.cc_access_token, "fresh-token")

    async def test_run_config_uses_persisted_stationary_energy_context_marker(
        self,
    ) -> None:
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

    async def test_embedded_stationary_energy_context_clears_agent_instructions(
        self,
    ) -> None:
        recorded: dict[str, object] = {}
        draft_run_id = str(uuid4())
        system_content = (
            "<role>\n"
            "You are Clima assisting with an active GPC Stationary Energy draft review.\n"
            "</role>\n\n"
            "<context>\n"
            "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\n"
            '{"draft_run": {"draft_run_id": "draft-1"}}\n'
            "</context>"
        )
        conversation_history = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": "Which rows are gaps?"},
        ]
        payload = MessageCreateRequest(
            user_id="user-1",
            content="Which rows are gaps?",
            inventory_id="inventory-1",
        )
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
            inventory_id="inventory-1",
        )
        handler.stationary_energy_draft_run_id = draft_run_id
        agent = SimpleNamespace(
            instructions=(
                "<role>\n"
                "You are Clima assisting with an active GPC Stationary Energy draft review.\n"
                "</role>"
            )
        )

        class FakeStreamResult:
            async def stream_events(self):
                if False:
                    yield SimpleNamespace(type="agent_updated_stream_event")

        def fake_run_streamed(agent, runner_input, run_config):
            recorded["agent_instructions"] = agent.instructions
            recorded["runner_input"] = runner_input
            recorded["run_config"] = run_config
            return FakeStreamResult()

        with (
            patch(
                "app.utils.streaming_handler.Runner.run_streamed",
                side_effect=fake_run_streamed,
            ),
            patch(
                "app.utils.streaming_handler.update_current_trace_context",
                return_value=True,
            ),
        ):
            chunks = [
                chunk
                async for chunk in handler._stream_agent_events(
                    agent,
                    payload,
                    conversation_history,
                )
            ]

        self.assertEqual(chunks, [])
        self.assertEqual(recorded["agent_instructions"], "")
        self.assertEqual(recorded["runner_input"], conversation_history)
        self.assertEqual(
            recorded["run_config"].trace_metadata["prompt_name"],
            "stationary_energy_review",
        )

    async def test_embedded_stationary_energy_context_restores_instructions_for_fallback(
        self,
    ) -> None:
        recorded: dict[str, object] = {}
        draft_run_id = str(uuid4())
        original_instructions = (
            "<role>\n"
            "You are Clima assisting with an active GPC Stationary Energy draft review.\n"
            "</role>"
        )
        system_content = (
            original_instructions
            + "\n\n<context>\n"
            + "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\n"
            + '{"draft_run": {"draft_run_id": "draft-1"}}\n'
            + "</context>"
        )
        conversation_history = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": "Which rows are gaps?"},
        ]
        payload = MessageCreateRequest(
            user_id="user-1",
            content="Which rows are gaps?",
            inventory_id="inventory-1",
        )
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
            inventory_id="inventory-1",
        )
        handler.stationary_energy_draft_run_id = draft_run_id
        agent = SimpleNamespace(instructions=original_instructions)

        class FakeMessages:
            def run_stream(self, prompt: str):
                recorded["fallback_prompt"] = prompt
                recorded["fallback_instructions"] = agent.instructions

                async def chunks():
                    yield "fallback answer"

                return chunks()

        agent.messages = FakeMessages()

        def fail_run_streamed(agent, runner_input, run_config):
            recorded["runner_instructions"] = agent.instructions
            recorded["runner_input"] = runner_input
            raise RuntimeError("sdk stream unavailable")

        with patch(
            "app.utils.streaming_handler.Runner.run_streamed",
            side_effect=fail_run_streamed,
        ):
            chunks = [
                chunk
                async for chunk in handler._stream_agent_events(
                    agent,
                    payload,
                    conversation_history,
                )
            ]

        self.assertEqual(chunks, [b"fallback answer"])
        self.assertEqual(recorded["runner_instructions"], "")
        self.assertEqual(recorded["runner_input"], conversation_history)
        self.assertEqual(recorded["fallback_prompt"], payload.content)
        self.assertEqual(recorded["fallback_instructions"], original_instructions)
        self.assertEqual(agent.instructions, original_instructions)

    async def test_cancelled_stream_logs_cancelled_mlflow_summary(self) -> None:
        payload = MessageCreateRequest(user_id="user-1", content="hello")
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        fake_agent_service = MagicMock()
        fake_agent_service.create_agent = AsyncMock(return_value=object())
        fake_agent_service.close = AsyncMock()
        logged_tags: list[dict[str, object]] = []
        logged_metrics: list[dict[str, object]] = []
        logged_json_artifacts: list[tuple[str, object]] = []

        async def cancel_stream(self, agent, request_payload, conversation_history):
            raise asyncio.CancelledError()
            yield b""

        def record_json_artifact(artifact_file: str, payload: object) -> None:
            logged_json_artifacts.append((artifact_file, payload))

        with (
            patch(
                "app.utils.streaming_handler.AgentService",
                return_value=fake_agent_service,
            ),
            patch.object(
                StreamingHandler,
                "_load_conversation_history",
                AsyncMock(return_value=[]),
            ),
            patch.object(
                StreamingHandler,
                "_stream_agent_events",
                new=cancel_stream,
            ),
            patch(
                "app.utils.streaming_handler.log_tags",
                side_effect=lambda tags: logged_tags.append(tags),
            ),
            patch(
                "app.utils.streaming_handler.log_metrics",
                side_effect=lambda metrics: logged_metrics.append(metrics),
            ),
            patch(
                "app.utils.streaming_handler.log_json_artifact",
                side_effect=record_json_artifact,
            ),
            patch("app.utils.streaming_handler.log_text_artifact"),
        ):
            with self.assertRaises(asyncio.CancelledError):
                [
                    chunk
                    async for chunk in handler._stream_response_with_mlflow(
                        payload=payload,
                        history_warning=None,
                        req_id="request-1",
                        settings=MagicMock(),
                        started_at=0.0,
                    )
                ]

        self.assertTrue(handler.streaming_error)
        fake_agent_service.close.assert_awaited_once()
        self.assertIn({"stream_status": "cancelled"}, logged_tags)
        self.assertTrue(
            any(metrics.get("ok") == 0 for metrics in logged_metrics),
        )
        self.assertIn(
            (
                "errors/stream_cancelled.json",
                {
                    "type": "CancelledError",
                    "message": "Client disconnected or request was cancelled.",
                    "thread_id": handler.thread_identifier,
                },
            ),
            logged_json_artifacts,
        )
        self.assertTrue(
            any(
                artifact_file == "response/stream_summary.json"
                and isinstance(payload, dict)
                and payload.get("status") == "cancelled"
                for artifact_file, payload in logged_json_artifacts
            ),
        )

    async def test_bulk_review_confirmation_ui_event_is_emitted_as_tool_result(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.tool_invocations.append(
            {
                "id": "tool-call-1",
                "name": "stationary_energy_request_all_recommended_confirmation",
                "status": "executing",
            }
        )
        run_item = SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="tool-call-1",
                name="stationary_energy_request_all_recommended_confirmation",
            ),
            output=json.dumps(
                {
                    "success": True,
                    "action": "stationary_energy_request_all_recommended_confirmation",
                    "ui_event": "stationary_energy_review_bulk_confirmation_requested",
                    "draft_run_id": str(uuid4()),
                    "pending_choices": [
                        {
                            "proposal_id": str(uuid4()),
                            "action": "accept",
                            "selected_source_id": "ds-1",
                        }
                    ],
                }
            ),
        )

        chunks = [chunk async for chunk in handler._handle_tool_output(run_item)]
        parsed_chunks = [_parse_sse_payload(chunk) for chunk in chunks]
        emitted_tool_result = next(
            payload
            for payload in parsed_chunks
            if payload["event"] == "tool_result"
            and payload["data"].get("ui_event")
            == "stationary_energy_review_bulk_confirmation_requested"
        )

        self.assertEqual(
            emitted_tool_result["data"]["action"],
            "stationary_energy_request_all_recommended_confirmation",
        )

    async def test_staged_review_rollback_ui_event_is_emitted_as_tool_result(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.tool_invocations.append(
            {
                "id": "tool-call-1",
                "name": "stationary_energy_request_staged_sources_rollback_confirmation",
                "status": "executing",
            }
        )
        run_item = SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="tool-call-1",
                name="stationary_energy_request_staged_sources_rollback_confirmation",
            ),
            output=json.dumps(
                {
                    "success": True,
                    "action": "stationary_energy_request_staged_sources_rollback_confirmation",
                    "ui_event": "stationary_energy_review_rollback_confirmation_requested",
                    "draft_run_id": str(uuid4()),
                    "pending_choices": [
                        {
                            "proposal_id": str(uuid4()),
                            "action": "rollback_staged",
                            "selected_source_id": "ds-1",
                        }
                    ],
                }
            ),
        )

        chunks = [chunk async for chunk in handler._handle_tool_output(run_item)]
        parsed_chunks = [_parse_sse_payload(chunk) for chunk in chunks]
        emitted_tool_result = next(
            payload
            for payload in parsed_chunks
            if payload["event"] == "tool_result"
            and payload["data"].get("ui_event")
            == "stationary_energy_review_rollback_confirmation_requested"
        )

        self.assertEqual(
            emitted_tool_result["data"]["action"],
            "stationary_energy_request_staged_sources_rollback_confirmation",
        )

    def test_stationary_energy_instruction_fallback_uses_composed_prompt(self) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.stationary_energy_draft_run_id = str(uuid4())
        prompts = MagicMock()
        prompts.compose_prompt.return_value = "Composed Stationary Energy prompt"
        settings = SimpleNamespace(llm=SimpleNamespace(prompts=prompts))

        with patch("app.utils.streaming_handler.get_settings", return_value=settings):
            instruction_text = handler._stationary_energy_review_instruction_text()

        self.assertEqual(instruction_text, "Composed Stationary Energy prompt")
        prompts.compose_prompt.assert_called_once_with("stationary_energy_review")
