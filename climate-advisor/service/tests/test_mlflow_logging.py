"""MLflow configuration, redaction, preflight, and tool observation records."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

from app.utils import mlflow_logging
from tests.mlflow_fixtures import reset_mlflow_state

_PREFLIGHT_SCRIPT = (
    Path(__file__).resolve().parents[1] / "scripts" / "mlflow_preflight.py"
)
_CATALOG_SECRET = "cat-secret-uuid"


def test_initialize_mlflow_returns_false_when_disabled(monkeypatch) -> None:
    """Disabled MLflow should no-op without trying to import MLflow."""
    reset_mlflow_state(monkeypatch)
    monkeypatch.setenv("MLFLOW_ENABLED", "false")

    assert mlflow_logging.initialize_mlflow() is False


def test_start_run_creates_missing_experiment_and_finishes_run(monkeypatch) -> None:
    """A run for a not-yet-existing experiment must create it, not be dropped."""
    reset_mlflow_state(monkeypatch)
    recorded: dict[str, object] = {}

    class Client:
        def get_experiment_by_name(self, name: str) -> None:
            return None

        def create_experiment(self, name: str) -> str:
            recorded["created"] = name
            return "exp-created"

        def create_run(
            self, *, run_name: str, experiment_id: str, tags: dict[str, str]
        ):
            recorded["experiment_id"] = experiment_id
            return SimpleNamespace(info=SimpleNamespace(run_id="run-1"))

        def log_batch(self, *, run_id: str, params, **kwargs) -> None:
            return None

        def set_terminated(self, run_id: str, *, status: str) -> None:
            recorded["closed"] = (run_id, status)

    class RecordingMlflow:
        tracking = SimpleNamespace(MlflowClient=Client)
        config = SimpleNamespace(enable_async_logging=lambda enabled: None)
        openai = SimpleNamespace(autolog=lambda: None)

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            return None

        @staticmethod
        def set_experiment(name: str):
            return SimpleNamespace(name=name, experiment_id="trace-experiment")

    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_TRACKING_URI", "https://mlflow.example")
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    with mlflow_logging.start_run(
        run_name="test-run", experiment_name="run-experiment", params={"records": 2}
    ) as run:
        assert run is not None

    assert recorded["created"] == "run-experiment"
    assert recorded["experiment_id"] == "exp-created"
    assert recorded["closed"] == ("run-1", "FINISHED")


def test_mlflow_experiment_name_matches_active_server_name(monkeypatch) -> None:
    """The default preserves the case-sensitive active MLflow experiment name."""
    monkeypatch.delenv("MLFLOW_EXPERIMENT_NAME", raising=False)

    assert mlflow_logging.climate_advisor_experiment_name() == "Clima"


def test_live_span_set_tag_compatibility_uses_span_attributes(monkeypatch) -> None:
    """OpenAI Agents tracing should work with MLflow builds missing LiveSpan.set_tag."""

    class LiveSpan:
        def __init__(self) -> None:
            self.attributes: dict[str, object] = {}

        def set_attribute(self, key: str, value: object) -> None:
            self.attributes[key] = value

    fake_entities = ModuleType("mlflow.entities")
    fake_entities.LiveSpan = LiveSpan
    monkeypatch.setitem(sys.modules, "mlflow.entities", fake_entities)
    monkeypatch.setattr(mlflow_logging, "mlflow", object())

    mlflow_logging._install_live_span_set_tag_compatibility()

    span = LiveSpan()
    span.set_tag("group_id", "thread-1")
    assert span.attributes == {"group_id": "thread-1"}


def test_redact_payload_removes_credentials_without_redacting_token_counts() -> None:
    """Debug artifacts should keep useful counts while removing credentials."""
    payload = mlflow_logging.redact_payload(
        {
            "access_token": "secret-token",
            "authorization": "Bearer abc.def.ghi",
            "token_count": 42,
            "nested": {
                "OPENAI_API_KEY": "sk-secretvalue",
                "OPENROUTER_API_KEY": "sk-secretvalue",
                "text": "Use Bearer abcdefghijklmnopqrstuvwxyz.abcdefghijkl.abcdef",
            },
        }
    )

    assert payload["access_token"] == mlflow_logging.REDACTED_VALUE
    assert payload["authorization"] == mlflow_logging.REDACTED_VALUE
    assert payload["token_count"] == 42
    assert payload["nested"]["OPENAI_API_KEY"] == mlflow_logging.REDACTED_VALUE
    assert payload["nested"]["OPENROUTER_API_KEY"] == mlflow_logging.REDACTED_VALUE
    assert mlflow_logging.REDACTED_VALUE in payload["nested"]["text"]


def test_update_current_trace_context_skips_without_active_trace(monkeypatch) -> None:
    """Trace updates should no-op cleanly when MLflow has no active span yet."""
    reset_mlflow_state(monkeypatch)
    recorded: dict[str, object] = {}

    class RecordingMlflow:
        @staticmethod
        def get_current_active_span() -> None:
            return None

        @staticmethod
        def update_current_trace(**kwargs) -> None:
            recorded.update(kwargs)

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    ok = mlflow_logging.update_current_trace_context(session_id="thread-1")

    assert ok is False
    assert recorded == {}


def test_inspect_mlflow_configuration_reports_presence_without_secrets(
    monkeypatch,
) -> None:
    """Preflight must report configuration presence without credential values."""
    reset_mlflow_state(monkeypatch)
    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_TRACKING_URI", "https://mlflow-dev.openearth.dev")
    monkeypatch.setenv("MLFLOW_TRACKING_USERNAME", "service-user")
    monkeypatch.setenv("MLFLOW_TRACKING_PASSWORD", "super-secret")
    monkeypatch.setenv("MLFLOW_ENVIRONMENT", "local-david")
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "Clima")

    class Client:
        def get_experiment_by_name(self, name: str):
            return SimpleNamespace(name=name, experiment_id="exp-1")

    class RecordingMlflow:
        tracking = SimpleNamespace(MlflowClient=lambda: Client())

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            return None

    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    report = mlflow_logging.inspect_mlflow_configuration()
    dumped = json.dumps(report)

    assert report["enabled"] is True
    assert report["username_present"] is True
    assert report["password_present"] is True
    assert report["connection_ok"] is True
    assert report["experiment_resolved"] is True
    assert report["environment"] == "local-david"
    assert "super-secret" not in dumped
    assert "service-user" not in dumped


def test_preflight_json_omits_credentials_and_exits_when_unready(
    monkeypatch, capsys
) -> None:
    """The CLI must not print secrets and must fail closed when MLflow is off."""
    # Load the service script even when the parent `scripts` package shadows it.
    spec = importlib.util.spec_from_file_location(
        "mlflow_preflight_under_test", _PREFLIGHT_SCRIPT
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setenv("MLFLOW_ENABLED", "false")
    monkeypatch.setenv("MLFLOW_TRACKING_USERNAME", "service-user")
    monkeypatch.setenv("MLFLOW_TRACKING_PASSWORD", "super-secret")
    monkeypatch.setattr(module, "_load_local_env", lambda: None)

    exit_code = module.main(["--json"])
    output = capsys.readouterr().out

    assert exit_code == 1
    assert json.loads(output)["enabled"] is False
    assert "super-secret" not in output
    assert "service-user" not in output


def test_tool_observation_redacts_catalog_storage_and_credentials(
    monkeypatch,
) -> None:
    """Per-tool MLflow records must never include identifiers, storage, or secrets."""
    reset_mlflow_state(monkeypatch)

    pending: dict[str, mlflow_logging._ToolObservation] = {}
    mlflow_logging.start_tool_observation(
        pending,
        call_id="call-read",
        tool_name="native_input_read",
        arguments={
            "catalogId": _CATALOG_SECRET,
            "capabilityId": "ghgi.inventory.status_overview",
            "access_token": "secret-token",
            "storage_path": "s3://bucket/object-key",
        },
        request_id="req-redact",
    )
    record = mlflow_logging.finish_tool_observation(
        pending,
        [],
        call_id="call-read",
        output={
            "success": True,
            "authorization": "Bearer abc.def.ghi",
            "data": {
                "catalogId": _CATALOG_SECRET,
                "signed_url": "https://example.invalid/secret",
                "entries": [{"catalogId": _CATALOG_SECRET}],
            },
        },
    )

    dumped = json.dumps(record)
    assert _CATALOG_SECRET not in dumped
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


_DISCOVER_SUCCESS = {
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
_READ_ARGUMENTS = {
    "catalogId": _CATALOG_SECRET,
    "capabilityId": "ghgi.inventory.status_overview",
}


@pytest.mark.parametrize(
    "read_invocation, outcome",
    [
        (
            {
                "id": "call-read",
                "name": "native_input_read",
                "status": "success",
                "arguments": _READ_ARGUMENTS,
                "result_json": {
                    "action": "native_input_read",
                    "success": False,
                    "error_code": "capability_unavailable",
                    "data": {"catalogId": _CATALOG_SECRET},
                },
            },
            "error",
        ),
        (
            {
                "id": "call-read",
                "name": "native_input_read",
                "status": "executing",
                "arguments": _READ_ARGUMENTS,
            },
            "incomplete",
        ),
    ],
    ids=["failed-envelope", "still-executing"],
)
def test_fallback_tool_records_fill_gaps_without_catalog_ids(
    read_invocation: dict[str, object], outcome: str
) -> None:
    """Uninstrumented calls are classified from the tool envelope, never transport status."""
    completed = mlflow_logging.redacted_tool_invocation_records(
        [_DISCOVER_SUCCESS], request_id="req-merge"
    )

    records = mlflow_logging.merge_redacted_tool_records(
        [_DISCOVER_SUCCESS, read_invocation], completed, request_id="req-merge"
    )

    assert [record["tool_name"] for record in records] == [
        "native_input_discover",
        "native_input_read",
    ]
    assert records[1]["outcome"] == outcome
    assert _CATALOG_SECRET not in json.dumps(records)


def test_failed_run_creation_does_not_break_the_workflow(mlflow_client) -> None:
    """An MLflow outage while creating a run must not fail the request it wraps."""
    from app.utils import mlflow_logging

    mlflow_client.create_run.side_effect = RuntimeError("mlflow down")

    with mlflow_logging.start_run(run_name="cnb_start", experiment_name="ca") as run:
        mlflow_logging.log_params({"step": "start"})

    assert run is None
