"""Tool events the client sees, and the redacted MLflow records kept beside them."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.utils.mlflow_logging import finish_tool_observation, start_tool_observation
from app.utils.streaming_events import handle_tool_called, handle_tool_output
from app.utils.streaming_handler import StreamingHandler
from app.utils.streaming_telemetry import log_mlflow_stream_summary
from tests.streaming_fixtures import _parse_sse_payload

_CATALOG_SECRET = "cat-secret-uuid"


def _handler() -> StreamingHandler:
    handler = StreamingHandler(
        thread_id=str(uuid4()), user_id="user-1", session_factory=MagicMock()
    )
    handler.request_identifier = "req-catalog"
    return handler


def _catalog_tool_items() -> tuple[list[SimpleNamespace], list[SimpleNamespace]]:
    """A discover call that succeeds and a read call that fails, both naming a catalog."""
    called = [
        SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_discover", call_id="call-discover", arguments="{}"
            )
        ),
        SimpleNamespace(
            raw_item=SimpleNamespace(
                name="native_input_read",
                call_id="call-read",
                arguments=json.dumps(
                    {
                        "catalogId": _CATALOG_SECRET,
                        "capabilityId": "ghgi.inventory.status_overview",
                    }
                ),
            )
        ),
    ]
    outputs = [
        SimpleNamespace(
            raw_item=SimpleNamespace(
                call_id="call-discover", name="native_input_discover"
            ),
            output=json.dumps(
                {
                    "action": "native_input_discover",
                    "success": True,
                    "data": {"entries": [{"catalogId": _CATALOG_SECRET}]},
                }
            ),
        ),
        SimpleNamespace(
            raw_item=SimpleNamespace(call_id="call-read", name="native_input_read"),
            output=json.dumps(
                {
                    "action": "ghgi.inventory.status_overview",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "data": {"catalogId": _CATALOG_SECRET},
                }
            ),
        ),
    ]
    return called, outputs


async def _stream_tool_items(
    handler: StreamingHandler,
    called: list[SimpleNamespace],
    outputs: list[SimpleNamespace],
) -> list[bytes]:
    chunks = []
    for item in called:
        chunks += [chunk async for chunk in handle_tool_called(handler, item)]
    for item in outputs:
        chunks += [chunk async for chunk in handle_tool_output(handler, item)]
    return chunks


async def _logged_tool_artifact(handler: StreamingHandler) -> dict:
    """Run the stream summary and return the tool-invocation artifact it logs."""
    logged: dict[str, object] = {}

    def fake_log_json_artifact(artifact_file: str, payload: object) -> None:
        logged[artifact_file] = payload

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
    return logged["chat/tool_invocations.json"]


@pytest.mark.parametrize(
    "tool_name, ui_event, action",
    [
        (
            "stationary_energy_request_all_recommended_confirmation",
            "stationary_energy_review_bulk_confirmation_requested",
            "accept",
        ),
        (
            "stationary_energy_request_staged_sources_rollback_confirmation",
            "stationary_energy_review_rollback_confirmation_requested",
            "rollback_staged",
        ),
    ],
    ids=["bulk-review", "staged-rollback"],
)
async def test_review_confirmation_ui_event_is_emitted_as_tool_result(
    tool_name: str, ui_event: str, action: str
) -> None:
    handler = _handler()
    handler.tool_invocations.append(
        {"id": "tool-call-1", "name": tool_name, "status": "executing"}
    )
    run_item = SimpleNamespace(
        raw_item=SimpleNamespace(call_id="tool-call-1", name=tool_name),
        output=json.dumps(
            {
                "success": True,
                "action": tool_name,
                "ui_event": ui_event,
                "draft_run_id": str(uuid4()),
                "pending_choices": [
                    {
                        "proposal_id": str(uuid4()),
                        "action": action,
                        "selected_source_id": "ds-1",
                    }
                ],
            }
        ),
    )

    chunks = [chunk async for chunk in handle_tool_output(handler, run_item)]

    emitted = next(
        payload
        for payload in map(_parse_sse_payload, chunks)
        if payload["event"] == "tool_result"
        and payload["data"].get("ui_event") == ui_event
    )
    assert emitted["data"]["action"] == tool_name


async def test_mlflow_tool_logging_failure_does_not_change_sse() -> None:
    called, _ = _catalog_tool_items()

    with patch(
        "app.utils.streaming_events.start_tool_observation",
        side_effect=RuntimeError("mlflow down"),
    ):
        chunks = [chunk async for chunk in handle_tool_called(_handler(), called[0])]

    parsed = [_parse_sse_payload(chunk) for chunk in chunks]
    assert parsed[0]["event"] == "tool_result"
    assert parsed[0]["data"]["name"] == "native_input_discover"
    assert parsed[0]["data"]["status"] == "executing"


async def test_catalog_tools_keep_sse_payloads_and_redact_mlflow_records() -> None:
    handler = _handler()
    called, outputs = _catalog_tool_items()

    chunks = await _stream_tool_items(handler, called, outputs)
    artifact = await _logged_tool_artifact(handler)

    records = handler._tool_observation_records
    assert [record["tool_name"] for record in records] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert [record["outcome"] for record in records] == ["success", "error"]
    # The client and persisted chat keep the catalog id; MLflow never sees it.
    assert _CATALOG_SECRET in b"".join(chunks).decode("utf-8")
    assert handler.tool_invocations[1]["arguments"]["catalogId"] == _CATALOG_SECRET
    assert _CATALOG_SECRET not in json.dumps(records)
    assert artifact["tool_invocations"] == records


async def test_instrumentation_failure_falls_back_to_redacted_records() -> None:
    """A tool whose span failed is still logged, classified and redacted."""
    handler = _handler()
    called, outputs = _catalog_tool_items()

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
        chunks = await _stream_tool_items(handler, called, outputs)
    artifact = await _logged_tool_artifact(handler)

    assert _CATALOG_SECRET in b"".join(chunks).decode("utf-8")
    records = artifact["tool_invocations"]
    assert [record["tool_name"] for record in records] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert [record["outcome"] for record in records] == ["success", "error"]
    assert _CATALOG_SECRET not in json.dumps(artifact)
