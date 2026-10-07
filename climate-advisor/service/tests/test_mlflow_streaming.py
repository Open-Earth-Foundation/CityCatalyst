"""Stream request runs and trace session identity."""

from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.streaming_handler import (
    StreamingHandler,
)
from app.utils.streaming_runner import stream_agent_events


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
        "app.utils.streaming_handler.async_start_run",
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

    async def fake_load_thread_workflow_context(
        _handler: StreamingHandler,
    ) -> ChatWorkflowContext:
        return ChatWorkflowContext(stationary_energy_draft_run_id=str(draft_run_id))

    handler = StreamingHandler(
        thread_id=uuid4(),
        user_id="user-1",
        session_factory=None,
    )
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "Clima")
    monkeypatch.setattr(
        "app.utils.streaming_handler.async_start_run",
        fake_start_run,
    )
    monkeypatch.setattr(
        handler,
        "_stream_response_with_mlflow",
        fake_stream_response_with_mlflow,
    )
    monkeypatch.setattr(
        "app.utils.streaming_context.load_thread_workflow_context",
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
        "app.utils.streaming_runner.Runner.run_streamed",
        fake_run_streamed,
    )
    monkeypatch.setattr(
        "app.utils.streaming_telemetry.update_current_trace_context",
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
            async for chunk in stream_agent_events(
                handler,
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
