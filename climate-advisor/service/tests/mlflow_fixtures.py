"""Shared MLflow isolation helpers for logging and tool observation tests."""

from contextvars import ContextVar

from pytest import MonkeyPatch

from app.utils import mlflow_logging


def reset_mlflow_state(monkeypatch: MonkeyPatch) -> None:
    """Reset module-level MLflow state between tests."""
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_LAST_INITIALIZATION_FAILURE_AT", None)
    monkeypatch.setattr(mlflow_logging, "_EXPERIMENT_IDS", {})
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("test_run", default=None)
    )
    monkeypatch.delenv("MLFLOW_ENVIRONMENT", raising=False)
    monkeypatch.delenv("MLFLOW_RUN_USER", raising=False)
