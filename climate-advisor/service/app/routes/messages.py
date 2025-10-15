from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID, uuid4

from agents import Runner
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langsmith.wrappers import OpenAIAgentsTracingProcessor
from agents import set_trace_processors
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import get_settings
from ..db.session import get_session_optional, get_session_factory
from ..middleware import get_request_id
from ..models.requests import MessageCreateRequest
from ..services.agent_service import AgentService
from ..services.message_service import MessageService
from ..services.thread_service import ThreadService
from ..utils.sse import format_sse
from ..utils.tool_handler import persist_assistant_message

logger = logging.getLogger(__name__)

router = APIRouter()

# Configure LangSmith tracing for Agents SDK
settings = get_settings()
if settings.langsmith_tracing_enabled:
    try:
        trace_metadata = {"service": settings.app_name}
        set_trace_processors(
            [
                OpenAIAgentsTracingProcessor(
                    project_name=settings.langsmith_project,
                    metadata=trace_metadata,
                )
            ]
        )
        logger.info("LangSmith tracing enabled for Agents SDK")
    except Exception as exc:
        logger.warning("Failed to initialize LangSmith tracing: %s", exc)


async def _stream_with_agents_sdk(
    payload: MessageCreateRequest,
    *,
    thread_id: Union[str, UUID],
    user_id: str,
    session_factory: Optional[async_sessionmaker[AsyncSession]],
    history_warning: Optional[str] = None,
) -> AsyncIterator[bytes]:
    """Stream AI responses using OpenAI Agents SDK with OpenRouter.
    
    This function replaces the manual OpenAI SDK streaming with the Agents SDK,
    providing built-in tool orchestration, streaming, and LangSmith tracing.
    """
    req_id = get_request_id()
    settings = get_settings()
    
    # Send history warning if database is unavailable
    if history_warning:
        warning_payload = {"message": history_warning, "thread_id": str(thread_id)}
        yield format_sse(warning_payload, event="warning").encode("utf-8")
    
    # Get model override from options (temperature is configured globally in llm_config.yaml)
    options = payload.options or {}
    model_override = options.get("model")
    
    # Track response state
    assistant_tokens: List[str] = []
    tool_invocations: List[dict] = []
    token_index = 0
    history_saved = False
    streaming_error = False  # Track if streaming encountered an error
    agent_service: Optional[AgentService] = None
    
    try:
        # Create agent service and agent
        agent_service = AgentService()
        agent = await agent_service.create_agent(
            model=model_override
        )
        
        # Load conversation history if database is available and history is enabled
        conversation_history = []
        if session_factory and settings.llm.conversation and settings.llm.conversation.include_history:
            try:
                async with session_factory() as hist_session:
                    message_service = MessageService(hist_session)
                    history_limit = settings.llm.conversation.history_limit or 5
                    
                    # Get recent messages from thread (excluding the current user message)
                    messages = await message_service.get_thread_messages(
                        thread_id=thread_id,
                        limit=history_limit
                    )
                    
                    # Format messages for Agents SDK
                    for msg in messages:
                        conversation_history.append({
                            "role": msg.role.value,
                            "content": msg.text
                        })
                    
                    logger.info(
                        "Loaded %d messages from conversation history for thread_id=%s",
                        len(conversation_history),
                        thread_id
                    )
            except Exception as e:
                logger.warning("Failed to load conversation history: %s", e)
        
        logger.info(
            "Starting Agents SDK streaming - thread_id=%s, user_id=%s, request_id=%s",
            thread_id,
            user_id,
            req_id
        )
        
        # Stream responses from the agent with conversation history
        # If we have history, pass it along with the current message
        if conversation_history:
            # Add current user message to history
            conversation_history.append({
                "role": "user",
                "content": payload.content
            })
            result = Runner.run_streamed(agent, conversation_history)
        else:
            # No history, just pass the current message
            result = Runner.run_streamed(agent, payload.content)
        async for chunk in result.stream_events():
            chunk_type = chunk.type

            if chunk_type == "raw_response_event":
                response_event = getattr(chunk, "data", None)
                if not response_event:
                    continue
                response_type = getattr(response_event, "type", "")

                if response_type in {
                    "response.output_text.delta",
                    "response.refusal.delta",
                }:
                    content = getattr(response_event, "delta", "")
                    if content:
                        assistant_tokens.append(content)
                        yield format_sse(
                            {"index": token_index, "content": content},
                            event="message",
                            id=str(token_index),
                        ).encode("utf-8")
                        token_index += 1

                elif response_type == "error":
                    error_message = getattr(response_event, "message", "Streaming error")
                    logger.error("Received error event from Responses API: %s", error_message)
                    streaming_error = True  # Mark that we encountered an error
                    yield format_sse(
                        {"message": error_message},
                        event="error",
                    ).encode("utf-8")
                    # Don't persist message on streaming error
                    break

                elif response_type == "response.completed":
                    logger.info("Received response.completed event for thread_id=%s", thread_id)

                else:
                    logger.debug("Unhandled raw response event type: %s", response_type)

            elif chunk_type == "run_item_stream_event":
                event_name = getattr(chunk, "name", "")
                run_item = getattr(chunk, "item", None)

                if event_name == "tool_called" and run_item is not None:
                    raw_item = getattr(run_item, "raw_item", None)
                    tool_name = getattr(raw_item, "name", None) or getattr(raw_item, "type", "unknown_tool")
                    call_id = getattr(raw_item, "call_id", None) or getattr(raw_item, "id", None)

                    arguments: Any = getattr(raw_item, "arguments", None)
                    if isinstance(arguments, str):
                        try:
                            arguments = json.loads(arguments)
                        except json.JSONDecodeError:
                            pass

                    existing = None
                    for inv in tool_invocations:
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
                        tool_invocations.append(invocation)
                    else:
                        invocation = existing
                        invocation["arguments"] = invocation.get("arguments") or arguments
                        invocation["status"] = "executing"

                    yield format_sse(
                        {
                            "name": invocation.get("name", "unknown_tool"),
                            "status": invocation.get("status"),
                            "arguments": invocation.get("arguments"),
                        },
                        event="tool_result",
                    ).encode("utf-8")

                elif event_name == "tool_output" and run_item is not None:
                    raw_item = getattr(run_item, "raw_item", None)
                    call_id = None
                    if isinstance(raw_item, dict):
                        call_id = raw_item.get("call_id")
                    else:
                        call_id = getattr(raw_item, "call_id", None) or getattr(raw_item, "id", None)

                    output_value = getattr(run_item, "output", None)
                    output_preview = str(output_value)[:200] if output_value is not None else ""

                    invocation = None
                    for inv in tool_invocations:
                        if (call_id and inv.get("id") == call_id) or inv.get("status") == "executing":
                            invocation = inv
                            break

                    if invocation is None:
                        invocation = {
                            "id": call_id,
                            "name": getattr(raw_item, "name", "unknown_tool"),
                            "arguments": None,
                        }
                        tool_invocations.append(invocation)

                    invocation["status"] = "success"
                    invocation["result"] = str(output_value)[:500] if output_value is not None else ""

                    yield format_sse(
                        {
                            "name": invocation.get("name", "unknown_tool"),
                            "status": invocation.get("status"),
                            "result": output_preview,
                        },
                        event="tool_result",
                    ).encode("utf-8")

                else:
                    logger.debug("Unhandled run item event: %s", event_name)

            elif chunk_type == "agent_updated_stream_event":
                logger.info("Agent updated during streaming for thread_id=%s", thread_id)

            else:
                logger.debug("Unhandled stream event type: %s", chunk_type)
        
        # Only persist if streaming completed successfully (no errors)
        if not streaming_error:
            assistant_content = "".join(assistant_tokens)
            if assistant_content:
                history_saved = await persist_assistant_message(
                    session_factory=session_factory,
                    thread_id=thread_id,
                    user_id=user_id,
                    assistant_content=assistant_content,
                    tool_invocations=tool_invocations or None,
                )
            
            # Send completion event for successful streaming
            yield format_sse(
                {
                    "ok": True,
                    "request_id": req_id,
                    "history_saved": history_saved,
                    "thread_id": str(thread_id),
                    "tools_used": tool_invocations or None,
                },
                event="done",
            ).encode("utf-8")
        else:
            # Send done event with error status (error SSE was already sent above)
            yield format_sse(
                {
                    "ok": False,
                    "request_id": req_id,
                    "history_saved": False,
                    "thread_id": str(thread_id),
                    "error": "Streaming error occurred",
                },
                event="done",
            ).encode("utf-8")
        
    except Exception as exc:
        logger.exception("Unhandled exception in Agents SDK streaming")
        yield format_sse(
            {"message": "An internal error has occurred."},
            event="error"
        ).encode("utf-8")
        yield format_sse(
            {
                "ok": False,
                "request_id": req_id,
                "history_saved": history_saved,
                "thread_id": str(thread_id),
                "tools_used": tool_invocations or None,
            },
            event="done",
        ).encode("utf-8")
    
    finally:
        # Clean up agent service
        if agent_service:
            await agent_service.close()


@router.post("/messages")
async def post_message(
    payload: MessageCreateRequest,
    session: AsyncSession | None = Depends(get_session_optional),
):
    base_warning = (
        "Chat history is temporarily unavailable. The conversation will continue, "
        "but your messages will not be saved."
    )
    temp_thread_warning = (
        "Chat history is temporarily unavailable. A temporary thread was created for this session, "
        "and your messages will not be saved."
    )
    history_warning: Optional[str] = None
    assistant_session_factory: Optional[async_sessionmaker[AsyncSession]] = None
    resolved_user_id: str = payload.user_id

    if payload.thread_id:
        resolved_thread_id: Union[str, UUID] = payload.thread_id
    elif session is None:
        temp_thread_id = uuid4()
        resolved_thread_id = temp_thread_id
        history_warning = temp_thread_warning
        logging.error(
            "Database session unavailable; using temporary thread %s for user %s",
            temp_thread_id,
            resolved_user_id,
        )
    else:
        raise HTTPException(status_code=400, detail="thread_id is required")

    if session is None:
        logging.error("Database session unavailable; continuing without chat history persistence")
        history_warning = history_warning or base_warning
    else:
        thread_service = ThreadService(session)
        try:
            thread = await thread_service.get_thread_for_user(resolved_thread_id, payload.user_id)
        except HTTPException:
            raise
        except Exception:
            try:
                await session.rollback()
            except Exception:
                logging.exception("Failed to rollback session after thread load failure")
            logging.exception("Failed to load thread before streaming message")
            history_warning = history_warning or base_warning
        else:
            resolved_thread_id = thread.thread_id
            resolved_user_id = thread.user_id
            message_service = MessageService(session)
            try:
                await message_service.create_user_message(
                    thread_id=thread.thread_id,
                    user_id=payload.user_id,
                    text=payload.content,
                )
                await thread_service.touch_thread(thread)
                await session.commit()
            except Exception:
                try:
                    await session.rollback()
                except Exception:
                    logging.exception("Failed to rollback session after user message persistence failure")
                logging.exception("Failed to persist user message before streaming")
                history_warning = history_warning or base_warning
            else:
                try:
                    assistant_session_factory = get_session_factory()
                except Exception:
                    logging.exception("Failed to acquire session factory for assistant persistence")
                    history_warning = history_warning or base_warning

    if assistant_session_factory is None and history_warning is None:
        history_warning = base_warning

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    stream = _stream_with_agents_sdk(
        payload,
        thread_id=resolved_thread_id,
        user_id=resolved_user_id,
        session_factory=assistant_session_factory,
        history_warning=history_warning,
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)
