"""SSE Streaming handler for agent responses."""

from __future__ import annotations

import inspect
import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID

from agents import Runner
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import get_settings
from ..middleware import get_request_id
from ..models.requests import MessageCreateRequest
from ..services.agent_service import AgentService
from ..services.message_service import MessageService
from ..services.thread_service import ThreadService
from .sse import format_sse
from .tool_handler import persist_assistant_message
from .token_handler import TokenHandler

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
    ):
        self.thread_id = thread_id
        self.user_id = user_id
        self.session_factory = session_factory
        self.cc_access_token = cc_access_token
        self.inventory_id = inventory_id
        self.thread_identifier = str(thread_id)
        
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
            warning_payload = {"message": history_warning, "thread_id": self.thread_identifier}
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
            
            agent = await self.agent_service.create_agent(model=model_override)
            
            # Load conversation history
            conversation_history = await self._load_conversation_history(settings)
            
            logger.info(
                "Starting Agents SDK streaming - thread_id=%s, user_id=%s, request_id=%s",
                self.thread_id,
                self.user_id,
                req_id
            )
            
            # Stream responses from the agent
            async for event_bytes in self._stream_agent_events(agent, payload, conversation_history):
                yield event_bytes
            
            # Send completion event
            yield self._format_completion_event(req_id)
            
        except Exception as exc:
            logger.exception("Unhandled exception in Agents SDK streaming")
            yield format_sse(
                {"message": "An internal error has occurred."},
                event="error"
            ).encode("utf-8")
            yield self._format_completion_event(req_id, ok=False)
        
        finally:
            # Clean up agent service
            if self.agent_service:
                await self.agent_service.close()

    async def _load_conversation_history(self, settings) -> List[Dict[str, str]]:
        """Load conversation history from database if available."""
        conversation_history = []
        
        if not (self.session_factory and settings.llm.conversation and 
                settings.llm.conversation.include_history):
            return conversation_history
        
        try:
            async with self.session_factory() as hist_session:
                message_service = MessageService(hist_session)
                history_limit = settings.llm.conversation.history_limit or 5
                
                messages = await message_service.get_thread_messages(
                    thread_id=self.thread_id,
                    limit=history_limit
                )
                
                for msg in messages:
                    conversation_history.append({
                        "role": msg.role.value,
                        "content": msg.text
                    })
                
                logger.info(
                    "Loaded %d messages from conversation history for thread_id=%s",
                    len(conversation_history),
                    self.thread_id
                )
        except Exception as e:
            logger.warning("Failed to load conversation history: %s", e)
        
        return conversation_history

    async def _stream_agent_events(
        self,
        agent,
        payload: MessageCreateRequest,
        conversation_history: List[Dict[str, str]]
    ) -> AsyncIterator[bytes]:
        """Stream events from the agent."""
        runner_input: Any = conversation_history if conversation_history else payload.content
        
        try:
            result = Runner.run_streamed(agent, runner_input)
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

    async def _fallback_stream(self, agent, payload: MessageCreateRequest) -> AsyncIterator[bytes]:
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
            logger.info("Agent updated during streaming for thread_id=%s", self.thread_id)
        
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
            logger.info("Received response.completed event for thread_id=%s", self.thread_id)
        
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
        tool_name = getattr(raw_item, "name", None) or getattr(raw_item, "type", "unknown_tool")
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
        for inv in self.tool_invocations:
            if (call_id and inv.get("id") == call_id) or inv.get("status") == "executing":
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

    async def _handle_tool_result_metadata(self, parsed_output: dict) -> AsyncIterator[bytes]:
        """Handle metadata in tool results (token refresh, errors)."""
        # Handle token refresh
        if self.token_handler:
            refreshed_token = parsed_output.get("refreshed_token")
            if refreshed_token and refreshed_token != self.cc_access_token:
                await self.token_handler.handle_refreshed_token(refreshed_token, self.agent_service)
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

