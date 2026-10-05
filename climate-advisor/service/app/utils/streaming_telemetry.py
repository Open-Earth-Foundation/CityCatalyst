"""Request-scoped stream tracing and completion evidence."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from app.models.requests import MessageCreateRequest
from app.utils.conversation_observability import finish_conversation_trace
from app.utils.mlflow_logging import (
    close_open_tool_observations,
    log_json_artifact,
    log_metrics,
    log_tags,
    log_text_artifact,
    merge_redacted_tool_records,
    run_mlflow_io,
    update_current_trace_context,
)

if TYPE_CHECKING:
    # The orchestrator imports these helpers; avoid a runtime import cycle.
    from app.utils.streaming_handler import StreamingHandler
logger = logging.getLogger(__name__)


def mlflow_tags(
    handler: StreamingHandler, payload: MessageCreateRequest
) -> dict[str, object]:
    """Return low-cardinality MLflow tags for one chat request."""
    workflow_metadata = handler.workflow_context.telemetry()
    tags: dict[str, object] = {
        "request_kind": "message_stream",
        "endpoint": "/v1/messages",
        "workflow": workflow_metadata["workflow"],
        "interaction": workflow_metadata["interaction"],
        "trace_category": workflow_metadata["trace_category"],
        "ca_agentic_flow": workflow_metadata["ca_agentic_flow"],
        "context_mode": workflow_metadata["context_mode"],
        "prompt_name": workflow_metadata["prompt_name"],
        "request_id": handler._request_id(),
        "thread_id": handler.thread_identifier,
        "user_id": handler.user_id,
        "inventory_id": payload.inventory_id or handler.inventory_id,
        "stationary_energy_draft_run_id": workflow_metadata[
            "stationary_energy_draft_run_id"
        ],
        "concept_note_run_id": workflow_metadata["concept_note_run_id"],
    }
    if workflow_name := workflow_metadata["workflow_name"]:
        tags["workflow_name"] = workflow_name
    return tags


def mlflow_params(
    handler: StreamingHandler, payload: MessageCreateRequest
) -> dict[str, object]:
    """Return stable MLflow params for one chat request."""
    if handler.workflow_context.concept_note_run_id:
        return {
            "content_length": len(payload.content),
            "has_context": bool(payload.context),
        }
    options = payload.options or {}
    context = payload.context if isinstance(payload.context, dict) else {}
    return {
        "content_length": len(payload.content),
        "has_context": bool(payload.context),
        "has_options": bool(options),
        "has_inventory_id": bool(payload.inventory_id or handler.inventory_id),
        "model_override": options.get("model"),
        "context_keys": sorted(context.keys()),
        "option_keys": sorted(options.keys()),
    }


def update_mlflow_trace_context(
    handler: StreamingHandler,
    payload: MessageCreateRequest,
) -> bool:
    """Attach the CA thread id as the MLflow trace session id."""
    workflow_metadata = handler.workflow_context.telemetry()
    request_id = handler._request_id()
    inventory_id = payload.inventory_id or handler.inventory_id
    metadata: dict[str, object] = {
        "service": "climate-advisor",
        "workflow": workflow_metadata["workflow"],
        "interaction": workflow_metadata["interaction"],
        "trace_category": workflow_metadata["trace_category"],
        "context_mode": workflow_metadata["context_mode"],
        "prompt_name": workflow_metadata["prompt_name"],
        "request_id": request_id,
        "thread_id": handler.thread_identifier,
        "inventory_id": inventory_id,
    }
    tags: dict[str, object] = {
        "workflow": workflow_metadata["workflow"],
        "interaction": workflow_metadata["interaction"],
        "trace_category": workflow_metadata["trace_category"],
        "ca_agentic_flow": workflow_metadata["ca_agentic_flow"],
        "context_mode": workflow_metadata["context_mode"],
        "prompt_name": workflow_metadata["prompt_name"],
        "thread_id": handler.thread_identifier,
        "inventory_id": inventory_id,
    }
    if workflow_name := workflow_metadata["workflow_name"]:
        metadata["workflow_name"] = workflow_name
        tags["workflow_name"] = workflow_name
    draft_run_id = workflow_metadata["stationary_energy_draft_run_id"]
    if draft_run_id:
        metadata["feature_flag"] = "STATIONARY_ENERGY_AGENTIC"
        metadata["stationary_energy_draft_run_id"] = draft_run_id
        tags["stationary_energy_draft_run_id"] = draft_run_id
    concept_note_run_id = workflow_metadata["concept_note_run_id"]
    if concept_note_run_id:
        metadata["feature_flag"] = "CONCEPT_NOTE_BUILDER"
        metadata["concept_note_run_id"] = concept_note_run_id
        tags["concept_note_run_id"] = concept_note_run_id

    return update_current_trace_context(
        session_id=handler.thread_identifier,
        user_id=handler.user_id,
        client_request_id=request_id,
        tags=tags,
        metadata=metadata,
    )


async def log_mlflow_stream_summary(
    handler: StreamingHandler,
    *,
    ok: bool,
    started_at: float,
    status: str | None = None,
) -> None:
    """Finalize task-local spans and offload final artifact and metric writes."""
    assistant_content = "".join(handler.assistant_tokens)
    duration_ms = (time.perf_counter() - started_at) * 1000
    stream_status = status or ("ok" if ok else "error")
    finish_conversation_trace(
        assistant_content,
        status=stream_status,
        history_saved=handler.history_saved,
        chunks=len(handler.assistant_tokens),
    )
    await run_mlflow_io(log_tags, {"stream_status": stream_status})
    await run_mlflow_io(
        log_metrics,
        {
            "duration_ms": duration_ms,
            "assistant_characters": len(assistant_content),
            "assistant_chunks": len(handler.assistant_tokens),
            "tool_invocations": len(handler.tool_invocations),
            "history_saved": int(handler.history_saved),
            "ok": int(ok),
        },
    )
    await run_mlflow_io(
        log_text_artifact, "chat/assistant_response.txt", assistant_content
    )
    try:
        close_open_tool_observations(
            handler._pending_tool_observations,
            handler._tool_observation_records,
            outcome=(
                "cancelled"
                if stream_status == "cancelled"
                else "error"
                if stream_status == "error"
                else "incomplete"
            ),
        )
    except Exception:
        logger.warning(
            "MLflow tool observation close failed status=%s",
            stream_status,
        )
    records = merge_redacted_tool_records(
        handler.tool_invocations,
        handler._tool_observation_records,
        request_id=handler._request_id(),
    )
    if records:
        await run_mlflow_io(
            log_json_artifact,
            "chat/tool_invocations.json",
            {"tool_invocations": records},
        )
    await run_mlflow_io(
        log_json_artifact,
        "response/stream_summary.json",
        {
            "ok": ok,
            "status": stream_status,
            "history_saved": handler.history_saved,
            "thread_id": handler.thread_identifier,
            "model": handler.agent_model,
            "assistant_characters": len(assistant_content),
            "tool_invocation_count": len(handler.tool_invocations),
        },
    )
