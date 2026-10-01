"""Workflow tags and Concept Note interaction telemetry."""

from __future__ import annotations

from contextlib import contextmanager, nullcontext
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.routes import concept_note_runs
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.cnb_observability import CNBInteraction
from app.utils.conversation_observability import conversation_trace
from app.utils.streaming_handler import (
    StreamingHandler,
    climate_advisor_experiment_name,
)
from app.utils.streaming_runner import stream_agent_events
from app.utils.streaming_telemetry import mlflow_tags


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

    assert climate_advisor_experiment_name() == "Clima"
    assert mlflow_tags(handler, general_payload)["prompt_name"] == "chat"
    handler.workflow_context = ChatWorkflowContext(
        stationary_energy_draft_run_id=str(uuid4())
    )
    assert mlflow_tags(handler, agentic_payload)["ca_agentic_flow"] is True
    assert (
        mlflow_tags(handler, agentic_payload)["workflow"]
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
    assert "session_id" not in recorded["trace_context"]
    assert recorded["trace_context"]["metadata"]["concept_note_run_id"] == str(
        concept_note_run_id
    )
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
        "app.utils.conversation_observability.start_trace_span",
        fake_start_trace_span,
    )
    monkeypatch.setattr(
        "app.utils.streaming_runner.Runner.run_streamed",
        fake_run_streamed,
    )
    monkeypatch.setattr(
        "app.utils.streaming_telemetry.update_current_trace_context",
        fake_update_current_trace_context,
    )

    async def collect() -> list[bytes]:
        with conversation_trace(
            payload.content, attributes=handler.workflow_context.telemetry()
        ):
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

    run_tags = mlflow_tags(handler, payload)
    assert chunks == []
    assert run_tags["workflow"] == "CNB"
    assert run_tags["workflow_name"] == "concept_note_context_chat"
    assert run_tags["interaction"] == "chat"
    assert recorded["span"]["name"] == "Climate Advisor Turn"
    assert recorded["span"]["inputs"]["user_message"] == payload.content
    assert recorded["span"]["attributes"]["workflow"] == "CNB"
    assert (
        recorded["span"]["attributes"]["workflow_name"] == "concept_note_context_chat"
    )
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
