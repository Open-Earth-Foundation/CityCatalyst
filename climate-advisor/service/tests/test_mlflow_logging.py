"""Unit tests for Climate Advisor MLflow logging helpers."""

from __future__ import annotations

import sys
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.routes import concept_note_runs
from app.utils import mlflow_logging
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.cnb_observability import CNBInteraction
from app.utils.streaming_handler import StreamingHandler


def _reset_mlflow_state(monkeypatch) -> None:
    """Reset module-level MLflow state between tests."""
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_LAST_INITIALIZATION_FAILURE_AT", None)
    monkeypatch.setattr(mlflow_logging, "_EXPERIMENT_IDS", {})
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("test_run", default=None)
    )
    monkeypatch.delenv("MLFLOW_ENVIRONMENT", raising=False)
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
    _reset_mlflow_state(monkeypatch)
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
    _reset_mlflow_state(monkeypatch)
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


def test_streaming_handler_uses_single_experiment_with_agentic_tags(
    monkeypatch,
) -> None:
    """General and agentic chat traffic should share one experiment and split by tags."""
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "Clima")
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
    )

    assert handler._mlflow_experiment_name(general_payload) == "Clima"
    assert handler._mlflow_experiment_name(agentic_payload) == "Clima"
    assert handler._mlflow_tags(general_payload)["prompt_name"] == "chat"
    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=str(uuid4())
    )
    assert handler._mlflow_tags(agentic_payload)["ca_agentic_flow"] is True
    assert (
        handler._mlflow_tags(agentic_payload)["workflow"]
        == "stationary_energy_context_chat"
    )


def test_concept_note_context_uses_the_shared_chat_routing() -> None:
    """Concept Note context should classify the existing chat stream consistently."""
    context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))

    assert context.mlflow_run_name == "cnb_chat"
    assert context.trace_workflow_name == "Climate Advisor Concept Note Context Chat"
    assert context.telemetry()["workflow"] == "CNB"
    assert context.telemetry()["workflow_name"] == "concept_note_context_chat"
    assert context.telemetry()["interaction"] == "chat"
    assert context.telemetry()["context_mode"] == "concept_note_run"
    assert context.telemetry()["prompt_name"] == "cnb_chat"


def test_cnb_interactions_have_distinct_stable_mlflow_run_names() -> None:
    """Every CNB interaction type should have one documented run name."""
    run_names = {
        interaction.value: interaction.mlflow_run_name for interaction in CNBInteraction
    }

    assert run_names == {
        "start": "cnb_start",
        "chat": "cnb_chat",
        "missing_information": "cnb_missing_information",
        "chat_edit": "cnb_chat_edit",
    }
    assert len(set(run_names.values())) == len(run_names)


def test_concept_note_start_uses_dedicated_mlflow_run_name(monkeypatch) -> None:
    """Starting a CNB run should be distinct from its later chat turns."""
    import asyncio

    concept_note_run_id = uuid4()
    response_payload = SimpleNamespace(created=True, run_id=concept_note_run_id)
    service = SimpleNamespace(
        start_run_and_schedule_context=AsyncMock(return_value=response_payload)
    )
    recorded: dict[str, object] = {"logged_tags": []}

    def fake_start_run(**kwargs: object):
        recorded["run"] = kwargs
        return nullcontext()

    @contextmanager
    def fake_start_trace_span(**kwargs: object):
        recorded["span"] = kwargs
        yield "start-span"

    def fake_log_tags(tags: dict[str, object]) -> None:
        recorded["logged_tags"].append(tags)

    def fake_update_current_trace_context(**kwargs: object) -> bool:
        recorded["trace_context"] = kwargs
        return True

    def fake_set_span_outputs(span: object, outputs: object) -> None:
        recorded["span_outputs"] = (span, outputs)

    monkeypatch.setattr(
        concept_note_runs,
        "ConceptNoteRunService",
        lambda session: service,
    )
    monkeypatch.setattr(concept_note_runs, "start_mlflow_run", fake_start_run)
    monkeypatch.setattr(
        concept_note_runs,
        "start_trace_span",
        fake_start_trace_span,
    )
    monkeypatch.setattr(concept_note_runs, "log_tags", fake_log_tags)
    monkeypatch.setattr(
        concept_note_runs,
        "update_current_trace_context",
        fake_update_current_trace_context,
    )
    monkeypatch.setattr(
        concept_note_runs,
        "set_span_outputs",
        fake_set_span_outputs,
    )

    response = asyncio.run(
        concept_note_runs.start_concept_note_run(
            payload=SimpleNamespace(),
            context_bundle_service=None,
            authorization="Bearer token",
            session=SimpleNamespace(),
        )
    )

    assert response.status_code == 201
    assert recorded["run"]["run_name"] == "cnb_start"
    assert recorded["run"]["tags"]["interaction"] == "start"
    assert recorded["span"]["name"] == "CNB start"
    assert recorded["logged_tags"] == [
        {
            "concept_note_run_id": str(concept_note_run_id),
            "result": "created",
        }
    ]
    assert recorded["trace_context"]["session_id"] == concept_note_run_id
    assert recorded["span_outputs"] == (
        "start-span",
        {
            "concept_note_run_id": str(concept_note_run_id),
            "result": "created",
        },
    )


def test_cnb_interaction_uses_visible_workflow_tag_on_run_and_trace(
    monkeypatch,
) -> None:
    """CNB interactions should expose one stable workflow tag in MLflow."""
    import asyncio

    recorded: dict[str, object] = {}
    trace_updates: list[dict[str, object]] = []
    span_active = False

    class FakeStreamResult:
        async def stream_events(self):
            yield SimpleNamespace(type="agent_updated_stream_event")

    @contextmanager
    def fake_start_trace_span(**kwargs: object):
        nonlocal span_active
        recorded["span"] = kwargs
        span_active = True
        try:
            yield object()
        finally:
            span_active = False

    def fake_run_streamed(agent: object, runner_input: object, run_config: object):
        recorded["run_config"] = run_config
        return FakeStreamResult()

    def fake_update_current_trace_context(**kwargs: object) -> bool:
        assert span_active is True
        trace_updates.append(kwargs)
        return True

    concept_note_run_id = uuid4()
    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
    )
    handler.workflow_context = ChatWorkflowContext(
        concept_note_run_id=str(concept_note_run_id)
    )
    payload = MessageCreateRequest(user_id="user-1", content="Review this chapter")

    monkeypatch.setattr(
        "app.utils.streaming_handler.start_trace_span",
        fake_start_trace_span,
    )
    monkeypatch.setattr(
        "app.utils.streaming_handler.Runner.run_streamed",
        fake_run_streamed,
    )
    monkeypatch.setattr(
        "app.utils.streaming_handler.update_current_trace_context",
        fake_update_current_trace_context,
    )

    async def collect() -> list[bytes]:
        return [
            chunk
            async for chunk in handler._stream_agent_events(
                object(),
                payload,
                [],
            )
        ]

    chunks = asyncio.run(collect())

    run_tags = handler._mlflow_tags(payload)
    assert chunks == []
    assert run_tags["workflow"] == "CNB"
    assert run_tags["workflow_name"] == "concept_note_context_chat"
    assert run_tags["interaction"] == "chat"
    assert recorded["span"] == {
        "name": "CNB",
        "span_type": "CHAIN",
        "attributes": {
            "workflow": "CNB",
            "workflow_name": "concept_note_context_chat",
            "interaction": "chat",
        },
    }
    assert len(trace_updates) == 1
    assert trace_updates[0]["tags"]["workflow"] == "CNB"
    assert trace_updates[0]["tags"]["workflow_name"] == "concept_note_context_chat"
    assert trace_updates[0]["tags"]["interaction"] == "chat"
    assert recorded["run_config"].trace_metadata["workflow"] == "CNB"
    assert recorded["run_config"].trace_metadata["interaction"] == "chat"
    assert (
        recorded["run_config"].trace_metadata["workflow_name"]
        == "concept_note_context_chat"
    )


def test_streaming_handler_wraps_stream_in_mlflow_run(monkeypatch) -> None:
    """Streaming should create one MLflow run before yielding events."""
    recorded: dict[str, object] = {}

    def fake_start_run(**kwargs):
        recorded.update(kwargs)
        return nullcontext()

    async def fake_stream_response_with_mlflow(**kwargs):
        yield b'event: done\ndata: {"ok": true}\n\n'

    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
    )
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "Clima")
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

    assert chunks == [b'event: done\ndata: {"ok": true}\n\n']
    assert recorded["experiment_name"] == "Clima"
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
        yield b'event: done\ndata: {"ok": true}\n\n'

    async def fake_load_thread_workflow_context() -> ChatWorkflowContext:
        return ChatWorkflowContext(stationary_energy_draft_run_id=str(draft_run_id))

    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
    )
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "Clima")
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
        "_load_thread_workflow_context",
        fake_load_thread_workflow_context,
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

    assert chunks == [b'event: done\ndata: {"ok": true}\n\n']
    assert recorded["experiment_name"] == "Clima"
    assert recorded["run_name"] == "stationary_energy_context_chat_request"
    assert recorded["tags"]["workflow"] == "stationary_energy_context_chat"
    assert recorded["tags"]["stationary_energy_draft_run_id"] == str(draft_run_id)


def test_streaming_handler_assigns_mlflow_trace_session(monkeypatch) -> None:
    """Each streamed model turn should attach its trace to the CA thread session."""
    import asyncio

    recorded: dict[str, object] = {}
    trace_updates: list[dict[str, object]] = []
    thread_id = uuid4()
    draft_run_id = uuid4()

    class FakeStreamResult:
        async def stream_events(self):
            yield SimpleNamespace(type="agent_updated_stream_event")

    def fake_run_streamed(agent: object, runner_input: object, run_config: object):
        recorded["runner_input"] = runner_input
        recorded["run_config"] = run_config
        return FakeStreamResult()

    def fake_update_current_trace_context(**kwargs: object) -> bool:
        trace_updates.append(kwargs)
        return True

    handler = StreamingHandler(
        thread_id=thread_id,
        user_id="user-1",
        session_factory=None,
        inventory_id="inventory-1",
    )
    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=str(draft_run_id)
    )
    monkeypatch.setattr(
        "app.utils.streaming_handler.Runner.run_streamed",
        fake_run_streamed,
    )
    monkeypatch.setattr(
        "app.utils.streaming_handler.update_current_trace_context",
        fake_update_current_trace_context,
    )

    payload = MessageCreateRequest(
        user_id="user-1",
        content="Which rows are gaps?",
        inventory_id="inventory-1",
    )

    async def collect() -> list[bytes]:
        return [
            chunk
            async for chunk in handler._stream_agent_events(
                object(),
                payload,
                [],
            )
        ]

    chunks = asyncio.run(collect())

    assert chunks == []
    assert recorded["runner_input"] == "Which rows are gaps?"
    assert recorded["run_config"].group_id == str(thread_id)
    assert recorded["run_config"].trace_metadata["thread_id"] == str(thread_id)
    assert (
        recorded["run_config"].trace_metadata["prompt_name"]
        == "stationary_energy_review"
    )
    assert len(trace_updates) == 1
    assert trace_updates[0]["session_id"] == str(thread_id)
    assert trace_updates[0]["user_id"] == "user-1"
    assert trace_updates[0]["client_request_id"]
    assert (
        trace_updates[0]["metadata"]["request_id"]
        == trace_updates[0]["client_request_id"]
    )
    assert trace_updates[0]["tags"] == {
        "workflow": "stationary_energy_context_chat",
        "interaction": "chat",
        "trace_category": "ca_agentic_context_chat",
        "ca_agentic_flow": True,
        "context_mode": "stationary_energy_draft",
        "prompt_name": "stationary_energy_review",
        "thread_id": str(thread_id),
        "inventory_id": "inventory-1",
        "stationary_energy_draft_run_id": str(draft_run_id),
    }
    assert trace_updates[0]["metadata"] == {
        "service": "climate-advisor",
        "workflow": "stationary_energy_context_chat",
        "interaction": "chat",
        "trace_category": "ca_agentic_context_chat",
        "context_mode": "stationary_energy_draft",
        "prompt_name": "stationary_energy_review",
        "request_id": trace_updates[0]["client_request_id"],
        "thread_id": str(thread_id),
        "inventory_id": "inventory-1",
        "feature_flag": "STATIONARY_ENERGY_AGENTIC",
        "stationary_energy_draft_run_id": str(draft_run_id),
    }
