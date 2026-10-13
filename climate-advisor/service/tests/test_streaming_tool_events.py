from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.utils.streaming_events import handle_tool_called, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from tests.streaming_fixtures import _parse_sse_payload


class StreamingToolEventsTests(unittest.IsolatedAsyncioTestCase):
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

        chunks = [chunk async for chunk in handle_tool_output(handler, run_item)]
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

        chunks = [chunk async for chunk in handle_tool_output(handler, run_item)]
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

    async def test_mlflow_tool_logging_failure_does_not_change_sse(self) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        run_item = SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_discover",
                call_id="call-discover",
                arguments="{}",
            )
        )

        with patch(
            "app.utils.streaming_events.start_tool_observation",
            side_effect=RuntimeError("mlflow down"),
        ):
            chunks = [chunk async for chunk in handle_tool_called(handler, run_item)]

        parsed = [_parse_sse_payload(chunk) for chunk in chunks]
        self.assertEqual(parsed[0]["event"], "tool_result")
        self.assertEqual(parsed[0]["data"]["name"], "native_input_discover")
        self.assertEqual(parsed[0]["data"]["status"], "executing")
