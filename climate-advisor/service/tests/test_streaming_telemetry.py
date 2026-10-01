from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.utils.streaming_events import handle_tool_called, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from app.utils.streaming_telemetry import log_mlflow_stream_summary
from tests.streaming_fixtures import _parse_sse_payload


class StreamingTelemetryTests(unittest.IsolatedAsyncioTestCase):
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
                "app.utils.streaming_telemetry.log_metrics",
                side_effect=lambda metrics: logged_metrics.append(metrics),
            ),
            patch(
                "app.utils.streaming_handler.log_json_artifact",
                side_effect=record_json_artifact,
            ),
            patch(
                "app.utils.streaming_telemetry.log_json_artifact",
                side_effect=record_json_artifact,
            ),
            patch(
                "app.utils.streaming_telemetry.log_tags",
                side_effect=lambda tags: logged_tags.append(tags),
            ),
            patch("app.utils.streaming_telemetry.log_text_artifact"),
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

    async def test_catalog_tools_keep_sse_payloads_and_redact_mlflow_records(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.request_identifier = "req-catalog"

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
                        "catalogId": "cat-secret-uuid",
                        "capabilityId": "ghgi.inventory.status_overview",
                    }
                ),
            )
        )
        discover_output = SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="call-discover", name="native_input_discover"
            ),
            output=json.dumps(
                {
                    "action": "native_input_discover",
                    "success": True,
                    "data": {
                        "entries": [
                            {
                                "catalogId": "cat-secret-uuid",
                                "capabilityIds": ["ghgi.inventory.status_overview"],
                            }
                        ]
                    },
                }
            ),
        )
        read_output = SimpleNamespace(
            raw_item=SimpleNamespace(call_id="call-read", name="native_input_read"),
            output=json.dumps(
                {
                    "action": "ghgi.inventory.status_overview",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "error": "Requested capability is unavailable.",
                }
            ),
        )

        sse_chunks = [
            chunk async for chunk in handle_tool_called(handler, discover_called)
        ]
        sse_chunks.extend(
            [chunk async for chunk in handle_tool_called(handler, read_called)]
        )
        sse_chunks.extend(
            [chunk async for chunk in handle_tool_output(handler, discover_output)]
        )
        sse_chunks.extend(
            [chunk async for chunk in handle_tool_output(handler, read_output)]
        )
        parsed = [_parse_sse_payload(chunk) for chunk in sse_chunks]
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
        ):
            await log_mlflow_stream_summary(handler, ok=True, started_at=0.0)

        names = [record["tool_name"] for record in handler._tool_observation_records]
        outcomes = [record["outcome"] for record in handler._tool_observation_records]
        dumped = json.dumps(handler._tool_observation_records)
        artifact = next(
            payload
            for artifact_file, payload in logged
            if artifact_file == "chat/tool_invocations.json"
        )

        self.assertEqual(names, ["native_input_discover", "native_input_read"])
        self.assertEqual(outcomes, ["success", "error"])
        self.assertIn("cat-secret-uuid", json.dumps(parsed))
        self.assertNotIn("cat-secret-uuid", dumped)
        self.assertEqual(
            handler.tool_invocations[1]["arguments"]["catalogId"],
            "cat-secret-uuid",
        )
        self.assertEqual(
            artifact["tool_invocations"], handler._tool_observation_records
        )
