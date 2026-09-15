"""Read back real local MLflow exports; provider responses never leave the test."""

from __future__ import annotations

import asyncio
import json
from contextvars import Context, ContextVar
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import mlflow
import pytest
from agents import FunctionTool
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.utils import mlflow_logging
from app.utils.conversation_observability import (
    conversation_trace,
    finish_conversation_trace,
    finish_workflow_trace,
    traced_conversation_tool,
    workflow_trace,
)
from app.utils.streaming_handler import StreamingHandler
from openai import AsyncOpenAI


@pytest.fixture
def tracking(tmp_path, monkeypatch):
    """Use SQLite and local artifacts, including the real OpenAI autolog hook."""
    previous_uri = mlflow.get_tracking_uri()
    uri = "sqlite:///" + (tmp_path / "tracking.db").as_posix()
    monkeypatch.setenv("MLFLOW_TRACKING_URI", uri)
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "chat-export-test")
    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_ASYNC_LOGGING_ENABLED", "false")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", False)
    monkeypatch.setattr(mlflow_logging, "_EXPERIMENT_IDS", {})
    monkeypatch.setattr(mlflow_logging, "_LAST_INITIALIZATION_FAILURE_AT", None)
    monkeypatch.setattr(
        mlflow_logging, "_RUN_CONTEXT", ContextVar("test_run", default=None)
    )
    mlflow.set_tracking_uri(uri)
    client = mlflow.tracking.MlflowClient()
    experiment = client.create_experiment(
        "chat-export-test", artifact_location=tmp_path.as_uri()
    )
    mlflow.tracing.reset()
    assert mlflow_logging.initialize_mlflow()
    try:
        yield client, experiment
    finally:
        mlflow.flush_trace_async_logging()
        mlflow.openai.autolog(disable=True)
        mlflow.tracing.reset()
        mlflow.set_tracking_uri(previous_uri)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["general", "cnb", "stationary_energy"])
@pytest.mark.parametrize("cancelled", [False, True])
async def test_all_chat_modes_export_complete_or_partial_turns(
    tracking, monkeypatch, mode, cancelled
):
    """Exercise the production handler and real SDK streaming/autologging together."""
    client, experiment = tracking
    sent_requests = []
    thread_id = uuid4()
    workflow_id = str(uuid4())
    context = (
        {}
        if mode == "general"
        else {
            "concept_note_run_id"
            if mode == "cnb"
            else "stationary_energy_draft_run_id": workflow_id
        }
    )

    async def provider(request: httpx.Request) -> httpx.Response:
        sent_requests.append(json.loads(request.content))
        events = []
        for index, text in enumerate(["The answer", " is ready.", None]):
            events.append(
                "data: "
                + json.dumps(
                    {
                        "id": "completion-test",
                        "object": "chat.completion.chunk",
                        "created": 1,
                        "model": "test-model",
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": text} if text else {},
                                "finish_reason": "stop" if text is None else None,
                            }
                        ],
                    }
                )
                + "\n\n"
            )
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content="".join(events) + "data: [DONE]\n\n",
        )

    def local_client(self):
        self._chat_base_url = "https://provider.invalid/v1"
        return AsyncOpenAI(
            api_key="test-key",
            base_url="https://provider.invalid/v1",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider)),
        )

    monkeypatch.setattr(AgentService, "_create_openrouter_client", local_client)
    monkeypatch.setattr(
        StreamingHandler, "_load_conversation_history", AsyncMock(return_value=[])
    )

    async def persist(self):
        # Persistence must occur while the root still exists; its outcome goes on the root.
        assert mlflow.get_current_active_span().name == "Climate Advisor Turn"
        self.history_saved = True
        return True

    monkeypatch.setattr(StreamingHandler, "persist_message", persist)
    original_process = StreamingHandler._process_chunk

    async def process(self, chunk):
        async for event in original_process(self, chunk):
            yield event
        if cancelled and self.assistant_tokens:
            raise asyncio.CancelledError()

    monkeypatch.setattr(StreamingHandler, "_process_chunk", process)
    for turn in range(2):
        handler = StreamingHandler(
            thread_id=thread_id, user_id="user-1", session_factory=None
        )
        payload = MessageCreateRequest(
            user_id="user-1", content=f"Question {turn}", context=context
        )
        if cancelled:
            with pytest.raises(asyncio.CancelledError):
                [event async for event in handler.stream_response(payload)]
        else:
            events = [event async for event in handler.stream_response(payload)]
            assert b'"history_saved":true' in b"".join(events).replace(b" ", b"")

    mlflow.flush_trace_async_logging()
    traces = client.search_traces(experiment_ids=[experiment])
    assert len(traces) == 2
    for trace in traces:
        root = next(span for span in trace.data.spans if span.parent_id is None)
        assert root.name == "Climate Advisor Turn"
        assert root.inputs["user_message"].startswith("Question ")
        assert root.outputs == {
            "role": "assistant",
            "content": "The answer" if cancelled else "The answer is ready.",
        }
        assert root.attributes["history_saved"] is not cancelled
        assert root.attributes["stream_status"] == ("cancelled" if cancelled else "ok")
        assert trace.info.trace_metadata["mlflow.trace.session"] == str(thread_id)
        if mode != "general":
            assert trace.info.trace_metadata[next(iter(context))] == workflow_id
        models = [span for span in trace.data.spans if span.span_type == "CHAT_MODEL"]
        assert models
        assert root.inputs["system_prompts"]
        for model in models:
            assert not any(
                event.name.startswith("mlflow.chunk.item.") for event in model.events
            )
            assert model.attributes["system_prompt_root_span_id"] == root.span_id
        run_id = trace.info.trace_metadata["mlflow.sourceRun"]
        artifacts = {item.path for item in client.list_artifacts(run_id, "chat")}
        assert "chat/assistant_response.txt" in artifacts
        assert "chat/conversation_history.json" in artifacts
    # Compaction is a logging-only transformation; the provider still gets full prompts.
    assert all(
        "System prompt reference:" not in json.dumps(request)
        for request in sent_requests
    )


@pytest.mark.asyncio
async def test_parallel_tools_and_detached_work_keep_session_and_run_identity(tracking):
    """Nested workflow runs must not steal the chat trace; detached jobs outlive it."""
    client, experiment = tracking
    ready = asyncio.Event()
    release = asyncio.Event()
    captured = {}

    async def tool(context, arguments):
        with (
            mlflow_logging.start_run(
                run_name="nested-operation",
                experiment_name="chat-export-test",
                nested=True,
            ),
            workflow_trace(
                name="cnb_chat_edit",
                inputs={"instruction": "Rewrite chapter"},
                session_id="chat-1",
                user_id="user-1",
                attributes={"workflow": "CNB"},
            ) as span,
        ):
            finish_workflow_trace(span, {"replacement": "Revised chapter"})
        return {"ok": True, "text": "Revised chapter", "access_token": "secret-value"}

    wrapped = traced_conversation_tool(
        FunctionTool(
            name="edit",
            description="Edit",
            params_json_schema={"type": "object", "properties": {}},
            on_invoke_tool=tool,
        )
    )

    async def background():
        with workflow_trace(
            name="stationary_energy_draft_generation",
            inputs={"rows": [1]},
            session_id="chat-1",
            user_id="user-1",
            attributes={
                "workflow": "stationary_energy",
                "stationary_energy_draft_run_id": "draft-1",
            },
        ) as span:
            captured["background"] = span.trace_id
            ready.set()
            await release.wait()
            finish_workflow_trace(span, {"status": "ready"})

    with mlflow_logging.start_run(
        run_name="chat", experiment_name="chat-export-test"
    ) as run:
        with conversation_trace("Edit the chapter"):
            mlflow_logging.update_current_trace_context(session_id="chat-1")
            captured["chat"] = mlflow.get_current_active_span().trace_id
            results = await asyncio.gather(
                *[
                    wrapped.on_invoke_tool(
                        SimpleNamespace(tool_call_id=f"call-{i}"), "{}"
                    )
                    for i in range(2)
                ]
            )
            assert all(result["access_token"] == "secret-value" for result in results)
            task = asyncio.create_task(background(), context=Context())
            await ready.wait()
            finish_conversation_trace("Done", status="ok", history_saved=True, chunks=1)
    release.set()
    await task
    mlflow.flush_trace_async_logging()
    chat = client.get_trace(captured["chat"])
    job = client.get_trace(captured["background"])
    assert chat.info.trace_metadata["mlflow.sourceRun"] == run.info.run_id
    assert job.info.trace_metadata["mlflow.sourceRun"] != run.info.run_id
    assert job.info.trace_metadata["mlflow.trace.session"] == "chat-1"
    assert {
        span.attributes["tool_call_id"]
        for span in chat.data.spans
        if span.span_type == "TOOL"
    } == {"call-0", "call-1"}
    assert "secret-value" not in chat.to_json()
    assert "Revised chapter" in chat.to_json()
    assert (
        client.get_run(job.info.trace_metadata["mlflow.sourceRun"]).info.status
        == "FINISHED"
    )


def test_workflow_compacts_responses_prompts_and_records_handled_failure(tracking):
    """Funding research uses Responses instructions, rather than chat messages."""
    client, _ = tracking
    provider_input = {
        "instructions": "Read the application requirements.",
        "input": "Find eligible funds",
    }
    with workflow_trace(
        name="cnb_funding_opportunity_research",
        inputs={"program": "Example"},
        session_id="research-1",
        user_id="user-1",
        attributes={"workflow": "CNB"},
    ) as root:
        trace_id = root.trace_id
        for _ in range(2):
            with mlflow.start_span(name="Responses", span_type="CHAT_MODEL") as model:
                model.set_inputs(provider_input)
                model.set_outputs(
                    {"answer": "Application requirement", "api_key": "secret-value"}
                )
        finish_workflow_trace(
            root, {"completed": False, "reason": "source_unavailable"}, ok=False
        )
    mlflow.flush_trace_async_logging()
    trace = client.get_trace(trace_id)
    root = next(span for span in trace.data.spans if span.parent_id is None)
    assert len(root.inputs["system_prompts"]) == 1
    assert root.inputs["program"] == "Example"
    assert root.status.status_code.value == "ERROR"
    assert root.outputs["reason"] == "source_unavailable"
    for model in [span for span in trace.data.spans if span.span_type == "CHAT_MODEL"]:
        assert model.inputs["instructions"].startswith("[System prompt reference:")
        assert model.outputs["answer"] == "Application requirement"
        assert model.outputs["api_key"] == "[REDACTED]"
    assert provider_input["instructions"] == "Read the application requirements."
