from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.streaming_handler import StreamingHandler
from app.utils.streaming_prompt import stationary_energy_review_instruction_text
from app.utils.streaming_telemetry import mlflow_tags


class StreamingPromptTests(unittest.IsolatedAsyncioTestCase):
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
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=draft_run_id
        )
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
                "app.utils.streaming_telemetry.update_current_trace_context",
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
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=draft_run_id
        )
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

    async def test_cnb_fallback_retains_composed_cnb_instructions(self) -> None:
        payload = MessageCreateRequest(
            user_id="user-1", content="Check the project budget"
        )
        handler = StreamingHandler(
            thread_id=str(uuid4()), user_id="user-1", session_factory=None
        )
        handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
        instructions = "Shared core + CNB-specific instructions"
        agent = SimpleNamespace(instructions=instructions)
        recorded = {}

        class Messages:
            def run_stream(self, prompt):
                recorded["instructions"] = agent.instructions

                async def chunks():
                    yield "No source context available"

                return chunks()

        agent.messages = Messages()
        with patch(
            "app.utils.streaming_handler.Runner.run_streamed",
            side_effect=RuntimeError("unavailable"),
        ):
            chunks = [
                chunk
                async for chunk in handler._stream_agent_events(agent, payload, [])
            ]
        assert chunks == [b"No source context available"]
        assert recorded["instructions"] == instructions
        assert mlflow_tags(handler, payload)["prompt_name"] == "cnb_chat"

    def test_stationary_energy_instruction_fallback_uses_composed_prompt(self) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=str(uuid4())
        )
        prompts = MagicMock()
        prompts.compose_prompt.return_value = "Composed Stationary Energy prompt"
        settings = SimpleNamespace(llm=SimpleNamespace(prompts=prompts))

        with patch("app.utils.streaming_prompt.get_settings", return_value=settings):
            instruction_text = stationary_energy_review_instruction_text(handler)

        self.assertEqual(instruction_text, "Composed Stationary Energy prompt")
        prompts.compose_prompt.assert_called_once_with("stationary_energy_review")
