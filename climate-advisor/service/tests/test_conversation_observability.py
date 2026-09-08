"""Exercise ordinary CA compaction with real MLflow and mocked provider streams."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import mlflow
import pytest
from agents import (
    Agent,
    FunctionTool,
    ModelSettings,
    OpenAIChatCompletionsModel,
    RunConfig,
)
from app.models.requests import MessageCreateRequest
from app.utils import mlflow_logging
from app.utils.conversation_observability import (
    conversation_tool_artifact,
    conversation_trace,
    finish_conversation_trace,
    traced_conversation_tool,
)
from app.utils.streaming_handler import StreamingHandler
from mlflow.entities import SpanEvent
from openai import AsyncOpenAI


@pytest.fixture
def local_mlflow(tmp_path, monkeypatch):
    """Use a temporary local store: neither provider nor telemetry goes online."""
    old_uri = mlflow.get_tracking_uri()
    mlflow.set_tracking_uri(tmp_path.as_uri())
    mlflow.set_experiment("ca-cleanup-test")
    monkeypatch.setattr(mlflow_logging, "_INITIALIZED", True)
    monkeypatch.setattr(mlflow_logging, "mlflow", mlflow)
    mlflow.openai.autolog()
    yield
    mlflow.flush_trace_async_logging()
    mlflow.openai.autolog(disable=True)
    mlflow.set_tracking_uri(old_uri)


def exported_trace(trace_id):
    """Read the serialized trace back through MLflow, not just the live span."""
    mlflow.flush_trace_async_logging()
    return mlflow.get_trace(trace_id)


def test_real_stream_keeps_full_response_prompt_reference_and_tool_output(local_mlflow):
    sent_requests = []

    def respond(request):
        payload = json.loads(request.content)
        sent_requests.append(payload)
        chunks = []
        for index in range(200):
            chunks.append(
                "data: "
                + json.dumps(
                    {
                        "id": "chatcmpl-test",
                        "created": 1,
                        "model": "test-model",
                        "object": "chat.completion.chunk",
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": "x"},
                                "finish_reason": None,
                            }
                        ],
                    }
                )
                + "\n\n"
            )
        chunks.append("data: [DONE]\n\n")
        return httpx.Response(
            200, text="".join(chunks), headers={"content-type": "text/event-stream"}
        )

    async def tool_call(context, arguments):
        assert arguments == '{"city":"Sample"}'
        return json.dumps({"records": [1, 2], "access_token": "private"})

    original_tool = FunctionTool(
        name="read_inventory",
        description="Read inventory",
        params_json_schema={"type": "object", "properties": {}},
        on_invoke_tool=tool_call,
    )
    tool = traced_conversation_tool(original_tool)
    prompt = "Unique system instruction for the request"

    async def run():
        async with AsyncOpenAI(
            api_key="test-key",
            base_url="https://provider.invalid/v1",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        ) as client:
            with conversation_trace("Hello"):
                trace_id = mlflow.get_current_active_span().trace_id
                for index in range(2):
                    stream = await client.chat.completions.create(
                        model="test-model",
                        stream=True,
                        messages=[
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": "Hello"},
                        ],
                    )
                    content = "".join(
                        [c.choices[0].delta.content or "" async for c in stream]
                    )
                    await tool.on_invoke_tool(
                        SimpleNamespace(tool_call_id=f"call-{index}"),
                        '{"city":"Sample"}',
                    )
                finish_conversation_trace(
                    content, status="ok", history_saved=True, chunks=200
                )
            return trace_id

    trace = exported_trace(asyncio.run(run()))
    root = next(s for s in trace.data.spans if s.parent_id is None)
    models = [s for s in trace.data.spans if s.span_type == "CHAT_MODEL"]
    tools = [s for s in trace.data.spans if s.span_type == "TOOL"]
    assert root.outputs == {"role": "assistant", "content": "x" * 200}
    assert root.attributes["streamed"] is True
    assert root.attributes["streaming"] is False
    assert len(root.inputs["system_prompts"]) == 1
    assert next(iter(root.inputs["system_prompts"].values()))["content"] == prompt
    assert len(models) == 2
    for model in models:
        assert model.outputs["choices"][0]["message"]["content"] == "x" * 200
        assert model.events == []
        assert model.attributes["stream_chunks_omitted"] is True
        assert model.attributes["system_prompt_root_span_id"] == root.span_id
        assert prompt not in json.dumps(model.inputs)
        assert "System prompt reference" in model.inputs["messages"][0]["content"]
    assert len(tools) == 2
    assert {s.attributes["tool_call_id"] for s in tools} == {"call-0", "call-1"}
    assert all(s.inputs == {"city": "Sample"} for s in tools)
    assert all(
        s.outputs == {"records": [1, 2], "access_token": "[REDACTED]"} for s in tools
    )
    assert all(s.parent_id == root.span_id for s in tools)
    assert original_tool.on_invoke_tool is tool_call
    assert all(r["messages"][0]["content"] == prompt for r in sent_requests)


def test_scope_and_prompt_variants_are_isolated_between_async_requests(local_mlflow):
    async def run(content):
        with conversation_trace(content):
            trace_id = mlflow.get_current_active_span().trace_id
            for suffix in ["first", "changed"]:
                await asyncio.sleep(0)
                with mlflow.start_span(name="model", span_type="CHAT_MODEL") as span:
                    span.set_inputs(
                        {"messages": [{"role": "system", "content": content + suffix}]}
                    )
                    span.add_event(SpanEvent(name="mlflow.chunk.item.0"))
                    span.add_event(SpanEvent(name="diagnostic"))
            finish_conversation_trace(
                content, status="ok", history_saved=True, chunks=1
            )
        return trace_id

    async def run_all():
        return await asyncio.gather(run("request A"), run("request B"))

    for trace_id, content in zip(asyncio.run(run_all()), ["request A", "request B"]):
        trace = exported_trace(trace_id)
        root = next(s for s in trace.data.spans if s.parent_id is None)
        assert {p["content"] for p in root.inputs["system_prompts"].values()} == {
            content + "first",
            content + "changed",
        }
        assert all(
            [e.name for e in s.events] == ["diagnostic"]
            for s in trace.data.spans
            if s.span_type == "CHAT_MODEL"
        )

    # CNB/agentic and unrelated traces never enter the ordinary-CA context.
    with mlflow.start_span(name="CNB", span_type="CHAIN") as root:
        trace_id = root.trace_id
        with mlflow.start_span(name="model", span_type="CHAT_MODEL") as span:
            span.set_inputs({"messages": [{"role": "system", "content": "CNB prompt"}]})
            span.add_event(SpanEvent(name="mlflow.chunk.item.0"))
    model = next(
        s for s in exported_trace(trace_id).data.spans if s.span_type == "CHAT_MODEL"
    )
    assert model.inputs["messages"][0]["content"] == "CNB prompt"
    assert len(model.events) == 1


def test_cancellation_retains_partial_response_and_tool_failure(local_mlflow):
    async def fail(context, arguments):
        raise ValueError("Tool failure")

    tool = traced_conversation_tool(
        FunctionTool(
            name="failing_tool",
            description="Fail",
            params_json_schema={},
            on_invoke_tool=fail,
        )
    )

    async def run():
        with pytest.raises(asyncio.CancelledError), conversation_trace("Hello"):
            trace_id = mlflow.get_current_active_span().trace_id
            with pytest.raises(ValueError):
                await tool.on_invoke_tool(
                    SimpleNamespace(tool_call_id="failed-call"), "{}"
                )
            # Reproduce autolog leaving a no-context model span open on disconnect.
            pending = mlflow.start_span_no_context(
                name="interrupted-model", span_type="CHAT_MODEL"
            )
            pending.set_inputs(
                {"stream": True, "messages": [{"role": "system", "content": "Prompt"}]}
            )
            pending.add_event(SpanEvent(name="mlflow.chunk.item.0"))
            finish_conversation_trace(
                "Partial response", status="cancelled", history_saved=False, chunks=3
            )
            raise asyncio.CancelledError()
        return trace_id

    trace = exported_trace(asyncio.run(run()))
    root = next(s for s in trace.data.spans if s.parent_id is None)
    tool_span = next(s for s in trace.data.spans if s.span_type == "TOOL")
    assert root.outputs["content"] == "Partial response"
    assert root.attributes["stream_status"] == "cancelled"
    assert root.attributes["history_saved"] is False
    assert str(root.status.status_code) == "SpanStatusCode.ERROR"
    assert str(tool_span.status.status_code) == "SpanStatusCode.ERROR"
    assert any(e.name == "exception" for e in tool_span.events)
    model = next(s for s in trace.data.spans if s.span_type == "CHAT_MODEL")
    assert model.end_time_ns is not None
    assert model.events == []
    assert model.attributes["stream_status"] == "interrupted"
    assert model.attributes["partial_response_root_span_id"] == root.span_id
    assert str(model.status.status_code) == "SpanStatusCode.ERROR"


def test_tool_artifact_projection_keeps_one_result_without_changing_runtime_data():
    invocation = {
        "name": "lookup",
        "result": '{"items":[1]}',
        "result_json": {"items": [1]},
    }
    assert conversation_tool_artifact([invocation]) == {
        "tool_invocations": [{"name": "lookup", "result": {"items": [1]}}]
    }
    assert "result_json" in invocation


def test_repeated_tool_calls_match_out_of_order_results_by_call_id():
    handler = StreamingHandler(
        thread_id=uuid4(), user_id="test-user", session_factory=None
    )

    async def run():
        for call_id in ["first", "second"]:
            item = SimpleNamespace(
                raw_item=SimpleNamespace(name="lookup", call_id=call_id, arguments="{}")
            )
            assert [e async for e in handler._handle_tool_called(item)]
        for call_id in ["second", "first"]:
            item = SimpleNamespace(
                raw_item={"call_id": call_id}, output=json.dumps({"value": call_id})
            )
            assert [e async for e in handler._handle_tool_output(item)]

    asyncio.run(run())
    calls = conversation_tool_artifact(handler.tool_invocations)["tool_invocations"]
    assert len(calls) == 2
    assert {c["id"]: c["result"] for c in calls} == {
        "first": {"value": "first"},
        "second": {"value": "second"},
    }


def test_handler_runs_real_sdk_tool_round_trip_and_exports_one_response(
    local_mlflow, monkeypatch
):
    """Verify SDK tool execution, SSE, persistence boundary and artifact readback together."""
    requests = []

    def respond(request):
        requests.append(json.loads(request.content))
        if len(requests) == 1:
            delta = {
                "role": "assistant",
                "tool_calls": [
                    {
                        "index": 0,
                        "id": "call_inventory",
                        "type": "function",
                        "function": {
                            "name": "inventory",
                            "arguments": '{"city":"Sample"}',
                        },
                    }
                ],
            }
            finish = "tool_calls"
        else:
            delta = {
                "role": "assistant",
                "content": "The inventory contains two records.",
            }
            finish = "stop"
        chunks = []
        for item, reason in [(delta, None), ({}, finish)]:
            chunks.append(
                "data: "
                + json.dumps(
                    {
                        "id": f"chat-{len(requests)}",
                        "created": 1,
                        "model": "test-model",
                        "object": "chat.completion.chunk",
                        "choices": [
                            {"index": 0, "delta": item, "finish_reason": reason}
                        ],
                    }
                )
                + "\n\n"
            )
        return httpx.Response(
            200,
            text="".join(chunks) + "data: [DONE]\n\n",
            headers={"content-type": "text/event-stream"},
        )

    calls = []

    async def inventory(context, arguments):
        calls.append(json.loads(arguments))
        return '{"records":[1,2]}'

    tool = traced_conversation_tool(
        FunctionTool(
            name="inventory",
            description="Read inventory",
            params_json_schema={
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
                "additionalProperties": False,
            },
            on_invoke_tool=inventory,
        )
    )
    monkeypatch.setenv("MLFLOW_ENABLED", "true")
    monkeypatch.setenv("MLFLOW_EXPERIMENT_NAME", "ca-cleanup-test")

    async def run():
        async with AsyncOpenAI(
            api_key="test-key",
            base_url="https://provider.invalid/v1",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        ) as client:
            agent = Agent(
                name="CA",
                instructions="Read the requested inventory.",
                model=OpenAIChatCompletionsModel(
                    model="test-model", openai_client=client
                ),
                model_settings=ModelSettings(include_usage=True),
                tools=[tool],
            )
            service = SimpleNamespace(
                create_agent=AsyncMock(return_value=agent),
                preferred_model_for_context=lambda **kwargs: "test-model",
                close=AsyncMock(),
                current_cc_token=lambda: None,
            )
            monkeypatch.setattr(
                "app.utils.streaming_handler.AgentService", lambda **kwargs: service
            )
            monkeypatch.setattr(
                "app.utils.streaming_handler.persist_assistant_message",
                AsyncMock(return_value=True),
            )
            handler = StreamingHandler(
                thread_id=uuid4(), user_id="test-user", session_factory=None
            )
            monkeypatch.setattr(
                handler, "_load_conversation_history", AsyncMock(return_value=[])
            )
            monkeypatch.setattr(
                handler, "_run_config", lambda payload: RunConfig(tracing_disabled=True)
            )
            events = [
                e
                async for e in handler.stream_response(
                    MessageCreateRequest(user_id="test-user", content="Read inventory")
                )
            ]
            return events, mlflow.get_last_active_trace_id()

    events, trace_id = asyncio.run(run())
    assert calls == [{"city": "Sample"}]
    assert b'"ok": true' in events[-1]
    trace = exported_trace(trace_id)
    root = next(s for s in trace.data.spans if s.parent_id is None)
    assert root.outputs["content"] == "The inventory contains two records."
    assert root.attributes["history_saved"] is True
    assert len(root.inputs["system_prompts"]) == 1
    tool_span = next(s for s in trace.data.spans if s.span_type == "TOOL")
    assert tool_span.name == "inventory"
    assert tool_span.inputs == {"city": "Sample"}
    assert tool_span.outputs == {"records": [1, 2]}
    assert not any(
        e.name.startswith("mlflow.chunk.item.")
        for s in trace.data.spans
        for e in s.events
    )
    assert requests[0]["messages"][0] == requests[1]["messages"][0]
    run_id = trace.info.trace_metadata["mlflow.sourceRun"]
    artifact_path = mlflow.MlflowClient().download_artifacts(
        run_id, "chat/tool_invocations.json"
    )
    artifact = json.loads(Path(artifact_path).read_text())
    assert artifact["tool_invocations"][0]["result"] == {"records": [1, 2]}
    assert "result_json" not in artifact["tool_invocations"][0]
