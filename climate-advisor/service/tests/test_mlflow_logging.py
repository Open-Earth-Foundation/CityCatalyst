"""Unit tests for Climate Advisor MLflow logging helpers."""

from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.utils import mlflow_logging
from app.utils.streaming_handler import StreamingHandler


def _reset_mlflow_state(monkeypatch) -> None:
    """Reset module-level MLflow state between tests."""
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_LAST_INITIALIZATION_FAILURE_AT", None)
    monkeypatch.setattr(mlflow_logging, "_EXPERIMENT_IDS", {})
    monkeypatch.delenv("MLFLOW_RUN_USER", raising=False)


def test_initialize_mlflow_returns_false_when_disabled(monkeypatch) -> None:
    """Disabled MLflow should no-op without trying to import MLflow."""
    _reset_mlflow_state(monkeypatch)
    monkeypatch.setenv("MLFLOW_ENABLED", "false")

    assert mlflow_logging.initialize_mlflow() is False


def test_start_run_uses_named_experiment_id(monkeypatch) -> None:
    """Runs should start against the explicitly resolved experiment id."""
    _reset_mlflow_state(monkeypatch)
    recorded: dict[str, object] = {}

    class RunContext:
        def __enter__(self) -> object:
            return object()

        def __exit__(self, exc_type, exc, tb) -> None:
            recorded["closed"] = True

    class Client:
        def get_experiment_by_name(self, name: str) -> None:
            recorded["looked_up"] = name
            return None

        def create_experiment(self, name: str) -> str:
            recorded["created"] = name
            return "exp-created"

    class RecordingMlflow:
        tracking = SimpleNamespace(MlflowClient=Client)
        config = SimpleNamespace(enable_async_logging=lambda enabled: None)
        openai = SimpleNamespace(autolog=lambda: None)

        @staticmethod
        def set_tracking_uri(uri: str) -> None:
            recorded["tracking_uri"] = uri

        @staticmethod
        def active_run() -> object:
            return object()

        @staticmethod
        def start_run(
            *,
            run_name: str,
            experiment_id: str,
            nested: bool,
        ) -> RunContext:
            recorded["run_name"] = run_name
            recorded["experiment_id"] = experiment_id
            recorded["nested"] = nested
            return RunContext()

        @staticmethod
        def set_tags(tags: dict[str, str], synchronous: bool) -> None:
            recorded["tags"] = tags

        @staticmethod
        def log_params(params: dict[str, object], synchronous: bool) -> None:
            recorded["params"] = params

    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_TRACKING_URI", "https://mlflow.example")
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    with mlflow_logging.start_run(
        run_name="test-run",
        experiment_name="clima",
        tags={"workflow": "stationary_energy_draft"},
        params={"records": 2},
    ) as run:
        assert run is not None

    assert recorded["tracking_uri"] == "https://mlflow.example"
    assert recorded["looked_up"] == "clima"
    assert recorded["created"] == "clima"
    assert recorded["experiment_id"] == "exp-created"
    assert recorded["run_name"] == "test-run"
    assert recorded["closed"] is True
    assert recorded["tags"] == {
        "mlflow.user": "climate-advisor",
        "service": "climate-advisor",
        "environment": "dev",
        "workflow": "stationary_energy_draft",
    }
    assert recorded["params"] == {"records": 2}


def test_mlflow_run_user_defaults_and_overrides(monkeypatch) -> None:
    """MLflow Created by should use a service identity instead of the OS user."""
    monkeypatch.delenv("MLFLOW_RUN_USER", raising=False)
    assert mlflow_logging.mlflow_run_user() == "climate-advisor"

    monkeypatch.setenv("MLFLOW_RUN_USER", "ca-local-smoke")
    assert mlflow_logging.mlflow_run_user() == "ca-local-smoke"


def test_redact_payload_removes_credentials_without_redacting_token_counts() -> None:
    """Debug artifacts should keep useful counts while removing credentials."""
    payload = mlflow_logging.redact_payload(
        {
            "access_token": "secret-token",
            "authorization": "Bearer abc.def.ghi",
            "token_count": 42,
            "nested": {
                "OPENAI_API_KEY": "sk-secretvalue",
                "text": "Use Bearer abcdefghijklmnopqrstuvwxyz.abcdefghijkl.abcdef",
            },
        }
    )

    assert payload["access_token"] == mlflow_logging.REDACTED_VALUE
    assert payload["authorization"] == mlflow_logging.REDACTED_VALUE
    assert payload["token_count"] == 42
    assert payload["nested"]["OPENAI_API_KEY"] == mlflow_logging.REDACTED_VALUE
    assert mlflow_logging.REDACTED_VALUE in payload["nested"]["text"]


def test_log_json_artifact_redacts_before_logging(monkeypatch) -> None:
    """Artifact logging should redact payloads before handing them to MLflow."""
    recorded: dict[str, object] = {}

    class RecordingMlflow:
        @staticmethod
        def active_run() -> object:
            return object()

        @staticmethod
        def log_dict(payload: dict[str, object], artifact_file: str) -> None:
            recorded["payload"] = payload
            recorded["artifact_file"] = artifact_file

    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", RecordingMlflow)

    mlflow_logging.log_json_artifact(
        "request.json",
        {"access_token": "secret-token", "token_count": 7},
    )

    assert recorded["artifact_file"] == "request.json"
    assert recorded["payload"] == {
        "access_token": mlflow_logging.REDACTED_VALUE,
        "token_count": 7,
    }


def test_streaming_handler_uses_single_experiment_with_agentic_tags(
    monkeypatch,
) -> None:
    """General and agentic chat traffic should share one experiment and split by tags."""
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "clima")
    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
        inventory_id="inventory-1",
    )

    general_payload = MessageCreateRequest(
        user_id="user-1",
        content="Hello",
        inventory_id="inventory-1",
    )
    agentic_payload = MessageCreateRequest(
        user_id="user-1",
        content="Review this draft",
        inventory_id="inventory-1",
        context={"stationary_energy_draft_run_id": "draft-1"},
    )

    assert handler._mlflow_experiment_name(general_payload) == "clima"
    assert handler._mlflow_experiment_name(agentic_payload) == "clima"
    assert handler._mlflow_tags(agentic_payload)["ca_agentic_flow"] is True
    assert (
        handler._mlflow_tags(agentic_payload)["workflow"]
        == "stationary_energy_context_chat"
    )


def test_streaming_handler_wraps_stream_in_mlflow_run(monkeypatch) -> None:
    """Streaming should create one MLflow run before yielding events."""
    recorded: dict[str, object] = {}

    def fake_start_run(**kwargs):
        recorded.update(kwargs)
        return nullcontext()

    async def fake_stream_response_with_mlflow(**kwargs):
        yield b"event: done\ndata: {\"ok\": true}\n\n"

    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
    )
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "clima")
    monkeypatch.setattr(
        "app.utils.streaming_handler.start_run",
        fake_start_run,
    )
    monkeypatch.setattr(
        handler,
        "_stream_response_with_mlflow",
        fake_stream_response_with_mlflow,
    )

    async def collect() -> list[bytes]:
        return [
            chunk
            async for chunk in handler.stream_response(
                MessageCreateRequest(user_id="user-1", content="Hello")
            )
        ]

    import asyncio

    chunks = asyncio.run(collect())

    assert chunks == [b"event: done\ndata: {\"ok\": true}\n\n"]
    assert recorded["experiment_name"] == "clima"
    assert recorded["run_name"] == "climate_advisor_message_request"


def test_streaming_handler_tags_agentic_flow_from_thread_context(
    monkeypatch,
) -> None:
    """Thread-stored draft context should tag chat runs as agentic inside one experiment."""
    recorded: dict[str, object] = {}
    draft_run_id = uuid4()

    def fake_start_run(**kwargs):
        recorded.update(kwargs)
        return nullcontext()

    async def fake_stream_response_with_mlflow(**kwargs):
        yield b"event: done\ndata: {\"ok\": true}\n\n"

    async def fake_load_thread_stationary_energy_draft_run_id() -> str:
        return str(draft_run_id)

    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
    )
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "clima")
    monkeypatch.setattr(
        "app.utils.streaming_handler.start_run",
        fake_start_run,
    )
    monkeypatch.setattr(
        handler,
        "_stream_response_with_mlflow",
        fake_stream_response_with_mlflow,
    )
    monkeypatch.setattr(
        handler,
        "_load_thread_stationary_energy_draft_run_id",
        fake_load_thread_stationary_energy_draft_run_id,
    )

    async def collect() -> list[bytes]:
        return [
            chunk
            async for chunk in handler.stream_response(
                MessageCreateRequest(user_id="user-1", content="List options")
            )
        ]

    import asyncio

    chunks = asyncio.run(collect())

    assert chunks == [b"event: done\ndata: {\"ok\": true}\n\n"]
    assert recorded["experiment_name"] == "clima"
    assert recorded["run_name"] == "stationary_energy_context_chat_request"
    assert recorded["tags"]["workflow"] == "stationary_energy_context_chat"
    assert recorded["tags"]["stationary_energy_draft_run_id"] == str(draft_run_id)
