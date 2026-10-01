"""SSE orchestration for one authenticated agent response."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import aclosing
from typing import Any, AsyncGenerator, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID, uuid4

from agents import gen_trace_id
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.middleware import get_request_id
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.services.cnb.draft_overview import (
    load_draft_overview_message,
    release_draft_overview,
)
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.cnb_progress import emit_cnb_progress, stream_cnb_events
from app.utils.concept_note_context import (
    clean_cnb_history,
)
from app.utils.conversation_observability import conversation_trace
from app.utils.history_manager import load_conversation_history
from app.utils.mlflow_logging import (
    async_start_run,
    climate_advisor_experiment_name,
    log_json_artifact,
    run_mlflow_io,
)
from app.utils.request_token_refresh import RequestTokenRefreshContext
from app.utils.sse import format_sse
from app.utils.stationary_energy_context import (
    is_stationary_energy_resume_turn,
)
from app.utils.streaming_agent import prepare_stream_agent
from app.utils.streaming_context import (
    history_contains_current_user_message,
    load_concept_note_context_message,
    load_concept_note_source_documents_message,
    load_stationary_energy_context_message,
    resolve_workflow_context,
)
from app.utils.streaming_prompt import (
    stationary_energy_system_context_message,
)
from app.utils.streaming_runner import stream_agent_events
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
        await resolve_workflow_context(self, payload)
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
            # Prepare scope, grounded history, and the request-specific agent.
            agent, conversation_history = await prepare_stream_agent(
                self, settings, payload, req_id
            )

            # Stream responses from the agent
            async for event_bytes in stream_agent_events(
                self,
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
