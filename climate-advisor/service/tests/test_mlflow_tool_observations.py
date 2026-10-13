"""Tool observation ordering, outcomes, redaction, and resilience."""

from __future__ import annotations

import json
from contextvars import ContextVar
from types import SimpleNamespace

from app.utils import mlflow_logging
from tests.mlflow_fixtures import reset_mlflow_state


def _fake_tool_span(name: str, parent: object, **kwargs: object):
    span = SimpleNamespace(
        name=name, parent=parent, kwargs=kwargs, outputs=None, status=None
    )

    def end(*, outputs=None, status=None, **_kwargs):
        span.outputs = outputs
        span.status = status

    span.end = end
    return span


def test_tool_observations_preserve_discover_then_read_order(monkeypatch) -> None:
    """Catalog orchestration records must keep discover before read."""
    reset_mlflow_state(monkeypatch)
    parent = object()
    spans: list[SimpleNamespace] = []

    class RecordingMlflow:
        @staticmethod
        def get_current_active_span() -> object:
            return parent

        @staticmethod
        def start_span_no_context(*, name: str, parent_span=None, **kwargs):
            span = _fake_tool_span(name, parent_span, **kwargs)
            spans.append(span)
            return span

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)
    monkeypatch.setattr(
        mlflow_logging,
        "_RUN_CONTEXT",
        ContextVar(
            "tool_run",
            default=mlflow_logging._RunContext(object(), "run-catalog"),
        ),
    )

    pending: dict[str, mlflow_logging._ToolObservation] = {}
    completed: list[dict[str, object]] = []
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-discover",
        tool_name="native_input_discover",
        arguments={},
        request_id="req-1",
        completed_count=0,
    )
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-read",
        tool_name="native_input_read",
        arguments={
            "catalogId": "cat-secret",
            "capabilityId": "ghgi.inventory.status_overview",
        },
        request_id="req-1",
        completed_count=0,
    )
    mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-discover",
        output=json.dumps(
            {
                "action": "native_input_discover",
                "success": True,
                "data": {"entries": [{"catalogId": "cat-secret"}]},
            }
        ),
    )
    mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-read",
        output=json.dumps(
            {
                "action": "ghgi.inventory.status_overview",
                "success": True,
                "data": {},
            }
        ),
    )

    assert [record["tool_name"] for record in completed] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert [record["sequence"] for record in completed] == [1, 2]
    assert [record["outcome"] for record in completed] == ["success", "success"]
    assert {span.parent for span in spans} == {parent}
    assert [span.name for span in spans] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert all(record["request_id"] == "req-1" for record in completed)
    assert all(record["run_id"] == "run-catalog" for record in completed)


def test_tool_observations_preserve_call_order_when_read_finishes_first(
    monkeypatch,
) -> None:
    """Summary records stay in call order even if read completes before discover."""
    reset_mlflow_state(monkeypatch)
    parent = object()
    spans: list[SimpleNamespace] = []

    class RecordingMlflow:
        @staticmethod
        def get_current_active_span() -> object:
            return parent

        @staticmethod
        def start_span_no_context(*, name: str, parent_span=None, **kwargs):
            span = _fake_tool_span(name, parent_span, **kwargs)
            spans.append(span)
            return span

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)
    monkeypatch.setattr(
        mlflow_logging,
        "_RUN_CONTEXT",
        ContextVar(
            "tool_run_reverse",
            default=mlflow_logging._RunContext(object(), "run-reverse"),
        ),
    )

    pending: dict[str, mlflow_logging._ToolObservation] = {}
    completed: list[dict[str, object]] = []
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-discover",
        tool_name="native_input_discover",
        arguments={},
        request_id="req-reverse",
        completed_count=0,
    )
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-read",
        tool_name="native_input_read",
        arguments={
            "catalogId": "cat-secret",
            "capabilityId": "ghgi.inventory.status_overview",
        },
        request_id="req-reverse",
        completed_count=0,
    )
    # Finish read first (sequence 2), then discover (sequence 1).
    mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-read",
        output=json.dumps(
            {
                "action": "ghgi.inventory.status_overview",
                "success": True,
                "data": {},
            }
        ),
    )
    mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-discover",
        output=json.dumps(
            {
                "action": "native_input_discover",
                "success": True,
                "data": {"entries": [{"catalogId": "cat-secret"}]},
            }
        ),
    )

    assert [record["tool_name"] for record in completed] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert [record["sequence"] for record in completed] == [1, 2]
    assert [record["outcome"] for record in completed] == ["success", "success"]
    assert {span.parent for span in spans} == {parent}
    assert [span.name for span in spans] == [
        "native_input_discover",
        "native_input_read",
    ]


def test_failed_tool_observation_records_error_outcome(monkeypatch) -> None:
    """A failed tool must remain visible as failed evidence, not as success."""
    reset_mlflow_state(monkeypatch)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)

    pending: dict[str, mlflow_logging._ToolObservation] = {}
    completed: list[dict[str, object]] = []
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-read",
        tool_name="native_input_read",
        arguments={
            "catalogId": "cat-secret",
            "capabilityId": "ghgi.inventory.status_overview",
        },
        request_id="req-fail",
    )
    record = mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-read",
        output={
            "action": "native_input_read",
            "success": False,
            "error_code": "capability_unavailable",
            "error": "Requested capability is unavailable.",
        },
    )

    assert record["state"] == "failed"
    assert record["outcome"] == "error"
    assert record["output"]["error_code"] == "capability_unavailable"
    assert record["output"]["success"] is False
    assert isinstance(record["duration_ms"], float)


def test_redacted_fallback_records_failed_envelope_as_error() -> None:
    """Fallback records must classify from the tool envelope, not transport status."""
    records = mlflow_logging.redacted_tool_invocation_records(
        [
            {
                "id": "call-read",
                "name": "native_input_read",
                "status": "success",
                "arguments": {
                    "catalogId": "cat-fallback-secret-uuid",
                    "capabilityId": "ghgi.inventory.status_overview",
                },
                "result_json": {
                    "action": "native_input_read",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "error": "Requested capability is unavailable.",
                    "data": {"catalogId": "cat-fallback-secret-uuid"},
                },
            }
        ],
        request_id="req-fallback-fail",
    )

    dumped = json.dumps(records)
    assert records[0]["state"] == "failed"
    assert records[0]["outcome"] == "error"
    assert records[0]["output"]["success"] is False
    assert records[0]["output"]["error_code"] == "capability_unavailable"
    assert "cat-fallback-secret-uuid" not in dumped


def test_redacted_fallback_records_executing_invocation_as_incomplete() -> None:
    """An executing invocation with no result must not be logged as success."""
    records = mlflow_logging.redacted_tool_invocation_records(
        [
            {
                "id": "call-read",
                "name": "native_input_read",
                "status": "executing",
                "arguments": {
                    "catalogId": "cat-incomplete-secret-uuid",
                    "capabilityId": "ghgi.inventory.status_overview",
                },
            }
        ],
        request_id="req-fallback-incomplete",
    )

    dumped = json.dumps(records)
    assert records[0]["state"] == "cancelled"
    assert records[0]["outcome"] == "incomplete"
    assert records[0]["output"]["success"] is None
    assert "cat-incomplete-secret-uuid" not in dumped


def test_merge_redacted_tool_records_fills_missing_call_ids() -> None:
    """Completed observations must not hide later uninstrumented invocations."""
    completed = mlflow_logging.redacted_tool_invocation_records(
        [
            {
                "id": "call-discover",
                "name": "native_input_discover",
                "status": "success",
                "arguments": {},
                "result_json": {
                    "action": "native_input_discover",
                    "success": True,
                    "data": {"entries": []},
                },
            }
        ],
        request_id="req-merge",
    )
    records = mlflow_logging.merge_redacted_tool_records(
        [
            {
                "id": "call-discover",
                "name": "native_input_discover",
                "status": "success",
                "arguments": {},
                "result_json": {
                    "action": "native_input_discover",
                    "success": True,
                    "data": {"entries": []},
                },
            },
            {
                "id": "call-read",
                "name": "native_input_read",
                "status": "success",
                "arguments": {"catalogId": "cat-merge-secret-uuid"},
                "result_json": {
                    "action": "native_input_read",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "data": {"catalogId": "cat-merge-secret-uuid"},
                },
            },
        ],
        completed,
        request_id="req-merge",
    )

    dumped = json.dumps(records)
    assert [record["tool_name"] for record in records] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert [record["sequence"] for record in records] == [1, 2]
    assert records[1]["outcome"] == "error"
    assert "cat-merge-secret-uuid" not in dumped


def test_tool_observation_redacts_catalog_storage_and_credentials(
    monkeypatch,
) -> None:
    """Per-tool MLflow records must never include identifiers, storage, or secrets."""
    reset_mlflow_state(monkeypatch)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)

    pending: dict[str, mlflow_logging._ToolObservation] = {}
    completed: list[dict[str, object]] = []
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-read",
        tool_name="native_input_read",
        arguments={
            "catalogId": "cat-secret-uuid",
            "capabilityId": "ghgi.inventory.status_overview",
            "access_token": "secret-token",
            "storage_path": "s3://bucket/object-key",
        },
        request_id="req-redact",
    )
    record = mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-read",
        output={
            "success": True,
            "authorization": "Bearer abc.def.ghi",
            "data": {
                "catalogId": "cat-secret-uuid",
                "signed_url": "https://example.invalid/secret",
                "entries": [{"catalogId": "cat-secret-uuid"}],
            },
        },
    )

    dumped = json.dumps(record)
    assert "cat-secret-uuid" not in dumped
    assert "secret-token" not in dumped
    assert "s3://bucket/object-key" not in dumped
    assert "Bearer" not in dumped
    assert "signed_url" not in dumped
    assert record["input"]["has_catalog_id"] is True
    assert record["input"]["has_capability_id"] is True
    assert record["output"]["entry_count"] == 1


def test_tool_observation_survives_disabled_or_unavailable_mlflow(
    monkeypatch,
) -> None:
    """Chat-side records must still be produced when MLflow is off or raising."""
    reset_mlflow_state(monkeypatch)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)

    class BoomMlflow:
        @staticmethod
        def get_current_active_span() -> object:
            raise RuntimeError("trace backend down")

        @staticmethod
        def start_span_no_context(**kwargs):
            raise RuntimeError("span backend down")

    monkeypatch.setattr(mlflow_logging, "mlflow", BoomMlflow)

    pending: dict[str, mlflow_logging._ToolObservation] = {}
    completed: list[dict[str, object]] = []
    started = mlflow_logging.start_tool_observation(
        pending,
        call_id="call-discover",
        tool_name="native_input_discover",
        arguments={},
        request_id="req-isolated",
    )
    assert started["state"] == "started"
    finished = mlflow_logging.finish_tool_observation(
        pending,
        completed,
        call_id="call-discover",
        output={
            "action": "native_input_discover",
            "success": True,
            "data": {"entries": []},
        },
    )

    assert finished["tool_name"] == "native_input_discover"
    assert finished["outcome"] == "success"
    assert completed == [finished]
