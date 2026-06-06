"""SSE Streaming handler for agent responses."""

from __future__ import annotations

import inspect
import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID

from agents import RunConfig, Runner, gen_trace_id
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.middleware import get_request_id
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.services.message_service import MessageService
from app.services.stationary_energy_draft_repository import StationaryEnergyDraftRepository
from app.services.thread_service import ThreadService
from app.utils.sse import format_sse
from app.utils.stationary_energy_context import extract_stationary_energy_draft_run_id
from app.utils.tool_handler import persist_assistant_message
from app.utils.token_handler import TokenHandler
from app.utils.history_manager import load_conversation_history
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
    ):
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
            # Create agent service
            self.agent_service = AgentService(
                cc_access_token=self.cc_access_token,
                cc_thread_id=self.thread_id,
                cc_user_id=self.user_id,
                inventory_id=self.inventory_id,
            )

            # Get model override from options
            options = payload.options or {}
            model_override = options.get("model")
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

            self.agent_model = model_override or self.agent_service.preferred_model_for_context(
                stationary_energy_draft_run_id=self.stationary_energy_draft_run_id,
            )
            logger.info(
                "Selected chat model=%s stationary_energy_context=%s thread_id=%s",
                self.agent_model,
                bool(self.stationary_energy_draft_run_id),
                self.thread_id,
            )

            agent = await self.agent_service.create_agent(model=self.agent_model)

            # Load conversation history
            conversation_history = await self._load_conversation_history(settings, payload)

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
            yield self._format_completion_event(req_id)

        except Exception as exc:
            logger.exception("Unhandled exception in Agents SDK streaming")
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
        settings,
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
        conversation_history = await load_conversation_history(
            thread_id=self.thread_id,
            user_id=self.user_id,
            session_factory=self.session_factory,
        )
        stationary_energy_context = await self._load_stationary_energy_context_message(payload)
        if stationary_energy_context:
            conversation_history = [stationary_energy_context, *conversation_history]
            if not self._history_contains_current_user_message(
                conversation_history,
                payload.content,
            ):
                conversation_history.append(
                    {"role": "user", "content": payload.content}
                )

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

        try:
            draft_run_id = UUID(str(draft_run_id_text))
        except ValueError:
            logger.warning(
                "Ignoring invalid Stationary Energy draft_run_id in chat context: %s",
                draft_run_id_text,
            )
            return None

        self.stationary_energy_draft_run_id = str(draft_run_id)

        if not self.session_factory:
            logger.debug("Session factory unavailable; Stationary Energy draft context skipped")
            return None

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

        context_payload = self._stationary_energy_context_payload(draft_run)
        return self._stationary_energy_context_message(context_payload)

    async def _load_thread_stationary_energy_draft_run_id(self) -> Optional[str]:
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
        return any(
            message.get("role") == "user" and message.get("content") == content
            for message in conversation_history[-3:]
        )

    @staticmethod
    def _stationary_energy_context_payload(draft_run) -> Dict[str, Any]:
        """Build the persisted draft snapshot used to ground Stationary Energy chat."""
        context_summary = draft_run.context_summary or {}
        llm_trace = context_summary.get("llm_trace") if isinstance(context_summary, dict) else None
        llm_generation = None
        if isinstance(llm_trace, dict):
            parsed_output = llm_trace.get("parsed_output")
            llm_generation = {
                "model": llm_trace.get("model"),
                "temperature": llm_trace.get("temperature"),
                "usage": llm_trace.get("usage"),
                "proposal_count": (
                    len(parsed_output.get("proposals"))
                    if isinstance(parsed_output, dict)
                    and isinstance(parsed_output.get("proposals"), list)
                    else None
                ),
            }

        return {
            "draft_run": {
                "draft_run_id": str(draft_run.draft_run_id),
                "thread_id": str(draft_run.thread_id) if draft_run.thread_id else None,
                "city_id": draft_run.city_id,
                "inventory_id": draft_run.inventory_id,
                "sector_code": draft_run.sector_code,
                "status": draft_run.status,
                "workflow_step": draft_run.workflow_step,
                "trace_id": draft_run.trace_id,
                "created_at": draft_run.created_at,
                "updated_at": draft_run.updated_at,
            },
            "city": context_summary.get("city") if isinstance(context_summary, dict) else None,
            "inventory": context_summary.get("inventory") if isinstance(context_summary, dict) else None,
            "context_counts": {
                "taxonomy_count": context_summary.get("taxonomy_count")
                if isinstance(context_summary, dict)
                else None,
                "current_values_count": context_summary.get("current_values_count")
                if isinstance(context_summary, dict)
                else None,
                "source_candidates_count": context_summary.get("source_candidates_count")
                if isinstance(context_summary, dict)
                else None,
            },
            "permission_summary": draft_run.permission_summary,
            "guidance_context": (
                context_summary.get("guidance_context")
                if isinstance(context_summary, dict)
                else None
            ),
            "llm_generation": llm_generation,
            "source_candidates": [
                {
                    "candidate_id": str(candidate.candidate_id),
                    "datasource_id": candidate.datasource_id,
                    "name": candidate.name,
                    "publisher_name": candidate.publisher_name,
                    "retrieval_method": candidate.retrieval_method,
                    "dataset_name": candidate.dataset_name,
                    "dataset_year": candidate.dataset_year,
                    "url": candidate.url,
                    "geography_match": candidate.geography_match,
                    "source_scope": candidate.source_scope,
                    "source_data": candidate.source_data,
                    "normalized_rows": candidate.normalized_rows,
                    "applicability_status": candidate.applicability_status,
                    "applicability_issues": candidate.applicability_issues,
                    "failure_reason": candidate.failure_reason,
                    "quality_score": candidate.quality_score,
                    "confidence_notes": candidate.confidence_notes,
                }
                for candidate in draft_run.source_candidates
            ],
            "proposals": [
                {
                    "proposal_id": str(proposal.proposal_id),
                    "target_ref": proposal.target_ref,
                    "current_value": proposal.current_value,
                    "recommended_candidate_id": str(proposal.recommended_candidate_id)
                    if proposal.recommended_candidate_id
                    else None,
                    "recommended_datasource_id": proposal.recommended_datasource_id,
                    "alternative_candidate_ids": proposal.alternative_candidate_ids,
                    "proposed_value": proposal.proposed_value,
                    "rationale": proposal.rationale,
                    "status": proposal.status,
                    "confidence_score": proposal.confidence_score,
                }
                for proposal in draft_run.proposals
            ],
            "review_decisions": [
                {
                    "decision_id": str(decision.decision_id),
                    "proposal_id": str(decision.proposal_id),
                    "decision_version": decision.decision_version,
                    "action": decision.action,
                    "selected_source_id": decision.selected_source_id,
                    "selected_candidate_id": str(decision.selected_candidate_id)
                    if decision.selected_candidate_id
                    else None,
                    "manual_value": decision.manual_value,
                    "manual_unit": decision.manual_unit,
                    "note": decision.note,
                    "commit_status": decision.commit_status,
                    "commit_response": decision.commit_response,
                    "created_at": decision.created_at,
                }
                for decision in sorted(
                    draft_run.review_decisions,
                    key=lambda item: (
                        str(item.proposal_id),
                        item.decision_version,
                        str(item.decision_id),
                    ),
                )
            ],
        }

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
        initial_message = self._format_stationary_energy_context_message(
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

        compacted_payload = self._minimal_stationary_energy_context_payload(
            baseline_payload,
            initial_tokens=initial_count.tokens,
            compacted_tokens=initial_count.tokens,
            max_prompt_tokens=budget.max_prompt_tokens,
        )
        compacted_message = self._format_stationary_energy_context_message(
            compacted_payload,
        )
        compacted_count = count_prompt_tokens(
            [instruction_text, compacted_message],
            model=self.agent_model,
            fallback_encoding=budget.tokenizer_encoding,
        )

        if compacted_count.tokens > budget.max_prompt_tokens:
            compacted_message = self._format_stationary_energy_context_message(
                self._minimal_stationary_energy_context_payload(
                    baseline_payload,
                    initial_tokens=initial_count.tokens,
                    compacted_tokens=compacted_count.tokens,
                    max_prompt_tokens=budget.max_prompt_tokens,
                ),
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
        agent,
        runner_input: List[Dict[str, str]],
    ) -> List[Dict[str, str]]:
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

    @staticmethod
    def _format_stationary_energy_context_message(
        context_payload: Dict[str, Any],
    ) -> Dict[str, str]:
        return {
            "role": "system",
            "content": (
                "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\n"
                f"{json.dumps(context_payload, ensure_ascii=False, default=str)}\n"
                "Use this authoritative persisted CA draft snapshot to explain the Stationary Energy "
                "screen the user is viewing. Do not re-fetch data. Do not invent missing values. "
                "Treat source_candidates, proposals, review_decisions, llm_generation, and guidance_context "
                "as the ground truth for this draft."
            ),
        }

    def _agent_instruction_text(self, agent: Any | None = None) -> str:
        instructions = getattr(agent, "instructions", None)
        if instructions:
            return str(instructions)
        if self.agent_service:
            return str(getattr(self.agent_service, "system_prompt", "") or "")
        return ""

    @staticmethod
    def _minimal_stationary_energy_context_payload(
        context_payload: Dict[str, Any],
        *,
        initial_tokens: int,
        compacted_tokens: int,
        max_prompt_tokens: int,
    ) -> Dict[str, Any]:
        return {
            "draft_run": context_payload.get("draft_run"),
            "city": context_payload.get("city"),
            "inventory": context_payload.get("inventory"),
            "context_counts": context_payload.get("context_counts"),
            "permission_summary": context_payload.get("permission_summary"),
            "guidance_context": context_payload.get("guidance_context"),
            "prompt_budget_compaction": {
                "minimal_snapshot": True,
                "initial_tokens": initial_tokens,
                "compacted_tokens": compacted_tokens,
                "max_prompt_tokens": max_prompt_tokens,
                "omitted_fields": [
                    "source_candidates",
                    "proposals",
                    "review_decisions",
                    "llm_generation",
                ],
            },
        }

    async def _stream_agent_events(
        self,
        agent,
        payload: MessageCreateRequest,
        conversation_history: List[Dict[str, str]],
    ) -> AsyncIterator[bytes]:
        """Stream events from the agent."""
        runner_input: Any = (
            conversation_history if conversation_history else payload.content
        )
        if self.stationary_energy_draft_run_id and isinstance(runner_input, list):
            runner_input = self._enforce_chat_prompt_budget(agent, runner_input)

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

        async for chunk in result.stream_events():
            async for event_bytes in self._process_chunk(chunk):
                yield event_bytes

    def _run_config(self, payload: MessageCreateRequest) -> RunConfig:
        settings = get_settings()
        req_id = get_request_id()
        draft_run_id = extract_stationary_energy_draft_run_id(
            payload.context,
            payload.options,
            self.request_context,
            self.request_options,
        ) or self.stationary_energy_draft_run_id
        has_stationary_energy_context = bool(draft_run_id)
        workflow_name = (
            "Climate Advisor Stationary Energy Context Chat"
            if has_stationary_energy_context
            else "Climate Advisor Conversation"
        )
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

        return RunConfig(
            workflow_name=workflow_name,
            trace_id=gen_trace_id(),
            group_id=self.thread_identifier,
            trace_metadata=trace_metadata,
            tracing_disabled=not settings.langsmith_tracing_enabled,
        )

    async def _fallback_stream(
        self, agent, payload: MessageCreateRequest
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

    async def _process_chunk(self, chunk) -> AsyncIterator[bytes]:
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

    async def _handle_raw_response(self, chunk) -> AsyncIterator[bytes]:
        """Handle raw response events (text deltas, errors, etc)."""
        response_event = getattr(chunk, "data", None)
        if not response_event:
            return

        response_type = getattr(response_event, "type", "")

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

    async def _handle_run_item(self, chunk) -> AsyncIterator[bytes]:
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

    async def _handle_tool_called(self, run_item) -> AsyncIterator[bytes]:
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

    async def _handle_tool_output(self, run_item) -> AsyncIterator[bytes]:
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
