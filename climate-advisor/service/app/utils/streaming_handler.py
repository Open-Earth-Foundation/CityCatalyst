"""SSE Streaming handler for agent responses."""

from __future__ import annotations

import inspect
import json
import logging
import time
from typing import Any, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID

from agents import RunConfig, Runner, gen_trace_id
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.middleware import get_request_id
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.services.message_service import MessageService
from app.services.stationary_energy.stationary_energy_chat_context import (
    build_minimal_stationary_energy_context_payload,
    build_stationary_energy_context_payload,
    build_stationary_energy_ui_context,
    format_stationary_energy_context_message,
)
from app.services.stationary_energy.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.services.stationary_energy.stationary_energy_tool_events import (
    build_stationary_energy_tool_result_payload,
)
from app.services.thread_service import ThreadService
from app.utils.sse import format_sse
from app.utils.stationary_energy_context import extract_stationary_energy_draft_run_id
from app.utils.tool_handler import persist_assistant_message
from app.utils.token_handler import TokenHandler
from app.utils.history_manager import load_conversation_history
from app.utils.mlflow_logging import (
    climate_advisor_experiment_name,
    log_json_artifact,
    log_metrics,
    log_text_artifact,
    log_tags,
    start_run,
)
from app.utils.prompt_budget import (
    compact_stationary_energy_prompt_payload,
    count_prompt_tokens,
    get_stationary_energy_prompt_budget,
    trim_messages_to_budget,
)

logger = logging.getLogger(__name__)


class StreamingHandler:
    """Handles SSE streaming of agent responses."""

    def __init__(
        self,
        thread_id: Union[str, UUID],
        user_id: str,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
        cc_access_token: Optional[str] = None,
        inventory_id: Optional[str] = None,
        request_context: Optional[Any] = None,
        request_options: Optional[dict] = None,
    ) -> None:
        """Initialize per-request state for streaming one agent response."""
        self.thread_id = thread_id
        self.user_id = user_id
        self.session_factory = session_factory
        self.cc_access_token = cc_access_token
        self.inventory_id = inventory_id
        self.request_context = request_context
        self.request_options = request_options
        self.thread_identifier = str(thread_id)
        self.stationary_energy_draft_run_id: Optional[str] = None
        self.agent_model: Optional[str] = None

        # Response state
        self.assistant_tokens: List[str] = []
        self.tool_invocations: List[dict] = []
        self.token_index = 0
        self.history_saved = False
        self.streaming_error = False
        self.agent_service: Optional[AgentService] = None
        self.token_handler: Optional[TokenHandler] = None

    async def stream_response(
        self,
        payload: MessageCreateRequest,
        history_warning: Optional[str] = None,
    ) -> AsyncIterator[bytes]:
        """Stream AI responses using OpenAI Agents SDK.

        Args:
            payload: Message creation request
            history_warning: Warning message if history unavailable

        Yields:
            SSE formatted bytes for streaming response
        """
        req_id = get_request_id()
        settings = get_settings()
        started_at = time.perf_counter()
        await self._prime_mlflow_workflow_context(payload)

        with start_run(
            run_name=self._mlflow_run_name(payload),
            experiment_name=self._mlflow_experiment_name(payload),
            tags=self._mlflow_tags(payload),
            params=self._mlflow_params(payload),
        ):
            log_json_artifact(
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
            # Resolve scoped workflow context before creating the agent so
            # AgentService can attach the correct tool pack.
            if not self.stationary_energy_draft_run_id:
                self.stationary_energy_draft_run_id = (
                    extract_stationary_energy_draft_run_id(
                        payload.context,
                        payload.options,
                        self.request_context,
                        self.request_options,
                    )
                    or await self._load_thread_stationary_energy_draft_run_id()
                )

            # Create agent service
            self.agent_service = AgentService(
                cc_access_token=self.cc_access_token,
                cc_thread_id=self.thread_id,
                cc_user_id=self.user_id,
                inventory_id=self.inventory_id,
                session_factory=self.session_factory,
                stationary_energy_draft_run_id=self.stationary_energy_draft_run_id,
            )

            # Get model override from options
            options = payload.options or {}
            model_override = options.get("model")

            self.agent_model = (
                model_override
                or self.agent_service.preferred_model_for_context(
                    stationary_energy_draft_run_id=self.stationary_energy_draft_run_id,
                )
            )
            logger.info(
                "Selected chat model=%s stationary_energy_context=%s thread_id=%s",
                self.agent_model,
                bool(self.stationary_energy_draft_run_id),
                self.thread_id,
            )
            log_tags(
                {
                    "model": self.agent_model,
                    "ca_agentic_flow": bool(self.stationary_energy_draft_run_id),
                    "workflow": (
                        "stationary_energy_context_chat"
                        if self.stationary_energy_draft_run_id
                        else "climate_advisor_conversation"
                    ),
                    "stationary_energy_draft_run_id": self.stationary_energy_draft_run_id,
                }
            )

            agent = await self.agent_service.create_agent(model=self.agent_model)

            # Load conversation history
            conversation_history = await self._load_conversation_history(
                settings, payload
            )
            log_json_artifact(
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
                agent, payload, conversation_history
            ):
                yield event_bytes

            # Persist the assistant message before the terminal done event so
            # history_saved reflects the actual write result.
            await self.persist_message()

            # Send completion event
            self._log_mlflow_stream_summary(
                ok=not self.streaming_error,
                started_at=started_at,
            )
            yield self._format_completion_event(req_id)

        except Exception as exc:
            logger.exception("Unhandled exception in Agents SDK streaming")
            self.streaming_error = True
            log_json_artifact(
                "errors/stream_error.json",
                {"type": type(exc).__name__, "message": str(exc)},
            )
            self._log_mlflow_stream_summary(ok=False, started_at=started_at)
            yield format_sse(
                {"message": "An internal error has occurred."}, event="error"
            ).encode("utf-8")
            yield self._format_completion_event(req_id, ok=False)

        finally:
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
        stationary_energy_context = await self._load_stationary_energy_context_message(
            payload
        )
        # Prepend the CA-owned draft snapshot so short replies stay grounded.
        if stationary_energy_context:
            conversation_history = [stationary_energy_context, *conversation_history]
            if not self._history_contains_current_user_message(
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

    async def _load_stationary_energy_context_message(
        self,
        payload: MessageCreateRequest,
    ) -> Optional[Dict[str, str]]:
        """Load the persisted Stationary Energy draft snapshot for chat grounding."""
        # Resolve the draft id from request context first, then fall back to thread state.
        draft_run_id_text = extract_stationary_energy_draft_run_id(
            payload.context,
            payload.options,
            self.request_context,
            self.request_options,
        )
        if not draft_run_id_text:
            draft_run_id_text = self.stationary_energy_draft_run_id
        if not draft_run_id_text:
            draft_run_id_text = await self._load_thread_stationary_energy_draft_run_id()

        if not draft_run_id_text:
            return None

        # Reject malformed context ids without failing the whole chat request.
        try:
            draft_run_id = UUID(str(draft_run_id_text))
        except ValueError:
            logger.warning(
                "Ignoring invalid Stationary Energy draft_run_id in chat context: %s",
                draft_run_id_text,
            )
            return None

        # Keep the resolved id on the handler so tool registration uses the same draft.
        self.stationary_energy_draft_run_id = str(draft_run_id)

        if not self.session_factory:
            logger.debug(
                "Session factory unavailable; Stationary Energy draft context skipped"
            )
            return None

        # Load the CA-owned draft snapshot with source, proposal, and review rows.
        try:
            async with self.session_factory() as session:
                repository = StationaryEnergyDraftRepository(session)
                draft_run = await repository.get_draft_run(draft_run_id)
        except Exception as exc:
            logger.warning(
                "Failed to load Stationary Energy draft context draft_run_id=%s: %s",
                draft_run_id,
                exc,
            )
            return None

        # Return a system blocker when the requested draft is missing or not owned.
        if draft_run is None or draft_run.user_id != self.user_id:
            logger.warning(
                "Stationary Energy draft context unavailable draft_run_id=%s user_id=%s",
                draft_run_id,
                self.user_id,
            )
            return {
                "role": "system",
                "content": (
                    "STATIONARY_ENERGY_DRAFT_CONTEXT_UNAVAILABLE\n"
                    "The requested Stationary Energy draft context is not available for this user."
                ),
            }

        # Attach UI focus/confirmation state to the persisted draft snapshot.
        context_payload = build_stationary_energy_context_payload(draft_run)
        ui_context = build_stationary_energy_ui_context(payload)
        if ui_context:
            context_payload["ui_context"] = ui_context
        return self._stationary_energy_context_message(context_payload)

    async def _load_thread_stationary_energy_draft_run_id(self) -> Optional[str]:
        """Load the draft run id persisted on the current chat thread."""
        if not self.session_factory:
            return None

        try:
            async with self.session_factory() as session:
                thread_service = ThreadService(session)
                thread = await thread_service.get_thread(self.thread_id)
                if thread is None or thread.user_id != self.user_id:
                    return None
                return extract_stationary_energy_draft_run_id(thread.context)
        except Exception as exc:
            logger.warning(
                "Failed to load thread Stationary Energy context thread_id=%s: %s",
                self.thread_id,
                exc,
            )
            return None

    @staticmethod
    def _history_contains_current_user_message(
        conversation_history: List[Dict[str, str]],
        content: str,
    ) -> bool:
        """Return whether recent history already contains the current user message."""
        return any(
            message.get("role") == "user" and message.get("content") == content
            for message in conversation_history[-3:]
        )

    def _stationary_energy_context_message(
        self,
        context_payload: Dict[str, Any],
    ) -> Dict[str, str]:
        """Format a compact Stationary Energy draft snapshot as a system message."""
        budget = get_stationary_energy_prompt_budget(get_settings(), "chat_context")
        baseline_payload = compact_stationary_energy_prompt_payload(
            context_payload,
            budget=budget,
            drop_source_data=True,
        )
        baseline_payload["prompt_budget_compaction"].update(
            {
                "chat_baseline": True,
                "source_data_included": False,
            },
        )
        initial_message = format_stationary_energy_context_message(
            baseline_payload,
        )
        instruction_text = self._agent_instruction_text()
        initial_count = count_prompt_tokens(
            [instruction_text, initial_message],
            model=self.agent_model,
            fallback_encoding=budget.tokenizer_encoding,
        )
        if initial_count.tokens <= budget.max_prompt_tokens:
            logger.info(
                "Stationary Energy chat context tokens=%s max_prompt_tokens=%s tokenizer=%s compacted=%s",
                initial_count.tokens,
                budget.max_prompt_tokens,
                initial_count.tokenizer,
                True,
            )
            return initial_message

        compacted_payload = build_minimal_stationary_energy_context_payload(
            baseline_payload,
            initial_tokens=initial_count.tokens,
            compacted_tokens=initial_count.tokens,
            max_prompt_tokens=budget.max_prompt_tokens,
        )
        compacted_message = format_stationary_energy_context_message(
            compacted_payload,
        )
        compacted_count = count_prompt_tokens(
            [instruction_text, compacted_message],
            model=self.agent_model,
            fallback_encoding=budget.tokenizer_encoding,
        )

        if compacted_count.tokens > budget.max_prompt_tokens:
            compacted_message = format_stationary_energy_context_message(
                build_minimal_stationary_energy_context_payload(
                    baseline_payload,
                    initial_tokens=initial_count.tokens,
                    compacted_tokens=compacted_count.tokens,
                    max_prompt_tokens=budget.max_prompt_tokens,
                )
            )
            compacted_count = count_prompt_tokens(
                [instruction_text, compacted_message],
                model=self.agent_model,
                fallback_encoding=budget.tokenizer_encoding,
            )

        logger.info(
            "Stationary Energy chat context tokens=%s initial_tokens=%s max_prompt_tokens=%s tokenizer=%s compacted=%s",
            compacted_count.tokens,
            initial_count.tokens,
            budget.max_prompt_tokens,
            compacted_count.tokenizer,
            True,
        )
        return compacted_message

    def _enforce_chat_prompt_budget(
        self,
        agent: Any,
        runner_input: List[Dict[str, str]],
    ) -> List[Dict[str, str]]:
        """Trim chat input to the Stationary Energy prompt budget."""
        # Count the full agent instructions plus runner input against the chat budget.
        budget = get_stationary_energy_prompt_budget(get_settings(), "chat_context")
        trimmed_input, token_count, removed_messages = trim_messages_to_budget(
            runner_input,
            instruction_text=self._agent_instruction_text(agent),
            model=self.agent_model,
            budget=budget,
        )
        if removed_messages:
            logger.info(
                "Trimmed %s conversation messages from Stationary Energy chat prompt to fit token budget",
                removed_messages,
            )
        # Fail loudly if even the compacted workflow context exceeds the budget.
        if token_count.tokens > budget.max_prompt_tokens:
            raise ValueError(
                "Stationary Energy chat prompt exceeds configured token budget "
                f"({token_count.tokens} > {budget.max_prompt_tokens})",
            )
        logger.info(
            "Stationary Energy chat prompt tokens=%s max_prompt_tokens=%s tokenizer=%s",
            token_count.tokens,
            budget.max_prompt_tokens,
            token_count.tokenizer,
        )
        return trimmed_input

    def _agent_instruction_text(self, agent: Any | None = None) -> str:
        """Return the active agent instruction text used for token accounting."""
        instructions = getattr(agent, "instructions", None)
        if instructions:
            return str(instructions)
        if self.agent_service:
            return str(
                getattr(self.agent_service, "active_instructions", None)
                or getattr(self.agent_service, "system_prompt", "")
                or ""
            )
        return ""

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
        # Stationary Energy chats carry more context, so enforce the configured budget.
        if self.stationary_energy_draft_run_id and isinstance(runner_input, list):
            runner_input = self._enforce_chat_prompt_budget(agent, runner_input)

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
            async for event_bytes in self._fallback_stream(agent, payload):
                yield event_bytes
            return

        # Convert SDK stream events into the app's SSE event contract.
        async for chunk in result.stream_events():
            async for event_bytes in self._process_chunk(chunk):
                yield event_bytes

    def _run_config(self, payload: MessageCreateRequest) -> RunConfig:
        """Build trace metadata and execution options for one streamed run."""
        # Resolve workflow context for trace naming and metadata classification.
        settings = get_settings()
        req_id = get_request_id()
        draft_run_id = (
            extract_stationary_energy_draft_run_id(
                payload.context,
                payload.options,
                self.request_context,
                self.request_options,
            )
            or self.stationary_energy_draft_run_id
        )
        has_stationary_energy_context = bool(draft_run_id)
        workflow_name = (
            "Climate Advisor Stationary Energy Context Chat"
            if has_stationary_energy_context
            else "Climate Advisor Conversation"
        )
        # Keep trace metadata low-cardinality except for scoped request ids.
        trace_metadata: dict[str, Any] = {
            "service": "climate-advisor",
            "workflow": (
                "stationary_energy_context_chat"
                if has_stationary_energy_context
                else "climate_advisor_conversation"
            ),
            "trace_category": (
                "ca_agentic_context_chat"
                if has_stationary_energy_context
                else "normal_conversation"
            ),
            "ca_agentic_flow": has_stationary_energy_context,
            "context_mode": (
                "stationary_energy_draft"
                if has_stationary_energy_context
                else "general"
            ),
            "request_id": req_id,
            "thread_id": self.thread_identifier,
            "inventory_id": self.inventory_id,
        }
        if has_stationary_energy_context:
            trace_metadata["feature_flag"] = "STATIONARY_ENERGY_AGENTIC"
            trace_metadata["stationary_energy_draft_run_id"] = str(draft_run_id)

        # Disable tracing from central settings without changing stream behavior.
        return RunConfig(
            workflow_name=workflow_name,
            trace_id=gen_trace_id(),
            group_id=self.thread_identifier,
            trace_metadata=trace_metadata,
            tracing_disabled=not settings.langsmith_tracing_enabled,
        )

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

    async def _process_chunk(self, chunk: Any) -> AsyncIterator[bytes]:
        """Process a single chunk from the stream."""
        chunk_type = chunk.type

        if chunk_type == "raw_response_event":
            async for event_bytes in self._handle_raw_response(chunk):
                yield event_bytes

        elif chunk_type == "run_item_stream_event":
            async for event_bytes in self._handle_run_item(chunk):
                yield event_bytes

        elif chunk_type == "agent_updated_stream_event":
            logger.info(
                "Agent updated during streaming for thread_id=%s", self.thread_id
            )

        else:
            logger.debug("Unhandled stream event type: %s", chunk_type)

    async def _handle_raw_response(self, chunk: Any) -> AsyncIterator[bytes]:
        """Handle raw response events (text deltas, errors, etc)."""
        # Ignore empty SDK event shells; there is nothing to send over SSE.
        response_event = getattr(chunk, "data", None)
        if not response_event:
            return

        response_type = getattr(response_event, "type", "")

        # Stream text/refusal deltas as message events and preserve token order.
        if response_type in {"response.output_text.delta", "response.refusal.delta"}:
            content = getattr(response_event, "delta", "")
            if content:
                self.assistant_tokens.append(content)
                yield format_sse(
                    {"index": self.token_index, "content": content},
                    event="message",
                    id=str(self.token_index),
                ).encode("utf-8")
                self.token_index += 1

        # Surface SDK error events to the client and mark the stream as failed.
        elif response_type == "error":
            error_message = getattr(response_event, "message", "Streaming error")
            logger.error("Received error event from Responses API: %s", error_message)
            self.streaming_error = True
            yield format_sse(
                {"message": error_message},
                event="error",
            ).encode("utf-8")

        elif response_type == "response.completed":
            logger.info(
                "Received response.completed event for thread_id=%s", self.thread_id
            )

        else:
            logger.debug("Unhandled raw response event type: %s", response_type)

    async def _handle_run_item(self, chunk: Any) -> AsyncIterator[bytes]:
        """Handle run item stream events (tool calls, tool outputs)."""
        event_name = getattr(chunk, "name", "")
        run_item = getattr(chunk, "item", None)

        if event_name == "tool_called" and run_item is not None:
            async for event_bytes in self._handle_tool_called(run_item):
                yield event_bytes

        elif event_name == "tool_output" and run_item is not None:
            async for event_bytes in self._handle_tool_output(run_item):
                yield event_bytes

        else:
            logger.debug("Unhandled run item event: %s", event_name)

    async def _handle_tool_called(self, run_item: Any) -> AsyncIterator[bytes]:
        """Handle tool called events."""
        raw_item = getattr(run_item, "raw_item", None)
        tool_name = getattr(raw_item, "name", None) or getattr(
            raw_item, "type", "unknown_tool"
        )
        call_id = getattr(raw_item, "call_id", None) or getattr(raw_item, "id", None)

        arguments: Any = getattr(raw_item, "arguments", None)
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                pass

        # Find or create invocation record
        existing = None
        for inv in self.tool_invocations:
            if (call_id and inv.get("id") == call_id) or inv.get("name") == tool_name:
                existing = inv
                break

        if existing is None:
            invocation = {
                "id": call_id,
                "name": tool_name,
                "arguments": arguments,
                "status": "executing",
            }
            self.tool_invocations.append(invocation)
        else:
            invocation = existing
            invocation["arguments"] = invocation.get("arguments") or arguments
            invocation["status"] = "executing"

        yield format_sse(
            {
                "name": invocation.get("name", "unknown_tool"),
                "status": invocation.get("status", "executing"),
                "arguments": invocation.get("arguments"),
            },
            event="tool_result",
        ).encode("utf-8")

    async def _handle_tool_output(self, run_item: Any) -> AsyncIterator[bytes]:
        """Handle tool output events."""
        raw_item = getattr(run_item, "raw_item", None)
        call_id = None
        if isinstance(raw_item, dict):
            call_id = raw_item.get("call_id")
        else:
            call_id = getattr(raw_item, "call_id", None) or getattr(
                raw_item, "id", None
            )

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
        for inv in self.tool_invocations:
            if (call_id and inv.get("id") == call_id) or inv.get(
                "status"
            ) == "executing":
                invocation = inv
                break

        if invocation is None:
            invocation = {
                "id": call_id,
                "name": getattr(raw_item, "name", "unknown_tool"),
                "arguments": None,
            }
            self.tool_invocations.append(invocation)

        invocation["status"] = "success"
        invocation["result"] = str(output_value) if output_value is not None else ""
        if parsed_output is not None:
            invocation["result_json"] = parsed_output

        # Handle token refresh and errors
        if parsed_output is not None:
            async for event_bytes in self._handle_tool_result_metadata(parsed_output):
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

    async def _handle_tool_result_metadata(
        self, parsed_output: dict
    ) -> AsyncIterator[bytes]:
        """Handle metadata in tool results (token refresh, errors)."""
        # Handle token refresh
        if self.token_handler:
            refreshed_token = parsed_output.get("refreshed_token")
            if refreshed_token and refreshed_token != self.cc_access_token:
                await self.token_handler.handle_refreshed_token(
                    refreshed_token, self.agent_service
                )
                self.cc_access_token = refreshed_token

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

    def _format_completion_event(self, req_id: str, ok: bool = None) -> bytes:
        """Format the final completion event."""
        if ok is None:
            ok = not self.streaming_error

        if ok:
            # Persist assistant message
            if self.assistant_tokens:
                assistant_content = "".join(self.assistant_tokens)
                # Note: persist_assistant_message is async, but we can't await in sync method
                # This should be handled in the calling async context

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
            tool_invocations=self.tool_invocations or None,
        )
        return self.history_saved

    def _mlflow_experiment_name(self, payload: MessageCreateRequest) -> str:
        """Return the MLflow experiment for the current chat workflow."""
        return climate_advisor_experiment_name()

    def _mlflow_run_name(self, payload: MessageCreateRequest) -> str:
        """Return the MLflow run name for the current chat workflow."""
        if self._has_agentic_context(payload):
            return "stationary_energy_context_chat_request"
        return "climate_advisor_message_request"

    def _mlflow_tags(self, payload: MessageCreateRequest) -> dict[str, object]:
        """Return low-cardinality MLflow tags for one chat request."""
        draft_run_id = self._draft_run_id_from_payload(payload)
        has_agentic_context = bool(draft_run_id)
        return {
            "request_kind": "message_stream",
            "endpoint": "/v1/messages",
            "workflow": (
                "stationary_energy_context_chat"
                if has_agentic_context
                else "climate_advisor_conversation"
            ),
            "trace_category": (
                "ca_agentic_context_chat"
                if has_agentic_context
                else "normal_conversation"
            ),
            "ca_agentic_flow": has_agentic_context,
            "context_mode": (
                "stationary_energy_draft" if has_agentic_context else "general"
            ),
            "request_id": get_request_id(),
            "thread_id": self.thread_identifier,
            "user_id": self.user_id,
            "inventory_id": payload.inventory_id or self.inventory_id,
            "stationary_energy_draft_run_id": draft_run_id,
        }

    def _mlflow_params(self, payload: MessageCreateRequest) -> dict[str, object]:
        """Return stable MLflow params for one chat request."""
        options = payload.options or {}
        context = payload.context if isinstance(payload.context, dict) else {}
        return {
            "content_length": len(payload.content),
            "has_context": bool(payload.context),
            "has_options": bool(options),
            "has_inventory_id": bool(payload.inventory_id or self.inventory_id),
            "model_override": options.get("model"),
            "context_keys": sorted(context.keys()),
            "option_keys": sorted(options.keys()),
        }

    def _draft_run_id_from_payload(self, payload: MessageCreateRequest) -> str | None:
        """Return a Stationary Energy draft id from handler state or request payload."""
        return (
            self.stationary_energy_draft_run_id
            or extract_stationary_energy_draft_run_id(
                payload.context,
                payload.options,
                self.request_context,
                self.request_options,
            )
        )

    async def _prime_mlflow_workflow_context(
        self,
        payload: MessageCreateRequest,
    ) -> None:
        """Resolve thread-stored workflow context before opening the MLflow run."""
        draft_run_id_text = self._draft_run_id_from_payload(payload)
        if not draft_run_id_text:
            draft_run_id_text = await self._load_thread_stationary_energy_draft_run_id()
        if not draft_run_id_text:
            return

        try:
            self.stationary_energy_draft_run_id = str(UUID(str(draft_run_id_text)))
        except ValueError:
            logger.warning(
                "Ignoring invalid Stationary Energy draft_run_id before MLflow run: %s",
                draft_run_id_text,
            )

    def _has_agentic_context(self, payload: MessageCreateRequest) -> bool:
        """Return whether this chat request belongs to the agentic workflow."""
        return bool(self._draft_run_id_from_payload(payload))

    def _log_mlflow_stream_summary(
        self,
        *,
        ok: bool,
        started_at: float,
    ) -> None:
        """Log final chat artifacts and metrics for the active MLflow run."""
        assistant_content = "".join(self.assistant_tokens)
        duration_ms = (time.perf_counter() - started_at) * 1000
        log_metrics(
            {
                "duration_ms": duration_ms,
                "assistant_characters": len(assistant_content),
                "assistant_chunks": len(self.assistant_tokens),
                "tool_invocations": len(self.tool_invocations),
                "history_saved": int(self.history_saved),
                "ok": int(ok),
            }
        )
        log_text_artifact("chat/assistant_response.txt", assistant_content)
        log_json_artifact(
            "chat/tool_invocations.json",
            {"tool_invocations": self.tool_invocations},
        )
        log_json_artifact(
            "response/stream_summary.json",
            {
                "ok": ok,
                "history_saved": self.history_saved,
                "thread_id": self.thread_identifier,
                "model": self.agent_model,
                "assistant_characters": len(assistant_content),
                "tool_invocation_count": len(self.tool_invocations),
            },
        )
