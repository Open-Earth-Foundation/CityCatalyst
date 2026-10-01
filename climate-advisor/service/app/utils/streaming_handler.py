"""SSE orchestration for one authenticated agent response."""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import time
from contextlib import aclosing
from typing import Any, AsyncGenerator, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID, uuid4

import httpx
from agents import ModelSettings, RunConfig, Runner, gen_trace_id
from agents.retry import ModelRetrySettings, RetryPolicyContext
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.middleware import get_request_id
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.services.cnb.draft_overview import (
    draft_overview_instructions,
    load_draft_overview_message,
    release_draft_overview,
)
from app.services.native_input_catalog_service import ActiveRequestContext
from app.services.thread_service import ThreadService
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.cnb_progress import emit_cnb_progress, stream_cnb_events
from app.utils.concept_note_context import (
    clean_cnb_history,
    extract_concept_note_run_id,
)
from app.utils.conversation_observability import conversation_trace
from app.utils.history_manager import load_conversation_history
from app.utils.mlflow_logging import (
    async_start_run,
    climate_advisor_experiment_name,
    log_json_artifact,
    log_tags,
    run_mlflow_io,
)
from app.utils.request_token_refresh import RequestTokenRefreshContext
from app.utils.sse import format_sse
from app.utils.stationary_energy_context import (
    extract_stationary_energy_draft_run_id,
    is_stationary_energy_resume_turn,
)
from app.utils.streaming_context import (
    history_contains_current_user_message,
    load_concept_note_context_message,
    load_concept_note_source_documents_message,
    load_stationary_energy_context_message,
    recent_concept_note_edit_messages,
)
from app.utils.streaming_events import process_chunk
from app.utils.streaming_prompt import (
    clear_agent_instructions,
    enforce_chat_prompt_budget,
    has_embedded_stationary_energy_system_context,
    stationary_energy_system_context_message,
)
from app.utils.streaming_telemetry import (
    log_mlflow_stream_summary,
    mlflow_params,
    mlflow_tags,
    update_mlflow_trace_context,
)
from app.utils.token_handler import TokenHandler
from app.utils.tool_handler import persist_assistant_message

logger = logging.getLogger(__name__)


class StreamingHandler:
    """Handles SSE streaming of agent responses."""

    def __init__(
        self,
        thread_id: Union[str, UUID],
        user_id: str,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
        cc_access_token: Optional[str] = None,
        catalog_user_id: Optional[str] = None,
        inventory_id: Optional[str] = None,
        request_context: Optional[Any] = None,
        request_options: Optional[dict] = None,
        draft_overview_claim: Optional[tuple[UUID, str]] = None,
        request_token_refresh_context: Optional[RequestTokenRefreshContext] = None,
    ) -> None:
        """Initialize per-request state for streaming one agent response."""
        self.thread_id = thread_id
        self.reasoning_stream_id = str(uuid4())
        self.user_id = user_id
        self.session_factory = session_factory
        self.cc_access_token = cc_access_token
        self.catalog_user_id = catalog_user_id
        self.inventory_id = inventory_id
        self.request_context = request_context
        self.request_options = request_options
        # (run_id, build_id) when this is the hidden CNB drafting-overview turn.
        self.draft_overview_claim = draft_overview_claim
        self.request_token_refresh_context = request_token_refresh_context
        self.thread_identifier = str(thread_id)
        self.workflow_context = ChatWorkflowContext()
        # Set per request once the Stationary Energy page markers are resolved.
        self.stationary_energy_surface = False
        self.stationary_energy_city_id: Optional[str] = None
        self.agent_model: Optional[str] = None
        self.request_identifier: Optional[str] = None

        # Response state
        self.assistant_tokens: List[str] = []
        self.tool_invocations: List[dict] = []
        self._pending_tool_observations: dict[str, Any] = {}
        self._tool_observation_records: List[dict] = []
        self.token_index = 0
        self.history_saved = False
        self.streaming_error = False
        self.agent_service: Optional[AgentService] = None
        self.token_handler: Optional[TokenHandler] = None
        self.concept_note_edit_request: EditProposalRequest | None = None

    async def stream_response(
        self,
        payload: MessageCreateRequest,
        history_warning: Optional[str] = None,
    ) -> AsyncGenerator[bytes, None]:
        """Forward answer and request-local worker events on the existing stream."""
        events = stream_cnb_events(self._stream_response(payload, history_warning))
        async with aclosing(events) as stream:
            async for chunk in stream:
                yield chunk

    async def _stream_response(
        self,
        payload: MessageCreateRequest,
        history_warning: Optional[str] = None,
    ) -> AsyncGenerator[bytes, None]:
        """Stream AI responses using OpenAI Agents SDK.

        Args:
            payload: Message creation request
            history_warning: Warning message if history unavailable

        Yields:
            SSE formatted bytes for streaming response
        """
        req_id = self._request_id()
        settings = get_settings()
        started_at = time.perf_counter()
        await self._resolve_workflow_context(payload)
        if self.workflow_context.concept_note_run_id:
            await emit_cnb_progress("preparing")

        async with async_start_run(
            run_name=self.workflow_context.mlflow_run_name,
            experiment_name=climate_advisor_experiment_name(),
            tags=mlflow_tags(self, payload),
            params=mlflow_params(self, payload),
        ):
            with conversation_trace(
                payload.content, attributes=self.workflow_context.telemetry()
            ):
                update_mlflow_trace_context(self, payload)
                await run_mlflow_io(
                    log_json_artifact,
                    "request/message_payload.json",
                    payload.model_dump(mode="json"),
                )

                async for event_bytes in self._stream_response_with_mlflow(
                    payload=payload,
                    history_warning=history_warning,
                    req_id=req_id,
                    settings=settings,
                    started_at=started_at,
                ):
                    yield event_bytes

    async def _stream_response_with_mlflow(
        self,
        *,
        payload: MessageCreateRequest,
        history_warning: Optional[str],
        req_id: str,
        settings: Settings,
        started_at: float,
    ) -> AsyncIterator[bytes]:
        """Stream one response while the current MLflow run is active."""

        # Send history warning if database is unavailable
        if history_warning:
            warning_payload = {
                "message": history_warning,
                "thread_id": self.thread_identifier,
            }
            yield format_sse(warning_payload, event="warning").encode("utf-8")

        # Initialize token handler
        self.token_handler = TokenHandler(
            thread_id=self.thread_id,
            user_id=self.user_id,
            session_factory=self.session_factory,
        )

        try:
            draft_run_id = self.workflow_context.stationary_energy_draft_run_id
            concept_note_run_id = self.workflow_context.concept_note_run_id

            # Resolve the Stationary Energy draft surface scope (city + an explicit
            # interaction-mode marker) so the agent can offer the start-draft tool
            # even before any draft run exists. Only the SE draft page sends these.
            stationary_energy_city_id: Optional[str] = None
            stationary_energy_surface = bool(draft_run_id)
            for source in (
                payload.context,
                payload.options,
                self.request_context,
                self.request_options,
            ):
                if not isinstance(source, dict):
                    continue
                if not stationary_energy_city_id and source.get("city_id"):
                    stationary_energy_city_id = str(source.get("city_id"))
                if source.get("stationary_energy_interaction_mode"):
                    stationary_energy_surface = True
            self.stationary_energy_surface = stationary_energy_surface
            self.stationary_energy_city_id = stationary_energy_city_id

            # Create agent service
            native_input_catalog_context = self._native_input_catalog_request(payload)
            edit_context = (
                payload.context.get("concept_note_edit")
                if isinstance(payload.context, dict)
                else None
            )
            edit_request = (
                EditProposalRequest.model_validate(
                    {**edit_context, "instruction": payload.content}
                )
                if concept_note_run_id and isinstance(edit_context, dict)
                else None
            )
            self.concept_note_edit_request = edit_request
            # The CNB frontend sends its active language so help quotes visible labels.
            concept_note_ui_locale = (
                payload.context.get("ui_locale")
                if concept_note_run_id and isinstance(payload.context, dict)
                else None
            )

            # Load the effective chat input before tool registration so the edit
            # planner can resolve short follow-ups from a bounded visible window.
            conversation_history = await self._load_conversation_history(
                settings, payload
            )
            concept_note_edit_history = (
                recent_concept_note_edit_messages(
                    conversation_history,
                    current_instruction=payload.content,
                )
                if edit_request is not None
                else []
            )
            self.agent_service = AgentService(
                cc_access_token=self.cc_access_token,
                request_token_refresh_context=self.request_token_refresh_context,
                cc_thread_id=self.thread_id,
                cc_user_id=self.user_id,
                inventory_id=self.inventory_id,
                city_id=stationary_energy_city_id,
                session_factory=self.session_factory,
                stationary_energy_draft_run_id=draft_run_id,
                stationary_energy_surface=stationary_energy_surface,
                concept_note_run_id=concept_note_run_id,
                native_input_catalog_context=native_input_catalog_context,
                concept_note_edit_request=edit_request,
                concept_note_edit_history=concept_note_edit_history,
                concept_note_ui_locale=concept_note_ui_locale,
            )

            # Get model override from options
            options = payload.options or {}
            model_override = options.get("model")
            if concept_note_run_id:
                model_override = None

            self.agent_model = (
                model_override
                or self.agent_service.preferred_model_for_context(
                    stationary_energy_draft_run_id=draft_run_id,
                    concept_note_run_id=concept_note_run_id,
                )
            )
            logger.info(
                "Selected chat model=%s stationary_energy_context=%s concept_note_context=%s thread_id=%s",
                self.agent_model,
                bool(draft_run_id),
                bool(concept_note_run_id),
                self.thread_id,
            )
            workflow_metadata = self.workflow_context.telemetry()
            await run_mlflow_io(
                log_tags,
                {
                    "model": self.agent_model,
                    "ca_agentic_flow": workflow_metadata["ca_agentic_flow"],
                    "workflow": workflow_metadata["workflow"],
                    "workflow_name": workflow_metadata["workflow_name"],
                    "interaction": workflow_metadata["interaction"],
                    "prompt_name": workflow_metadata["prompt_name"],
                    "stationary_energy_draft_run_id": draft_run_id,
                    "concept_note_run_id": concept_note_run_id,
                },
            )

            agent = await self.agent_service.create_agent(
                model=self.agent_model,
                instructions=(
                    draft_overview_instructions(settings.llm.prompts)
                    if self.draft_overview_claim
                    else None
                ),
            )

            await run_mlflow_io(
                log_json_artifact,
                "chat/conversation_history.json",
                {"messages": conversation_history},
            )

            logger.info(
                "Starting Agents SDK streaming - thread_id=%s, user_id=%s, request_id=%s",
                self.thread_id,
                self.user_id,
                req_id,
            )

            # Stream responses from the agent
            async for event_bytes in self._stream_agent_events(
                agent,
                payload,
                conversation_history,
            ):
                yield event_bytes

            await self._persist_refreshed_token_from_agent()

            # Persist the assistant message before the terminal done event so
            # history_saved reflects the actual write result.
            await self.persist_message()

            # Send completion event
            await log_mlflow_stream_summary(
                self,
                ok=not self.streaming_error,
                started_at=started_at,
            )
            yield self._format_completion_event(req_id)

        except asyncio.CancelledError:
            logger.info(
                "Agents SDK streaming cancelled for thread_id=%s request_id=%s",
                self.thread_id,
                req_id,
            )
            self.streaming_error = True
            await run_mlflow_io(
                log_json_artifact,
                "errors/stream_cancelled.json",
                {
                    "type": "CancelledError",
                    "message": "Client disconnected or request was cancelled.",
                    "thread_id": self.thread_identifier,
                },
            )
            await log_mlflow_stream_summary(
                self,
                ok=False,
                started_at=started_at,
                status="cancelled",
            )
            raise

        except Exception as exc:
            if self.workflow_context.concept_note_run_id:
                # Preserve diagnostic categories without logging source text or provider bodies.
                logger.warning(
                    "CNB stream failed thread_id=%s request_id=%s error_type=%s status_code=%s",
                    self.thread_identifier,
                    req_id,
                    type(exc).__name__,
                    getattr(exc, "status_code", None),
                )
            else:
                logger.exception("Unhandled exception in Agents SDK streaming")
            self.streaming_error = True
            await run_mlflow_io(
                log_json_artifact,
                "errors/stream_error.json",
                {
                    "type": type(exc).__name__,
                    "request_id": req_id,
                    "status_code": getattr(exc, "status_code", None),
                    "message": (
                        "CNB stream failed"
                        if self.workflow_context.concept_note_run_id
                        else str(exc)
                    ),
                },
            )
            await log_mlflow_stream_summary(
                self,
                ok=False,
                started_at=started_at,
                status="error",
            )
            yield format_sse(
                {"message": "An internal error has occurred."}, event="error"
            ).encode("utf-8")
            yield self._format_completion_event(req_id, ok=False)

        finally:
            # A failed overview turn stays retryable for the same drafting build.
            if self.draft_overview_claim and not self.history_saved:
                run_id, build_id = self.draft_overview_claim
                await release_draft_overview(
                    session_factory=self.session_factory,
                    run_id=run_id,
                    user_id=self.user_id,
                    build_id=build_id,
                )
            # Clean up agent service
            if self.agent_service:
                await self.agent_service.close()

    async def _load_conversation_history(
        self,
        settings: Settings,
        payload: MessageCreateRequest,
    ) -> List[Dict[str, str]]:
        """Load conversation history from database with pruning applied.

        This method:
        1. Calls load_conversation_history which loads messages from DB
        2. Applies history pruning based on retention config (preserve latest N turns)
        3. Adds recent tool outputs as additional SYSTEM messages (role/content only)
           to keep follow-up turns grounded (e.g. remembering inventory IDs)
        4. Falls back gracefully if DB is unavailable

        Returns:
            List of message dicts ready for LLM, with pruning applied.
            Empty list if history is disabled or DB is unavailable.
        """
        # Load persisted chat history before injecting workflow-specific context.
        conversation_history = await load_conversation_history(
            thread_id=self.thread_id,
            user_id=self.user_id,
            session_factory=self.session_factory,
        )
        if self.workflow_context.concept_note_run_id:
            conversation_history = clean_cnb_history(conversation_history)
        context_message = await load_stationary_energy_context_message(self, payload)
        source_documents_message = None
        if context_message:
            context_message = stationary_energy_system_context_message(
                self, context_message
            )
        else:
            context_message = await load_concept_note_context_message(self)
            source_documents_message = await load_concept_note_source_documents_message(
                self
            )

        if context_message:
            # Complete source text, when within budget, follows the bundle JSON.
            conversation_history = [
                context_message,
                *([source_documents_message] if source_documents_message else []),
                *conversation_history,
            ]
            if self.draft_overview_claim and self.session_factory:
                # Fail the turn rather than let the overview run without draft facts.
                conversation_history.append(
                    await load_draft_overview_message(
                        session_factory=self.session_factory,
                        run_id=self.draft_overview_claim[0],
                        user_id=self.user_id,
                        ui_locale=(
                            payload.context.get("ui_locale")
                            if isinstance(payload.context, dict)
                            else None
                        ),
                    )
                )
            # A resume turn repeats the user's pre-run request, which history
            # already holds before the "starting the run" reply, so re-add it.
            if is_stationary_energy_resume_turn(
                payload.options
            ) or not history_contains_current_user_message(
                conversation_history,
                payload.content,
            ):
                conversation_history.append(
                    {"role": "user", "content": payload.content}
                )

        # Log the effective context size after workflow injection and pruning.
        if conversation_history:
            logger.info(
                "Loaded and pruned conversation history: %d messages for thread_id=%s",
                len(conversation_history),
                self.thread_id,
            )
        else:
            logger.debug(
                "No conversation history available (disabled or DB unavailable) for thread_id=%s",
                self.thread_id,
            )

        return conversation_history

    async def _load_thread_workflow_context(self) -> ChatWorkflowContext:
        """Load scoped workflow identifiers persisted on the current chat thread."""
        if not self.session_factory:
            return ChatWorkflowContext()
        try:
            async with self.session_factory() as session:
                thread = await ThreadService(session).get_thread(self.thread_id)
                if thread is None or thread.user_id != self.user_id:
                    return ChatWorkflowContext()
                return ChatWorkflowContext(
                    stationary_energy_draft_run_id=(
                        extract_stationary_energy_draft_run_id(thread.context)
                    ),
                    concept_note_run_id=extract_concept_note_run_id(thread.context),
                )
        except Exception as exc:
            logger.warning(
                "Failed to load thread workflow context thread_id=%s: %s",
                self.thread_id,
                exc,
            )
            return ChatWorkflowContext()

    async def _stream_agent_events(
        self,
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
        if self.workflow_context.stationary_energy_draft_run_id and isinstance(
            runner_input, list
        ):
            if has_embedded_stationary_energy_system_context(runner_input):
                if hasattr(agent, "instructions"):
                    original_agent_instructions = getattr(agent, "instructions", None)
                    restore_agent_instructions = True
                clear_agent_instructions(agent)
            runner_input = enforce_chat_prompt_budget(self, agent, runner_input)

        trace_context_updated = update_mlflow_trace_context(self, payload)
        # Prefer the Agents SDK streamed runner and keep the legacy fallback path.
        try:
            result = Runner.run_streamed(
                agent,
                runner_input,
                run_config=self._run_config(payload),
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
            async for event_bytes in self._fallback_stream(agent, payload):
                yield event_bytes
            return

        trace_context_attempted_after_start = False

        # Convert SDK stream events into the app's SSE event contract.
        async for chunk in result.stream_events():
            if not trace_context_updated and not trace_context_attempted_after_start:
                trace_context_attempted_after_start = True
                trace_context_updated = update_mlflow_trace_context(self, payload)
            async for event_bytes in process_chunk(self, chunk):
                yield event_bytes

    def _run_config(self, payload: MessageCreateRequest) -> RunConfig:
        """Build trace metadata and execution options for one streamed run."""
        settings = get_settings()
        req_id = self._request_id()
        workflow_metadata = self.workflow_context.telemetry()
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
            "thread_id": self.thread_identifier,
            "inventory_id": self.inventory_id,
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
                    policy=self._retry_stream_transport,
                )
                if settings.llm.streaming.retry_attempts
                else None,
            ),
            workflow_name=self.workflow_context.trace_workflow_name,
            trace_id=gen_trace_id(),
            group_id=self.thread_identifier,
            trace_metadata=trace_metadata,
            tracing_disabled=bool(concept_note_run_id)
            or not settings.langsmith_tracing_enabled,
            trace_include_sensitive_data=not bool(concept_note_run_id),
        )

    def _retry_stream_transport(self, context: RetryPolicyContext) -> bool:
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
                self.thread_identifier,
                self._request_id(),
                context.attempt,
                type(context.error).__name__,
            )
        return retry

    async def _fallback_stream(
        self, agent: Any, payload: MessageCreateRequest
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

    async def _persist_refreshed_token_from_agent(self) -> None:
        """Persist a refreshed token held by AgentService after tool execution."""
        if not self.agent_service or not self.token_handler:
            return

        current_token = getattr(self.agent_service, "current_cc_token", lambda: None)()
        if not isinstance(current_token, str) or not current_token:
            return
        if current_token == self.cc_access_token:
            return

        await self.token_handler.handle_refreshed_token(
            current_token, self.agent_service
        )
        self.cc_access_token = current_token

    def _format_completion_event(self, req_id: str, ok: bool = None) -> bytes:
        """Format the final completion event."""
        if ok is None:
            ok = not self.streaming_error

        event_data = {
            "ok": ok,
            "request_id": req_id,
            "history_saved": self.history_saved,
            "thread_id": self.thread_identifier,
            "tools_used": self.tool_invocations or None,
        }

        if not ok:
            event_data["error"] = "Streaming error occurred"

        return format_sse(event_data, event="done").encode("utf-8")

    async def persist_message(self) -> bool:
        """Persist the assistant message to database."""
        if self.streaming_error or not self.assistant_tokens:
            return False

        assistant_content = "".join(self.assistant_tokens)
        self.history_saved = await persist_assistant_message(
            session_factory=self.session_factory,
            thread_id=self.thread_id,
            user_id=self.user_id,
            assistant_content=assistant_content,
            tool_invocations=self._tool_invocations_for_persistence(),
        )
        return self.history_saved

    def _tool_invocations_for_persistence(self) -> list[dict] | None:
        """Add server-bound CNB edit arguments to the database audit record."""
        if not self.tool_invocations:
            return None
        if self.concept_note_edit_request is None:
            return self.tool_invocations

        bound_arguments = self.concept_note_edit_request.model_dump(mode="json")
        return [
            {
                **invocation,
                "bound_arguments": bound_arguments,
            }
            if invocation.get("name") == "concept_note_edit_propose"
            else invocation
            for invocation in self.tool_invocations
        ]

    def _request_id(self) -> str:
        """Return the current request id or a stable per-handler fallback."""
        request_id = get_request_id().strip()
        if request_id:
            return request_id
        if self.request_identifier is None:
            self.request_identifier = gen_trace_id()
        return self.request_identifier

    async def _resolve_workflow_context(
        self,
        payload: MessageCreateRequest,
    ) -> None:
        """Resolve request or thread workflow IDs once for the shared stream."""
        draft_run_id = (
            self.workflow_context.stationary_energy_draft_run_id
            or extract_stationary_energy_draft_run_id(
                payload.context,
                payload.options,
                self.request_context,
                self.request_options,
            )
        )
        concept_note_run_id = (
            self.workflow_context.concept_note_run_id
            or extract_concept_note_run_id(
                payload.context,
                payload.options,
                self.request_context,
                self.request_options,
            )
        )
        thread_context = ChatWorkflowContext()
        if not draft_run_id or not concept_note_run_id:
            thread_context = await self._load_thread_workflow_context()

        self.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=self._normalize_workflow_run_id(
                draft_run_id or thread_context.stationary_energy_draft_run_id,
                "Stationary Energy draft_run_id",
            ),
            concept_note_run_id=self._normalize_workflow_run_id(
                concept_note_run_id or thread_context.concept_note_run_id,
                "Concept Note run id",
            ),
        )

    def _native_input_catalog_request(
        self,
        payload: MessageCreateRequest,
    ) -> ActiveRequestContext | None:
        """Resolve catalog scope only when the current request has a Core credential."""
        if not self.cc_access_token or not self.catalog_user_id:
            return None

        sources = (
            payload.context,
            payload.options,
            self.request_context,
            self.request_options,
        )

        def first_value(field: str) -> Optional[str]:
            for source in sources:
                if not isinstance(source, dict):
                    continue
                value = source.get(field)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return None

        return ActiveRequestContext(
            user_id=self.catalog_user_id,
            thread_id=self.thread_identifier,
            organization_id=first_value("organization_id"),
            project_id=first_value("project_id"),
            city_id=first_value("city_id"),
            inventory_id=payload.inventory_id
            or self.inventory_id
            or first_value("inventory_id"),
        )

    @staticmethod
    def _normalize_workflow_run_id(value: object, label: str) -> str | None:
        """Return a canonical UUID string, ignoring malformed workflow IDs."""
        if not value:
            return None
        try:
            return str(UUID(str(value)))
        except ValueError:
            logger.warning(
                "Ignoring invalid %s before MLflow run",
                label,
            )
            return None
