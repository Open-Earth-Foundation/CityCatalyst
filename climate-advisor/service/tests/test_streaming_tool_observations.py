from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.mlflow_logging import finish_tool_observation, start_tool_observation
from app.utils.streaming_events import handle_tool_called, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from app.utils.streaming_telemetry import log_mlflow_stream_summary


class StreamingToolObservationsTests(unittest.IsolatedAsyncioTestCase):
    async def test_agentic_mlflow_fallback_omits_raw_catalog_payloads(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.request_identifier = "req-agentic-fallback"
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=str(uuid4())
        )
        marker = "cat-fallback-secret-uuid"
        called = SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_read",
                call_id="call-read-fallback",
                arguments=json.dumps(
                    {
                        "catalogId": marker,
                        "capabilityId": "ghgi.inventory.status_overview",
                    }
                ),
            )
        )
        output = SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="call-read-fallback",
                name="native_input_read",
            ),
            output=json.dumps(
                {
                    "action": "native_input_read",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "error": "Requested capability is unavailable.",
                    "data": {"catalogId": marker, "bounded": True},
                }
            ),
        )

        with (
            patch(
                "app.utils.streaming_events.start_tool_observation",
                side_effect=RuntimeError("mlflow span start failed"),
            ),
            patch(
                "app.utils.streaming_events.finish_tool_observation",
                side_effect=RuntimeError("mlflow span finish failed"),
            ),
        ):
            sse_chunks = [chunk async for chunk in handle_tool_called(handler, called)]
            sse_chunks.extend(
                [chunk async for chunk in handle_tool_output(handler, output)]
            )

        self.assertEqual(handler._tool_observation_records, [])
        self.assertEqual(
            handler.tool_invocations[0]["arguments"]["catalogId"],
            marker,
        )
        self.assertIn(marker, json.dumps(handler.tool_invocations))
        self.assertIn(marker, b"".join(sse_chunks).decode("utf-8"))

        logged: list[tuple[str, object]] = []

        def fake_log_json_artifact(artifact_file: str, payload: object) -> None:
            logged.append((artifact_file, payload))

        with (
            patch(
                "app.utils.streaming_telemetry.log_json_artifact",
                side_effect=fake_log_json_artifact,
            ),
            patch("app.utils.streaming_telemetry.log_metrics"),
            patch("app.utils.streaming_telemetry.log_tags"),
            patch("app.utils.streaming_telemetry.log_text_artifact"),
            patch(
                "app.utils.streaming_telemetry.close_open_tool_observations",
                side_effect=RuntimeError("mlflow close failed"),
            ),
        ):
            await log_mlflow_stream_summary(handler, ok=True, started_at=0.0)

        artifact = next(
            payload
            for artifact_file, payload in logged
            if artifact_file == "chat/tool_invocations.json"
        )
        dumped = json.dumps(artifact)
        record = artifact["tool_invocations"][0]
        self.assertNotIn(marker, dumped)
        self.assertNotIn("bounded", dumped)
        self.assertEqual(handler.tool_invocations[0]["status"], "success")
        self.assertEqual(record["state"], "failed")
        self.assertEqual(record["outcome"], "error")
        self.assertEqual(record["output"]["success"], False)
        self.assertEqual(record["output"]["error_code"], "capability_unavailable")

    async def test_agentic_mlflow_fallback_keeps_executing_tools_incomplete(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.request_identifier = "req-incomplete-fallback"
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=str(uuid4())
        )
        marker = "cat-incomplete-secret-uuid"
        called = SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_read",
                call_id="call-read-incomplete",
                arguments=json.dumps(
                    {
                        "catalogId": marker,
                        "capabilityId": "ghgi.inventory.status_overview",
                    }
                ),
            )
        )

        with patch(
            "app.utils.streaming_events.start_tool_observation",
            side_effect=RuntimeError("mlflow span start failed"),
        ):
            _ = [chunk async for chunk in handle_tool_called(handler, called)]

        self.assertEqual(handler.tool_invocations[0]["status"], "executing")
        self.assertNotIn("result", handler.tool_invocations[0])

        logged: list[tuple[str, object]] = []

        def fake_log_json_artifact(artifact_file: str, payload: object) -> None:
            logged.append((artifact_file, payload))

        with (
            patch(
                "app.utils.streaming_telemetry.log_json_artifact",
                side_effect=fake_log_json_artifact,
            ),
            patch("app.utils.streaming_telemetry.log_metrics"),
            patch("app.utils.streaming_telemetry.log_tags"),
            patch("app.utils.streaming_telemetry.log_text_artifact"),
            patch(
                "app.utils.streaming_telemetry.close_open_tool_observations",
                side_effect=RuntimeError("mlflow close failed"),
            ),
        ):
            await log_mlflow_stream_summary(handler, ok=True, started_at=0.0)

        artifact = next(
            payload
            for artifact_file, payload in logged
            if artifact_file == "chat/tool_invocations.json"
        )
        record = artifact["tool_invocations"][0]
        dumped = json.dumps(artifact)
        self.assertNotIn(marker, dumped)
        self.assertEqual(record["state"], "cancelled")
        self.assertEqual(record["outcome"], "incomplete")
        self.assertNotEqual(record["outcome"], "success")

    async def test_agentic_mlflow_summary_merges_partial_instrumentation_failure(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.request_identifier = "req-partial-fallback"
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=str(uuid4())
        )
        marker = "cat-partial-secret-uuid"
        discover_called = SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_discover",
                call_id="call-discover",
                arguments="{}",
            )
        )
        read_called = SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_read",
                call_id="call-read",
                arguments=json.dumps(
                    {
                        "catalogId": marker,
                        "capabilityId": "ghgi.inventory.status_overview",
                    }
                ),
            )
        )
        discover_output = SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="call-discover",
                name="native_input_discover",
            ),
            output=json.dumps(
                {
                    "action": "native_input_discover",
                    "success": True,
                    "data": {"entries": [{"catalogId": marker}]},
                }
            ),
        )
        read_output = SimpleNamespace(
            raw_item=SimpleNamespace(call_id="call-read", name="native_input_read"),
            output=json.dumps(
                {
                    "action": "native_input_read",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "error": "Requested capability is unavailable.",
                    "data": {"catalogId": marker},
                }
            ),
        )

        def start_side_effect(pending, **kwargs):
            if kwargs.get("tool_name") == "native_input_read":
                raise RuntimeError("mlflow span start failed")
            return start_tool_observation(pending, **kwargs)

        def finish_side_effect(pending, completed, **kwargs):
            if kwargs.get("call_id") == "call-read":
                raise RuntimeError("mlflow span finish failed")
            return finish_tool_observation(pending, completed, **kwargs)

        with (
            patch(
                "app.utils.streaming_events.start_tool_observation",
                side_effect=start_side_effect,
            ),
            patch(
                "app.utils.streaming_events.finish_tool_observation",
                side_effect=finish_side_effect,
            ),
        ):
            _ = [chunk async for chunk in handle_tool_called(handler, discover_called)]
            _ = [chunk async for chunk in handle_tool_called(handler, read_called)]
            _ = [chunk async for chunk in handle_tool_output(handler, discover_output)]
            _ = [chunk async for chunk in handle_tool_output(handler, read_output)]

        self.assertEqual(len(handler.tool_invocations), 2)
        self.assertEqual(len(handler._tool_observation_records), 1)

        logged: list[tuple[str, object]] = []

        def fake_log_json_artifact(artifact_file: str, payload: object) -> None:
            logged.append((artifact_file, payload))

        with (
            patch(
                "app.utils.streaming_telemetry.log_json_artifact",
                side_effect=fake_log_json_artifact,
            ),
            patch("app.utils.streaming_telemetry.log_metrics"),
            patch("app.utils.streaming_telemetry.log_tags"),
            patch("app.utils.streaming_telemetry.log_text_artifact"),
            patch(
                "app.utils.streaming_telemetry.close_open_tool_observations",
                side_effect=RuntimeError("mlflow close failed"),
            ),
        ):
            await log_mlflow_stream_summary(handler, ok=True, started_at=0.0)

        artifact = next(
            payload
            for artifact_file, payload in logged
            if artifact_file == "chat/tool_invocations.json"
        )
        records = artifact["tool_invocations"]
        dumped = json.dumps(artifact)
        self.assertEqual(
            [record["tool_name"] for record in records],
            ["native_input_discover", "native_input_read"],
        )
        self.assertEqual(records[0]["outcome"], "success")
        self.assertEqual(records[1]["state"], "failed")
        self.assertEqual(records[1]["outcome"], "error")
        self.assertNotIn(marker, dumped)
