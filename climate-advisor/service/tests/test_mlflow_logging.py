"""MLflow configuration, redaction, artifacts, and trace logging."""

from __future__ import annotations

import json
import sys
from contextvars import ContextVar
from pathlib import Path
from types import ModuleType, SimpleNamespace

from app.utils import mlflow_logging
from tests.mlflow_fixtures import reset_mlflow_state


def test_initialize_mlflow_returns_false_when_disabled(monkeypatch) -> None:
    """Disabled MLflow should no-op without trying to import MLflow."""
    reset_mlflow_state(monkeypatch)
    monkeypatch.setenv("MLFLOW_ENABLED", "false")

    assert mlflow_logging.initialize_mlflow() is False


def test_start_run_uses_named_experiment_id(monkeypatch) -> None:
    """Runs should start against the explicitly resolved experiment id."""
    reset_mlflow_state(monkeypatch)
    recorded: dict[str, object] = {}

    class Client:
        def get_experiment_by_name(self, name: str) -> None:
            recorded["looked_up"] = name
            return None

        def create_experiment(self, name: str) -> str:
            recorded["created"] = name
            return "exp-created"

        def create_run(
            self, *, run_name: str, experiment_id: str, tags: dict[str, str]
        ):
            recorded.update(run_name=run_name, experiment_id=experiment_id, tags=tags)
            return SimpleNamespace(info=SimpleNamespace(run_id="run-1"))

        def log_batch(self, *, run_id: str, params, **kwargs) -> None:
            recorded["run_id"] = run_id
            recorded["params"] = {param.key: param.value for param in params}

        def set_terminated(self, run_id: str, *, status: str) -> None:
            recorded["closed"] = (run_id, status)

    class RecordingMlflow:
        tracking = SimpleNamespace(MlflowClient=Client)
        config = SimpleNamespace(enable_async_logging=lambda enabled: None)
        openai = SimpleNamespace(autolog=lambda: None)

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            recorded["tracking_uri"] = uri

        @staticmethod
        def set_experiment(name: str):
            return SimpleNamespace(name=name, experiment_id="trace-experiment")

    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_TRACKING_URI", "https://mlflow.example")
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    with mlflow_logging.start_run(
        run_name="test-run",
        experiment_name="run-experiment",
        tags={"workflow": "stationary_energy_draft"},
        params={"records": 2},
    ) as run:
        assert run is not None

    assert recorded["tracking_uri"] == "https://mlflow.example"
    assert recorded["looked_up"] == "run-experiment"
    assert recorded["created"] == "run-experiment"
    assert recorded["experiment_id"] == "exp-created"
    assert recorded["run_name"] == "test-run"
    assert recorded["run_id"] == "run-1"
    assert recorded["closed"] == ("run-1", "FINISHED")
    assert recorded["tags"] == {
        "mlflow.user": "climate-advisor",
        "service": "climate-advisor",
        "environment": "dev",
        "workflow": "stationary_energy_draft",
    }
    assert recorded["params"] == {"records": "2"}


def test_mlflow_run_user_defaults_and_overrides(monkeypatch) -> None:
    """MLflow Created by should use a service identity instead of the OS user."""
    monkeypatch.delenv("MLFLOW_RUN_USER", raising=False)
    assert mlflow_logging.mlflow_run_user() == "climate-advisor"

    monkeypatch.setenv("MLFLOW_RUN_USER", "ca-local-smoke")
    assert mlflow_logging.mlflow_run_user() == "ca-local-smoke"


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


def test_log_json_artifact_redacts_before_logging(monkeypatch) -> None:
    """Artifact logging should redact payloads before handing them to MLflow."""
    recorded: dict[str, object] = {}

    class RecordingMlflow:
        @staticmethod
        def log_dict(
            run_id: str, payload: dict[str, object], artifact_file: str
        ) -> None:
            recorded["run_id"] = run_id
            recorded["payload"] = payload
            recorded["artifact_file"] = artifact_file

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    monkeypatch.setattr(
        mlflow_logging,
        "_RUN_CONTEXT",
        ContextVar(
            "test_run", default=mlflow_logging._RunContext(RecordingMlflow, "run-1")
        ),
    )
    mlflow_logging.log_json_artifact(
        "request.json",
        {"access_token": "secret-token", "token_count": 7},
    )

    assert recorded["artifact_file"] == "request.json"
    assert recorded["run_id"] == "run-1"
    assert recorded["payload"] == {
        "access_token": mlflow_logging.REDACTED_VALUE,
        "token_count": 7,
    }


def test_trace_span_records_redacted_inputs_and_outputs(monkeypatch) -> None:
    """Manual spans should preserve nesting data without leaking credentials."""
    recorded: dict[str, object] = {}

    class Span:
        def set_inputs(self, inputs: object) -> None:
            recorded["inputs"] = inputs

        def set_outputs(self, outputs: object) -> None:
            recorded["outputs"] = outputs

    class SpanContext:
        def __enter__(self) -> Span:
            return Span()

        def __exit__(self, exc_type, exc, tb) -> None:
            recorded["closed"] = True

    class RecordingMlflow:
        @staticmethod
        def start_span(**kwargs: object) -> SpanContext:
            recorded["span_kwargs"] = kwargs
            return SpanContext()

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    with mlflow_logging.start_trace_span(
        name="workflow",
        span_type="CHAIN",
        inputs={"api_key": "secret", "turns": 15},
    ) as span:
        mlflow_logging.set_span_outputs(span, {"status": "complete"})

    assert recorded["span_kwargs"] == {
        "name": "workflow",
        "span_type": "CHAIN",
        "attributes": {},
    }
    assert recorded["inputs"] == {
        "api_key": mlflow_logging.REDACTED_VALUE,
        "turns": 15,
    }
    assert recorded["outputs"] == {"status": "complete"}
    assert recorded["closed"] is True


def test_log_directory_artifacts_uploads_exact_source_directory(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Source snapshots should be uploaded beneath the MLflow sources folder."""
    source_directory = tmp_path / "sources"
    source_directory.mkdir()
    (source_directory / "source-001.md").write_text("# Source", encoding="utf-8")
    recorded: dict[str, object] = {}

    class RecordingMlflow:
        @staticmethod
        def log_artifacts(run_id: str, local_dir: str, *, artifact_path: str) -> None:
            recorded["run_id"] = run_id
            recorded["local_dir"] = local_dir
            recorded["artifact_path"] = artifact_path

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    monkeypatch.setattr(
        mlflow_logging,
        "_RUN_CONTEXT",
        ContextVar(
            "test_run", default=mlflow_logging._RunContext(RecordingMlflow, "run-1")
        ),
    )
    mlflow_logging.log_directory_artifacts(
        source_directory,
        artifact_path="sources",
    )

    assert recorded == {
        "run_id": "run-1",
        "local_dir": str(source_directory),
        "artifact_path": "sources",
    }


def test_update_current_trace_context_sets_session_and_metadata(monkeypatch) -> None:
    """Active traces should receive the CA thread id as the MLflow session id."""
    reset_mlflow_state(monkeypatch)
    recorded: dict[str, object] = {}

    class RecordingMlflow:
        @staticmethod
        def get_current_active_span() -> object:
            return object()

        @staticmethod
        def update_current_trace(**kwargs) -> None:
            recorded.update(kwargs)

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    ok = mlflow_logging.update_current_trace_context(
        session_id="thread-1",
        user_id="user-1",
        client_request_id="request-1",
        tags={"workflow": "stationary_energy_context_chat", "empty": ""},
        metadata={"thread_id": "thread-1", "turn": 2},
    )

    assert ok is True
    assert recorded == {
        "tags": {"workflow": "stationary_energy_context_chat"},
        "metadata": {
            "thread_id": "thread-1",
            "turn": "2",
            "mlflow.trace.session": "thread-1",
            "mlflow.trace.user": "user-1",
        },
        "client_request_id": "request-1",
    }


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
            recorded["uri"] = uri

    recorded: dict[str, str] = {}
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
    assert recorded["uri"] == "https://mlflow-dev.openearth.dev"
