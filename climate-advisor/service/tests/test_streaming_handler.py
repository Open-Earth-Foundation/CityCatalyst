from __future__ import annotations

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

    async def test_hiap_rerank_ui_event_is_emitted_as_tool_result(self) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.tool_invocations.append(
            {
                "id": "tool-call-1",
                "name": "hiap_rerank_action",
                "status": "executing",
            }
        )
        run_item = SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="tool-call-1",
                name="hiap_rerank_action",
            ),
            output=json.dumps(
                {
                    "success": True,
                    "ui_event": "hiap_rerank_action_applied",
                    "actionId": "action-2",
                    "actionName": "Electrify municipal buildings",
                    "actionType": "mitigation",
                    "previousRank": 2,
                    "newRank": 1,
                }
            ),
        )

        chunks = [chunk async for chunk in handler._handle_tool_output(run_item)]
        parsed_chunks = [_parse_sse_payload(chunk) for chunk in chunks]
        emitted_tool_result = next(
            payload
            for payload in parsed_chunks
            if payload["event"] == "tool_result"
            and payload["data"].get("ui_event") == "hiap_rerank_action_applied"
        )

        self.assertEqual(emitted_tool_result["data"]["name"], "hiap_rerank_action")
        self.assertEqual(
            emitted_tool_result["data"]["actionName"],
            "Electrify municipal buildings",
        )
        self.assertEqual(emitted_tool_result["data"]["previousRank"], 2)
        self.assertEqual(emitted_tool_result["data"]["newRank"], 1)


class StreamingHandlerHiapContextTests(unittest.TestCase):
    def test_hiap_context_message_includes_visible_panel_summary(self) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.hiap_web_grounding = True
        context_payload = {
            "city": {"name": "CA Demo New York 145354"},
            "inventory": {"year": 2024},
            "mitigation": {
                "rankedActions": [
                    {
                        "actionId": "mitigation-1",
                        "rank": 1,
                        "name": "Expand zero-emission transit priority corridors",
                        "type": "mitigation",
                        "sectors": ["transportation"],
                    },
                    {
                        "actionId": "mitigation-2",
                        "rank": 2,
                        "name": "Electrify municipal buildings",
                        "type": "mitigation",
                        "sectors": ["stationary_energy"],
                    },
                    {
                        "actionId": "mitigation-3",
                        "rank": 3,
                        "name": "Capture methane from organic waste",
                        "type": "mitigation",
                        "sectors": ["waste"],
                    },
                    {
                        "actionId": "mitigation-4",
                        "rank": 4,
                        "name": "Procure offsite renewables",
                        "type": "mitigation",
                    },
                ],
                "selectedActions": [],
                "unrankedActions": [],
                "counts": {"ranked": 4, "unranked": 0, "selected": 0},
            },
            "adaptation": {
                "rankedActions": [
                    {
                        "actionId": "adaptation-1",
                        "rank": 1,
                        "name": "Open neighborhood cooling resilience hubs",
                        "type": "adaptation",
                        "hazards": ["public_health"],
                    },
                ],
                "selectedActions": [
                    {
                        "actionId": "adaptation-2",
                        "rank": 2,
                        "name": "Expand shaded streets and urban tree canopy",
                        "type": "adaptation",
                        "isSelected": True,
                        "hazards": ["biodiversity"],
                    },
                ],
                "unrankedActions": [],
                "counts": {"ranked": 1, "unranked": 0, "selected": 1},
            },
        }

        message = handler._format_hiap_context_message(context_payload)

        self.assertEqual(message["role"], "system")
        self.assertIn("VISIBLE_HIAP_PANEL_SUMMARY", message["content"])
        self.assertIn("HIAP_CONTEXT_JSON", message["content"])

        visible_json = message["content"].split("VISIBLE_HIAP_PANEL_SUMMARY\n", 1)[
            1
        ].split("\nHIAP_CONTEXT_JSON\n", 1)[0]
        visible_panel = json.loads(visible_json)
        self.assertEqual(
            [
                action["name"]
                for action in visible_panel["top_mitigation_actions"]
            ],
            [
                "Expand zero-emission transit priority corridors",
                "Electrify municipal buildings",
                "Capture methane from organic waste",
            ],
        )
        self.assertEqual(
            [
                action["name"]
                for action in visible_panel["top_adaptation_actions"]
            ],
            ["Expand shaded streets and urban tree canopy"],
        )

        payload_json = message["content"].split("HIAP_CONTEXT_JSON\n", 1)[1].split(
            "\nUse this authoritative",
            1,
        )[0]
        payload = json.loads(payload_json)
        self.assertTrue(payload["openrouter_web_grounding"])
        self.assertEqual(payload["visible_panel"], visible_panel)
