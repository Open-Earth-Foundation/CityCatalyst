from __future__ import annotations

import asyncio
from contextlib import nullcontext
import json
from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest
from app.config.settings import get_settings
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.utils import cnb_observability
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.cnb_observability import (
    CNBInteraction,
    protect_cnb_client,
    record_edit_outcome,
)
from app.utils.streaming_handler import StreamingHandler
from openai import AsyncOpenAI


def test_shared_cc751_vocabulary_distinguishes_questions_from_edits() -> None:
    assert [item.mlflow_run_name for item in CNBInteraction] == [
        "cnb_start",
        "cnb_chat",
        "cnb_missing_information",
        "cnb_chat_edit",
    ]
    context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
    assert (
        context.mlflow_run_name == "cnb_chat"
        and context.telemetry()["workflow"] == "CNB"
    )


def test_edit_telemetry_accepts_only_correlation_and_outcome_metadata(
    monkeypatch,
) -> None:
    start, tags, metrics = Mock(return_value=nullcontext()), Mock(), Mock()
    monkeypatch.setattr(cnb_observability, "start_run", start)
    monkeypatch.setattr(cnb_observability, "log_tags", tags)
    monkeypatch.setattr(cnb_observability, "log_metrics", metrics)
    run_id, proposal_id, revision_id = uuid4(), uuid4(), uuid4()
    record_edit_outcome(
        run_id=run_id,
        proposal_id=proposal_id,
        revision_id=revision_id,
        operation="apply",
        outcome="applied",
        duration_ms=17,
    )
    assert start.call_args.kwargs["run_name"] == "cnb_chat_edit"
    assert tags.call_args.args[0] == {
        "workflow": "CNB",
        "interaction": "chat_edit",
        "concept_note_run_id": str(run_id),
        "proposal_id": str(proposal_id),
        "revision_id": str(revision_id),
        "operation": "apply",
        "outcome": "applied",
    }
    assert metrics.call_args.args[0] == {"duration_ms": 17}
    with pytest.raises(TypeError):
        record_edit_outcome(
            run_id=run_id,
            operation="apply",
            outcome="applied",
            instruction="private text",
        )


def test_disabled_or_failing_telemetry_never_changes_operation_outcome(
    monkeypatch, caplog
) -> None:
    monkeypatch.setattr(
        cnb_observability,
        "start_run",
        Mock(side_effect=RuntimeError("private provider response")),
    )
    record_edit_outcome(
        run_id=uuid4(),
        operation="propose",
        outcome="failed",
        error_code="planner_unavailable",
    )
    assert "private provider response" not in caplog.text
    monkeypatch.setattr(
        cnb_observability, "start_run", Mock(return_value=nullcontext())
    )
    monkeypatch.setattr(
        cnb_observability, "log_tags", Mock(side_effect=RuntimeError("private source"))
    )
    record_edit_outcome(run_id=uuid4(), operation="apply", outcome="applied")
    assert "private source" not in caplog.text


def test_cnb_stream_summary_has_no_instruction_document_source_or_tool_payload(
    monkeypatch,
) -> None:
    json_log, text_log = Mock(), Mock()
    monkeypatch.setattr("app.utils.streaming_handler.log_json_artifact", json_log)
    monkeypatch.setattr("app.utils.streaming_handler.log_text_artifact", text_log)
    handler = StreamingHandler(thread_id=uuid4(), user_id="owner", session_factory=None)
    handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
    handler.assistant_tokens = ["PRIVATE_DOCUMENT_SENTINEL"]
    handler.tool_invocations = [
        {
            "arguments": "PRIVATE_INSTRUCTION_SENTINEL",
            "result": "PRIVATE_SOURCE_SENTINEL",
        }
    ]
    handler._log_mlflow_stream_summary(ok=True, started_at=0)
    assert text_log.call_count == 0
    encoded = str(json_log.call_args_list)
    assert "PRIVATE_" not in encoded
    assert json_log.call_args.args[0] == "response/stream_summary.json"


def test_cnb_sdk_tracing_and_arbitrary_payload_metadata_are_disabled(
    monkeypatch,
) -> None:
    settings = get_settings().model_copy(deep=True)
    settings.langsmith_tracing_enabled = True
    monkeypatch.setattr("app.utils.streaming_handler.get_settings", lambda: settings)
    handler = StreamingHandler(thread_id=uuid4(), user_id="owner", session_factory=None)
    handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))
    payload = MessageCreateRequest(
        user_id="owner",
        content="PRIVATE_INSTRUCTION",
        context={"PRIVATE_KEY": "PRIVATE_SOURCE"},
        options={"model": "PRIVATE_MODEL"},
    )
    config = handler._run_config(payload)
    assert config.tracing_disabled and not config.trace_include_sensitive_data
    assert "PRIVATE_" not in str(handler._mlflow_params(payload))


async def test_cnb_initial_stream_does_not_log_request_payload(monkeypatch) -> None:
    handler = StreamingHandler(thread_id=uuid4(), user_id="owner", session_factory=None)

    async def context(payload):
        handler.workflow_context = ChatWorkflowContext(concept_note_run_id=str(uuid4()))

    async def stream(**kwargs):
        yield b"done"

    log = Mock()
    monkeypatch.setattr(handler, "_resolve_workflow_context", context)
    monkeypatch.setattr(handler, "_stream_response_with_mlflow", stream)
    monkeypatch.setattr(
        "app.utils.streaming_handler.start_run", Mock(return_value=nullcontext())
    )
    monkeypatch.setattr("app.utils.streaming_handler.log_json_artifact", log)
    result = [
        chunk
        async for chunk in handler.stream_response(
            MessageCreateRequest(user_id="owner", content="PRIVATE_DOCUMENT")
        )
    ]
    assert result == [b"done"] and log.call_count == 0


async def test_agent_service_binds_private_client_only_for_cnb(monkeypatch) -> None:
    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "synthetic"
    settings.langsmith_tracing_enabled = False
    monkeypatch.setattr("app.services.agent_service.get_settings", lambda: settings)
    protect = Mock(side_effect=protect_cnb_client)
    monkeypatch.setattr("app.services.agent_service.protect_cnb_client", protect)
    cnb = AgentService(concept_note_run_id=uuid4())
    generic = AgentService()
    try:
        assert protect.call_count == 1
        assert "create" in cnb.client.chat.completions.__dict__
        assert "create" not in generic.client.chat.completions.__dict__
    finally:
        await cnb.close()
        await generic.close()


async def test_actual_mlflow_autolog_excludes_cnb_but_keeps_concurrent_generic_trace(
    tmp_path, monkeypatch
) -> None:
    import mlflow

    old_uri = mlflow.get_tracking_uri()
    monkeypatch.setenv("MLFLOW_ENABLE_ASYNC_TRACE_LOGGING", "false")
    mlflow.set_tracking_uri(f"sqlite:///{(tmp_path / 'privacy.db').as_posix()}")
    experiment_id = mlflow.create_experiment(
        f"cc732-privacy-{uuid4()}", artifact_location=(tmp_path / "artifacts").as_uri()
    )
    experiment = mlflow.set_experiment(experiment_id=experiment_id)

    def respond(request: httpx.Request) -> httpx.Response:
        content = json.loads(request.content)["messages"][0]["content"]
        return httpx.Response(
            200,
            json={
                "id": "synthetic",
                "object": "chat.completion",
                "created": 1,
                "model": "synthetic",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    cnb = AsyncOpenAI(
        api_key="synthetic",
        base_url="https://synthetic.invalid/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )
    generic = AsyncOpenAI(
        api_key="synthetic",
        base_url="https://synthetic.invalid/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )
    try:
        mlflow.openai.autolog()
        protect_cnb_client(cnb)
        with mlflow.start_run():
            await asyncio.gather(
                cnb.chat.completions.create(
                    model="synthetic",
                    messages=[{"role": "user", "content": "CNB_PRIVATE_SENTINEL"}],
                ),
                generic.chat.completions.create(
                    model="synthetic",
                    messages=[{"role": "user", "content": "GENERIC_VISIBLE_SENTINEL"}],
                ),
            )
        mlflow.flush_trace_async_logging()
        traces = mlflow.search_traces(
            experiment_ids=[experiment.experiment_id], return_type="list"
        )
        serialized = str([trace.to_dict() for trace in traces])
        assert len(traces) == 1
        assert "CNB_PRIVATE_SENTINEL" not in serialized
        assert "GENERIC_VISIBLE_SENTINEL" in serialized
    finally:
        await cnb.close()
        await generic.close()
        mlflow.openai.autolog(disable=True)
        mlflow.set_tracking_uri(old_uri)
