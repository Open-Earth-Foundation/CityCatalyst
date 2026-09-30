from __future__ import annotations

import os
from contextvars import ContextVar
from itertools import count
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mlflow_client(monkeypatch):
    """Isolate explicit run logging without exposing MLflow's fluent API."""
    from app.utils import mlflow_logging

    client = MagicMock()
    ids = count(1)
    client.create_run.side_effect = lambda **kw: SimpleNamespace(
        info=SimpleNamespace(run_id=f"run-{next(ids)}")
    )
    client.log_batch.return_value = None
    monkeypatch.setattr(
        mlflow_logging, "initialize_mlflow", MagicMock(return_value=True)
    )
    monkeypatch.setattr(mlflow_logging, "_experiment_id", lambda name: "experiment-1")
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("test_run", default=None)
    )
    monkeypatch.setattr(
        mlflow_logging,
        "mlflow",
        SimpleNamespace(tracking=SimpleNamespace(MlflowClient=lambda: client)),
    )
    return client


@pytest.fixture
def chat_service(monkeypatch):
    """Stub chat dependencies while retaining the real streaming handler."""
    from app.utils.streaming_handler import StreamingHandler

    service = MagicMock()
    service.preferred_model_for_context.return_value = "test-model"
    service.create_agent = AsyncMock(return_value=object())
    service.close = AsyncMock()
    service.current_cc_token.return_value = None
    monkeypatch.setattr(
        "app.utils.streaming_handler.AgentService", lambda **kw: service
    )
    monkeypatch.setattr(
        StreamingHandler, "_load_conversation_history", AsyncMock(return_value=[])
    )
    return service


def pytest_configure(config: pytest.Config) -> None:
    """Keep every pytest process from writing runs or traces to remote MLflow."""
    os.environ["MLFLOW_ENABLED"] = "false"


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-manual-llm-e2e",
        action="store_true",
        default=False,
        help="Run manual-only Stationary Energy E2E tests that call live LLM and CC services.",
    )


def pytest_collection_modifyitems(
    config: pytest.Config,
    items: list[pytest.Item],
) -> None:
    if config.getoption("--run-manual-llm-e2e"):
        return

    skip_manual_llm = pytest.mark.skip(
        reason="manual_llm tests are disabled by default; pass --run-manual-llm-e2e to run them",
    )
    for item in items:
        if "manual_llm" in item.keywords:
            item.add_marker(skip_manual_llm)
