"""Compact ordinary CA traces without changing model inputs or scoped workflows."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field, replace
from hashlib import sha256
from typing import Any

from agents import FunctionTool
from app.utils.mlflow_logging import (
    redact_payload,
    set_span_outputs,
    start_trace_span,
)
from mlflow.entities import LiveSpan
from mlflow.tracing import configure
from mlflow.tracing.config import get_config
from mlflow.tracing.trace_manager import InMemoryTraceManager
from opentelemetry.sdk.util import BoundedList

logger = logging.getLogger(__name__)


@dataclass
class _ConversationTrace:
    """Hold prompt snapshots on one request root, shared by its async children."""

    root: LiveSpan
    content: str
    prompts: dict[str, dict[str, Any]] = field(default_factory=dict)
    closed: bool = False


_CONVERSATION_TRACE: ContextVar[_ConversationTrace | None] = ContextVar(
    "ca_conversation_trace", default=None
)


@contextmanager
def conversation_trace(content: str) -> Iterator[None]:
    """Keep an ordinary CA root alive through streaming and message persistence."""
    # The global hook is inert outside this request's context and trace ID.
    try:
        processors = get_config().span_processors
        if process_conversation_span not in processors:
            configure(span_processors=[*processors, process_conversation_span])
    except Exception:
        logger.warning("Could not configure ordinary CA telemetry", exc_info=True)
        yield
        return

    with start_trace_span(
        name="Climate Advisor Turn",
        span_type="CHAIN",
        inputs={"user_message": content, "system_prompts": {}},
        attributes={
            "workflow": "climate_advisor_conversation",
            "interaction": "chat",
            "streaming": True,
            "stream_status": "in_progress",
        },
    ) as root:
        if root is None:
            yield
            return
        state = _ConversationTrace(root=root, content=content)
        token = _CONVERSATION_TRACE.set(state)
        try:
            yield
        finally:
            # Autolog's async-stream hook does not end a model span on disconnect.
            # Finalize those spans before exporting the root, keeping partial text
            # on the root rather than inventing a complete model response.
            try:
                with InMemoryTraceManager.get_instance().get_trace(
                    root.trace_id
                ) as trace:
                    pending = (
                        [
                            span
                            for span in trace.span_dict.values()
                            if span.span_type == "CHAT_MODEL"
                            and span.end_time_ns is None
                        ]
                        if trace
                        else []
                    )
                for span in pending:
                    span.set_attributes(
                        {
                            "stream_status": "interrupted",
                            "partial_response_root_span_id": root.span_id,
                        }
                    )
                    span.end(status="ERROR")
            except Exception:
                logger.warning(
                    "Could not close interrupted model telemetry", exc_info=True
                )
            # Detached work must not mutate a completed request's prompt library.
            state.closed = True
            _CONVERSATION_TRACE.reset(token)


def finish_conversation_trace(
    content: str, *, status: str, history_saved: bool, chunks: int
) -> None:
    """Store the assembled response, including partial text on cancellation."""
    state = _CONVERSATION_TRACE.get()
    if state is None or state.closed:
        return
    try:
        set_span_outputs(state.root, {"role": "assistant", "content": content})
        state.root.set_attributes(
            {
                "stream_status": status,
                "streamed": True,
                "streaming": False,
                "response_chunk_count": chunks,
                "history_saved": history_saved,
            }
        )
        if status != "ok":
            state.root.set_status("ERROR")
    except Exception:
        logger.warning("Could not finalize ordinary CA trace", exc_info=True)


def process_conversation_span(span: LiveSpan) -> None:
    """Compact model telemetry before export, only inside an ordinary CA trace.

    MLflow 3.2 has no public event-removal API. The one OpenTelemetry event-buffer
    assignment below is covered by a real SDK export test; non-chunk events survive.
    Full tool data is captured independently by traced_conversation_tool.
    """
    state = _CONVERSATION_TRACE.get()
    if (
        state is None
        or state.closed
        or span.trace_id != state.root.trace_id
        or span.span_type != "CHAT_MODEL"
    ):
        return

    # Edit decoded logging copies, never the arguments sent to the provider.
    inputs = redact_payload(span.inputs)
    if isinstance(inputs, (dict, list)):
        # SDK generation spans use a message list; OpenAI autolog uses a dict.
        messages = (
            (inputs.get("messages") or []) if isinstance(inputs, dict) else inputs
        )
        for message in messages:
            if not isinstance(message, dict) or message.get("role") not in {
                "system",
                "developer",
            }:
                continue
            fingerprint = sha256(
                json.dumps(message, sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest()
            state.prompts.setdefault(fingerprint, dict(message))
            message["content"] = (
                f"[System prompt reference: {fingerprint}. "
                f"Open root span {state.root.span_id} > Inputs > system_prompts.]"
            )
        state.root.set_inputs(
            redact_payload(
                {"user_message": state.content, "system_prompts": state.prompts}
            )
        )
        span.set_inputs(inputs)
        span.set_attribute("system_prompt_root_span_id", state.root.span_id)
        if isinstance(inputs, dict):
            span.set_attribute("streamed", bool(inputs.get("stream")))
    if span.outputs is not None:
        span.set_outputs(redact_payload(span.outputs))

    # Keep final model output and error events; discard only raw streaming chunks.
    events = span._span._events
    retained = [e for e in events if not e.name.startswith("mlflow.chunk.item.")]
    removed = len(events) - len(retained)
    if removed:
        span.set_attribute("stream_chunks_omitted", True)
        span._span._events = BoundedList.from_seq(None, retained)


def traced_conversation_tool(tool: FunctionTool) -> FunctionTool:
    """Copy a request's tool and log full, redacted execution inputs and outputs."""
    original = tool.on_invoke_tool

    async def invoke(context: Any, arguments: str) -> Any:
        """Keep tool execution semantics while recording one TOOL span per call."""
        state = _CONVERSATION_TRACE.get()
        if state is None or state.closed:
            return await original(context, arguments)
        # Parse for readable MLflow input; leave provider arguments unchanged.
        try:
            inputs = json.loads(arguments)
        except (TypeError, ValueError):
            inputs = arguments
        with start_trace_span(
            name=tool.name,
            span_type="TOOL",
            inputs=inputs,
            attributes={"tool_call_id": getattr(context, "tool_call_id", "")},
        ) as span:
            result = await original(context, arguments)
            try:
                output = json.loads(result) if isinstance(result, str) else result
            except ValueError:
                output = result
            set_span_outputs(span, output)
            if (
                span is not None
                and isinstance(output, dict)
                and (
                    output.get("ok") is False
                    or output.get("success") is False
                    or output.get("error")
                )
            ):
                try:
                    span.set_status("ERROR")
                except Exception:
                    logger.warning(
                        "Could not record tool failure status", exc_info=True
                    )
            return result

    # FunctionTool instances can be shared module globals: never mutate them.
    return replace(tool, on_invoke_tool=invoke)


def conversation_tool_artifact(invocations: list[dict]) -> dict[str, object]:
    """Project existing invocation records into one result representation for logs."""
    calls = []
    for invocation in invocations:
        call = dict(invocation)
        if "result_json" in call:
            call["result"] = call.pop("result_json")
        calls.append(call)
    return {"tool_invocations": calls}
