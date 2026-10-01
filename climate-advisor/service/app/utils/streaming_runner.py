"""SDK execution, prompt budgeting, tracing, and stream transport recovery."""

from __future__ import annotations

import inspect
import json
import logging
from typing import (
    TYPE_CHECKING,
    Any,
    AsyncIterator,
    Dict,
    List,
)

import httpx
from agents import ModelSettings, RunConfig, Runner, gen_trace_id
from agents.retry import ModelRetrySettings, RetryPolicyContext

from app.config import get_settings
from app.models.requests import MessageCreateRequest
from app.utils.streaming_events import process_chunk
from app.utils.streaming_prompt import (
    clear_agent_instructions,
    enforce_chat_prompt_budget,
    has_embedded_stationary_energy_system_context,
)
from app.utils.streaming_telemetry import (
    update_mlflow_trace_context,
)

if TYPE_CHECKING:
    # These helpers are called by StreamingHandler, which imports this module.
    from app.utils.streaming_handler import StreamingHandler

logger = logging.getLogger(__name__)


async def stream_agent_events(
    handler: StreamingHandler,
    agent: Any,
    payload: MessageCreateRequest,
    conversation_history: List[Dict[str, str]],
) -> AsyncIterator[bytes]:
    """Stream events from the agent."""
    # Use structured history when available; otherwise send the raw user text.
    runner_input: Any = (
        conversation_history if conversation_history else payload.content
    )
    restore_agent_instructions = False
    original_agent_instructions: Any = None
    # Stationary Energy chats carry more context, so enforce the configured budget.
    if handler.workflow_context.stationary_energy_draft_run_id and isinstance(
        runner_input, list
    ):
        if has_embedded_stationary_energy_system_context(runner_input):
            if hasattr(agent, "instructions"):
                original_agent_instructions = getattr(agent, "instructions", None)
                restore_agent_instructions = True
            clear_agent_instructions(agent)
        runner_input = enforce_chat_prompt_budget(handler, agent, runner_input)

    trace_context_updated = update_mlflow_trace_context(handler, payload)
    # Prefer the Agents SDK streamed runner and keep the legacy fallback path.
    try:
        result = Runner.run_streamed(
            agent,
            runner_input,
            run_config=build_stream_run_config(handler, payload),
        )
    except Exception as runner_exc:
        logger.warning(
            "Agents Runner streaming failed (%s); falling back to agent.messages.run_stream",
            runner_exc,
        )
        # The fallback only sends raw user content, so restore the scoped prompt.
        if restore_agent_instructions:
            try:
                setattr(agent, "instructions", original_agent_instructions)
            except Exception as exc:
                logger.debug(
                    "Could not restore embedded agent instructions before fallback: %s",
                    exc,
                )
        async for event_bytes in fallback_stream(agent, payload):
            yield event_bytes
        return

    trace_context_attempted_after_start = False

    # Convert SDK stream events into the app's SSE event contract.
    async for chunk in result.stream_events():
        if not trace_context_updated and not trace_context_attempted_after_start:
            trace_context_attempted_after_start = True
            trace_context_updated = update_mlflow_trace_context(handler, payload)
        async for event_bytes in process_chunk(handler, chunk):
            yield event_bytes


def build_stream_run_config(
    handler: StreamingHandler, payload: MessageCreateRequest
) -> RunConfig:
    """Build trace metadata and execution options for one streamed run."""
    settings = get_settings()
    req_id = handler._request_id()
    workflow_metadata = handler.workflow_context.telemetry()
    draft_run_id = workflow_metadata["stationary_energy_draft_run_id"]
    concept_note_run_id = workflow_metadata["concept_note_run_id"]
    has_stationary_energy_context = bool(draft_run_id)
    # Keep trace metadata low-cardinality except for scoped request ids.
    trace_metadata: dict[str, Any] = {
        "service": "climate-advisor",
        "workflow": workflow_metadata["workflow"],
        "interaction": workflow_metadata["interaction"],
        "trace_category": workflow_metadata["trace_category"],
        "ca_agentic_flow": workflow_metadata["ca_agentic_flow"],
        "context_mode": workflow_metadata["context_mode"],
        "prompt_name": workflow_metadata["prompt_name"],
        "request_id": req_id,
        "thread_id": handler.thread_identifier,
        "inventory_id": handler.inventory_id,
    }
    if workflow_name := workflow_metadata["workflow_name"]:
        trace_metadata["workflow_name"] = workflow_name
    if has_stationary_energy_context:
        trace_metadata["feature_flag"] = "STATIONARY_ENERGY_AGENTIC"
        trace_metadata["stationary_energy_draft_run_id"] = str(draft_run_id)
    if concept_note_run_id:
        trace_metadata["feature_flag"] = "CONCEPT_NOTE_BUILDER"
        trace_metadata["concept_note_run_id"] = str(concept_note_run_id)

    # Keep body recovery separate from the provider's pre-header retry budget.
    return RunConfig(
        model_settings=ModelSettings(
            retry=ModelRetrySettings(
                max_retries=settings.llm.streaming.retry_attempts,
                backoff={
                    "initial_delay": settings.llm.streaming.retry_delay_ms / 1000,
                    "max_delay": settings.llm.streaming.retry_delay_ms / 1000,
                    "jitter": True,
                },
                policy=lambda context: retry_stream_transport(handler, context),
            )
            if settings.llm.streaming.retry_attempts
            else None,
        ),
        workflow_name=handler.workflow_context.trace_workflow_name,
        trace_id=gen_trace_id(),
        group_id=handler.thread_identifier,
        trace_metadata=trace_metadata,
        tracing_disabled=bool(concept_note_run_id)
        or not settings.langsmith_tracing_enabled,
        trace_include_sensitive_data=not bool(concept_note_run_id),
    )


def retry_stream_transport(
    handler: StreamingHandler, context: RetryPolicyContext
) -> bool:
    """Recover early body disconnects inside the SDK's per-model replay guard.

    The provider already retries connection/status failures before headers;
    those arrive as OpenAI exceptions and must not multiply that budget here.
    The runner vetoes replay after output, tool events, or cancellation and
    retries only the current model call, never a completed tool invocation.
    """
    retry = context.stream and isinstance(
        context.error,
        (httpx.ReadTimeout, httpx.ReadError, httpx.RemoteProtocolError),
    )
    if retry:
        logger.warning(
            "Retrying chat stream transport thread_id=%s request_id=%s retry=%s error_type=%s",
            handler.thread_identifier,
            handler._request_id(),
            context.attempt,
            type(context.error).__name__,
        )
    return retry


async def fallback_stream(
    agent: Any, payload: MessageCreateRequest
) -> AsyncIterator[bytes]:
    """Fallback streaming method if Runner fails."""
    if not (hasattr(agent, "messages") and hasattr(agent.messages, "run_stream")):
        raise RuntimeError("No fallback streaming method available")

    try:
        stream_result = agent.messages.run_stream(payload.content)
    except TypeError:
        stream_result = agent.messages.run_stream()

    if inspect.isawaitable(stream_result):
        stream_result = await stream_result

    async for raw_chunk in stream_result:
        if isinstance(raw_chunk, (bytes, bytearray)):
            yield bytes(raw_chunk)
        elif isinstance(raw_chunk, str):
            yield raw_chunk.encode("utf-8")
        else:
            yield json.dumps(raw_chunk).encode("utf-8")
