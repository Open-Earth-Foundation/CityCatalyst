"""Unit tests for best-effort MLflow logging helpers."""

from __future__ import annotations

from types import SimpleNamespace

from app.utils import mlflow_logging


def test_initialize_mlflow_returns_false_when_disabled(monkeypatch) -> None:
    """Disabled MLflow should no-op without trying to import MLflow."""
    monkeypatch.setenv("MLFLOW_ENABLED", "false")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZATION_ATTEMPTED", False)

    assert mlflow_logging.initialize_mlflow() is False


def test_initialize_mlflow_fails_open_when_import_errors(monkeypatch) -> None:
    """Missing MLflow dependency should not raise during initialization."""
    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZATION_ATTEMPTED", False)
    monkeypatch.setattr(mlflow_logging, "mlflow", None)

    assert mlflow_logging.initialize_mlflow() is False


def test_start_run_fails_open_when_run_creation_errors(monkeypatch) -> None:
    """Run creation failures should produce a no-op run context."""
    class BrokenMlflow:
        config = SimpleNamespace(enable_async_logging=lambda enabled: None)
        openai = SimpleNamespace(autolog=lambda: None)

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            return None

        @staticmethod
        def set_experiment(name: str) -> None:
            return None

        @staticmethod
        def start_run(*, run_name: str, nested: bool = False):
            raise RuntimeError("mlflow offline")

    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZATION_ATTEMPTED", False)
    monkeypatch.setattr(mlflow_logging, "mlflow", BrokenMlflow)

    with mlflow_logging.start_run(run_name="test-run") as run:
        assert run is None


def test_log_json_artifact_fails_open(monkeypatch) -> None:
    """JSON artifact logging failures should never raise."""
    class BrokenMlflow:
        @staticmethod
        def log_dict(payload: dict[str, object], artifact_file: str) -> None:
            raise RuntimeError("mlflow offline")

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", BrokenMlflow)

    mlflow_logging.log_json_artifact("response_full.json", {"ok": True})


def test_log_text_artifact_fails_open(monkeypatch) -> None:
    """Text artifact logging failures should never raise."""
    class BrokenMlflow:
        @staticmethod
        def log_text(content: str, artifact_file: str) -> None:
            raise RuntimeError("mlflow offline")

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", BrokenMlflow)

    mlflow_logging.log_text_artifact("llm/prompt.txt", "hello")


def test_start_run_fails_open_when_run_close_errors(monkeypatch) -> None:
    """Run shutdown failures should be swallowed by the MLflow wrapper."""
    class BrokenRunContext:
        def __enter__(self) -> object:
            return object()

        def __exit__(self, exc_type, exc, tb) -> None:
            raise RuntimeError("close failed")

    class BrokenMlflow:
        config = SimpleNamespace(enable_async_logging=lambda enabled: None)
        openai = SimpleNamespace(autolog=lambda: None)

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            return None

        @staticmethod
        def set_experiment(name: str) -> None:
            return None

        @staticmethod
        def start_run(*, run_name: str, nested: bool = False) -> BrokenRunContext:
            return BrokenRunContext()

    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZATION_ATTEMPTED", False)
    monkeypatch.setattr(mlflow_logging, "mlflow", BrokenMlflow)

    with mlflow_logging.start_run(run_name="test-run") as run:
        assert run is not None


def test_start_run_closes_run_with_exception_details(monkeypatch) -> None:
    """Exceptions raised inside the run body should still close the MLflow run."""

    class RecordingRunContext:
        def __init__(self) -> None:
            self.exit_args = None

        def __enter__(self) -> object:
            return object()

        def __exit__(self, exc_type, exc, tb) -> None:
            self.exit_args = (exc_type, exc, tb)

    run_context = RecordingRunContext()

    class RecordingMlflow:
        config = SimpleNamespace(enable_async_logging=lambda enabled: None)
        openai = SimpleNamespace(autolog=lambda: None)

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            return None

        @staticmethod
        def set_experiment(name: str) -> None:
            return None

        @staticmethod
        def start_run(*, run_name: str, nested: bool = False) -> RecordingRunContext:
            return run_context

    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_INITIALIZATION_ATTEMPTED", False)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    try:
        with mlflow_logging.start_run(run_name="test-run"):
            raise ValueError("boom")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError to be re-raised")

    assert run_context.exit_args is not None
    assert run_context.exit_args[0] is ValueError
    assert str(run_context.exit_args[1]) == "boom"


def test_log_helpers_use_async_flag(monkeypatch) -> None:
    """Supported fluent APIs should use async logging when enabled."""

    recorded: dict[str, object] = {}

    class RecordingMlflow:
        @staticmethod
        def set_tags(tags: dict[str, str], synchronous: bool) -> None:
            recorded["tags_sync"] = synchronous

        @staticmethod
        def log_params(params: dict[str, object], synchronous: bool) -> None:
            recorded["params_sync"] = synchronous

        @staticmethod
        def log_metrics(metrics: dict[str, float], synchronous: bool) -> None:
            recorded["metrics_sync"] = synchronous

    monkeypatch.setenv("MLFLOW_ASYNC_LOGGING_ENABLED", "true")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    mlflow_logging.log_tags({"a": "b"})
    mlflow_logging.log_params({"p": 1})
    mlflow_logging.log_metrics({"m": 1.0})

    assert recorded == {
        "tags_sync": False,
        "params_sync": False,
        "metrics_sync": False,
    }

