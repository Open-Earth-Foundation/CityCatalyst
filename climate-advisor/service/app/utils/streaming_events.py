"""Agents SDK events translated into the chat SSE contract."""

from __future__ import annotations

import json
import logging
from contextlib import suppress
from typing import TYPE_CHECKING, Any, AsyncIterator, Optional
from uuid import uuid4

from app.services.stationary_energy.stationary_energy_tool_events import (
    build_stationary_energy_tool_result_payload,
)
from app.utils.cnb_progress import emit_cnb_reasoning
from app.utils.mlflow_logging import finish_tool_observation, start_tool_observation
from app.utils.sse import format_sse

if TYPE_CHECKING:
    # The orchestrator imports these helpers; avoid a runtime import cycle.
    from app.utils.streaming_handler import StreamingHandler
logger = logging.getLogger(__name__)


async def process_chunk(handler: StreamingHandler, chunk: Any) -> AsyncIterator[bytes]:
    """Process a single chunk from the stream."""
    chunk_type = chunk.type

    if chunk_type == "raw_response_event":
        async for event_bytes in handle_raw_response(handler, chunk):
            yield event_bytes

    elif chunk_type == "run_item_stream_event":
        async for event_bytes in handle_run_item(handler, chunk):
            yield event_bytes

    elif chunk_type == "agent_updated_stream_event":
        logger.info(
            "Agent updated during streaming for thread_id=%s", handler.thread_id
        )

    else:
        logger.debug("Unhandled stream event type: %s", chunk_type)


async def handle_raw_response(
    handler: StreamingHandler, chunk: Any
) -> AsyncIterator[bytes]:
    """Handle raw response events (text deltas, errors, etc)."""
    # Ignore empty SDK event shells; there is nothing to send over SSE.
    response_event = getattr(chunk, "data", None)
    if not response_event:
        return

    response_type = getattr(response_event, "type", "")
    if handler.workflow_context.concept_note_run_id:
        if response_type == "response.created":
            handler.reasoning_stream_id = str(uuid4())
        await emit_cnb_reasoning(
            response_event, stream_id=handler.reasoning_stream_id, stage="chat"
        )

    # Stream text/refusal deltas as message events and preserve token order.
    if response_type in {"response.output_text.delta", "response.refusal.delta"}:
        content = getattr(response_event, "delta", "")
        if content:
            handler.assistant_tokens.append(content)
            yield format_sse(
                {"index": handler.token_index, "content": content},
                event="message",
                id=str(handler.token_index),
            ).encode("utf-8")
            handler.token_index += 1

    # Surface SDK error events to the client and mark the stream as failed.
    elif response_type == "error":
        error_message = getattr(response_event, "message", "Streaming error")
        logger.error("Received error event from Responses API: %s", error_message)
        handler.streaming_error = True
        yield format_sse(
            {"message": error_message},
            event="error",
        ).encode("utf-8")

    elif response_type == "response.completed":
        logger.info(
            "Received response.completed event for thread_id=%s", handler.thread_id
        )

    else:
        logger.debug("Unhandled raw response event type: %s", response_type)


async def handle_run_item(
    handler: StreamingHandler, chunk: Any
) -> AsyncIterator[bytes]:
    """Handle run item stream events (tool calls, tool outputs)."""
    event_name = getattr(chunk, "name", "")
    run_item = getattr(chunk, "item", None)

    if event_name == "tool_called" and run_item is not None:
        async for event_bytes in handle_tool_called(handler, run_item):
            yield event_bytes

    elif event_name == "tool_output" and run_item is not None:
        async for event_bytes in handle_tool_output(handler, run_item):
            yield event_bytes

    else:
        logger.debug("Unhandled run item event: %s", event_name)


async def handle_tool_called(
    handler: StreamingHandler, run_item: Any
) -> AsyncIterator[bytes]:
    """Handle tool called events."""
    raw_item = getattr(run_item, "raw_item", None)
    tool_name = getattr(raw_item, "name", None) or getattr(
        raw_item, "type", "unknown_tool"
    )
    call_id = getattr(raw_item, "call_id", None) or getattr(raw_item, "id", None)

    arguments: Any = getattr(raw_item, "arguments", None)
    if isinstance(arguments, str):
        with suppress(json.JSONDecodeError):
            arguments = json.loads(arguments)

    # Find or create invocation record
    existing = None
    for inv in handler.tool_invocations:
        if (call_id and inv.get("id") == call_id) or (
            inv.get("name") == tool_name and not call_id
        ):
            existing = inv
            break

    if existing is None:
        invocation = {
            "id": call_id,
            "name": tool_name,
            "arguments": arguments,
            "status": "executing",
        }
        handler.tool_invocations.append(invocation)
    else:
        invocation = existing
        invocation["arguments"] = invocation.get("arguments") or arguments
        invocation["status"] = "executing"

    # Best-effort MLflow evidence must not change the SSE tool_result contract.
    try:
        start_tool_observation(
            handler._pending_tool_observations,
            call_id=str(call_id) if call_id else None,
            tool_name=str(tool_name),
            arguments=arguments,
            request_id=handler._request_id(),
            completed_count=len(handler._tool_observation_records),
        )
    except Exception:
        logger.warning("MLflow tool observation start failed tool=%s", tool_name)

    yield format_sse(
        {
            "name": invocation.get("name", "unknown_tool"),
            "status": invocation.get("status", "executing"),
            "arguments": invocation.get("arguments"),
        },
        event="tool_result",
    ).encode("utf-8")


async def handle_tool_output(
    handler: StreamingHandler, run_item: Any
) -> AsyncIterator[bytes]:
    """Handle tool output events."""
    raw_item = getattr(run_item, "raw_item", None)
    call_id = None
    if isinstance(raw_item, dict):
        call_id = raw_item.get("call_id")
    else:
        call_id = getattr(raw_item, "call_id", None) or getattr(raw_item, "id", None)

    output_value = getattr(run_item, "output", None)
    output_preview = str(output_value)[:200] if output_value is not None else ""

    # Parse output if JSON
    parsed_output: Optional[dict] = None
    if isinstance(output_value, str):
        try:
            parsed_output = json.loads(output_value)
        except json.JSONDecodeError:
            parsed_output = None
    elif isinstance(output_value, dict):
        parsed_output = output_value

    # Find invocation record
    invocation = None
    for inv in handler.tool_invocations:
        if (call_id and inv.get("id") == call_id) or (
            inv.get("status") == "executing" and not call_id
        ):
            invocation = inv
            break

    if invocation is None:
        invocation = {
            "id": call_id,
            "name": getattr(raw_item, "name", "unknown_tool"),
            "arguments": None,
        }
        handler.tool_invocations.append(invocation)

    invocation["status"] = "success"
    invocation["result"] = str(output_value) if output_value is not None else ""
    if parsed_output is not None:
        invocation["result_json"] = parsed_output

    # Close the request-local TOOL observation after the model-facing result is stored.
    try:
        finish_tool_observation(
            handler._pending_tool_observations,
            handler._tool_observation_records,
            call_id=str(call_id) if call_id else None,
            output=output_value,
        )
    except Exception:
        logger.warning("MLflow tool observation finish failed call_id=%s", call_id)

    # Handle token refresh and errors
    if parsed_output is not None:
        async for event_bytes in handle_tool_result_metadata(handler, parsed_output):
            yield event_bytes
        stationary_energy_payload = build_stationary_energy_tool_result_payload(
            invocation,
            parsed_output,
        )
        if stationary_energy_payload is not None:
            yield format_sse(
                stationary_energy_payload,
                event="tool_result",
            ).encode("utf-8")

    yield format_sse(
        {
            "name": invocation.get("name", "unknown_tool"),
            "status": invocation.get("status"),
            "result": output_preview,
        },
        event="tool_result",
    ).encode("utf-8")


async def handle_tool_result_metadata(
    handler: StreamingHandler, parsed_output: dict
) -> AsyncIterator[bytes]:
    """Handle metadata in tool results (token refresh, errors)."""
    # Handle token refresh
    if handler.token_handler:
        refreshed_token = parsed_output.get("refreshed_token")
        if refreshed_token and refreshed_token != handler.cc_access_token:
            await handler.token_handler.handle_refreshed_token(
                refreshed_token, handler.agent_service
            )
            handler.cc_access_token = refreshed_token

    # Handle errors
    error_code = parsed_output.get("error_code")
    success_flag = parsed_output.get("success")

    if success_flag is False and error_code in {"missing_token", "expired_token"}:
        yield format_sse(
            {
                "message": "CityCatalyst token is missing or expired. Please refresh and retry.",
                "error_code": error_code,
            },
            event="error",
        ).encode("utf-8")
    elif success_flag is True and parsed_output.get("refreshed_token"):
        yield format_sse(
            {
                "message": "CityCatalyst token refreshed.",
                "event": "token_refreshed",
            },
            event="info",
        ).encode("utf-8")
