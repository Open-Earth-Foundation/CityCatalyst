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
    cc_access_token: Optional[str] = None,
    inventory_id: Optional[str] = None,
) -> AsyncIterator[bytes]:
    """Stream AI responses using OpenAI Agents SDK with OpenRouter.
    
    This function replaces the manual OpenAI SDK streaming with the Agents SDK,
    providing built-in tool orchestration, streaming, and LangSmith tracing.
    
    Args:
        payload: Message creation request
        thread_id: ID of current conversation thread
        user_id: ID of authenticated user (from thread)
        session_factory: Factory for database sessions (may be None)
        history_warning: Warning message if history unavailable
        cc_access_token: JWT token from CityCatalyst for inventory API access
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
    
    # Log token availability for debugging (redact actual token)
    if cc_access_token:
        from ..utils.token_manager import redact_token
        logger.debug("CC access token available: %s", redact_token(cc_access_token))
    else:
        logger.debug("No CC access token available for inventory queries")
    
    # Track response state
    assistant_tokens: List[str] = []
    tool_invocations: List[dict] = []
    token_index = 0
    history_saved = False
    streaming_error = False  # Track if streaming encountered an error
    agent_service: Optional[AgentService] = None
    thread_identifier = str(thread_id)

    async def _handle_refreshed_token(new_token: Optional[str]) -> None:
        nonlocal cc_access_token, agent_service
        if not new_token or new_token == cc_access_token:
            return

        logger.info("Received refreshed CC token for thread_id=%s", thread_identifier)
        cc_access_token = new_token
        if agent_service:
            agent_service.update_cc_token(new_token)

        if session_factory is None:
            logger.warning(
                "Cannot persist refreshed CC token (no session factory available)",
            )
            return

        try:
            async with session_factory() as token_session:
                thread_service = ThreadService(token_session)
                thread = await thread_service.get_thread_for_user(thread_id, user_id)
                await thread_service.update_access_token(thread, new_token)
                await token_session.commit()
                logger.info(
                    "Persisted refreshed CC token for thread_id=%s",
                    thread_identifier,
                )
        except Exception:
            logger.exception(
                "Failed to persist refreshed CC token for thread_id=%s",
                thread_identifier,
            )
    
    try:
        # Create agent service and agent
        # Pass CC token and user_id so tools can access inventory data
        agent_service = AgentService(
            cc_access_token=cc_access_token,
            cc_thread_id=thread_id,
            cc_user_id=user_id,
            inventory_id=inventory_id,
        )
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
        # If we have history loaded from database, use it directly (it already includes the current user message)
        # Otherwise, pass just the current message
        if conversation_history:
            result = Runner.run_streamed(agent, conversation_history)
        else:
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
                    parsed_output: Optional[dict] = None
                    if isinstance(output_value, str):
                        try:
                            parsed_output = json.loads(output_value)
                        except json.JSONDecodeError:
                            parsed_output = None
                    elif isinstance(output_value, dict):
                        parsed_output = output_value

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
                    invocation["result"] = str(output_value) if output_value is not None else ""
                    if parsed_output is not None:
                        invocation["result_json"] = parsed_output

                    if parsed_output is not None:
                        await _handle_refreshed_token(parsed_output.get("refreshed_token"))
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
    # Log incoming request for debugging with detailed information
    logger.info(
        "=== POST /messages request received ===\n"
        "  user_id: %s\n"
        "  thread_id: %r (type: %s, length: %s)\n"
        "  content_length: %d\n"
        "  inventory_id: %s\n"
        "  has_options: %s",
        payload.user_id,
        payload.thread_id,
        type(payload.thread_id).__name__ if payload.thread_id else "None",
        len(payload.thread_id) if payload.thread_id else "N/A",
        len(payload.content),
        payload.inventory_id,
        bool(payload.options)
    )
    
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
    resolved_inventory_id: Optional[str] = payload.inventory_id
    cc_access_token: Optional[str] = None  # Token from CityCatalyst for inventory queries

    if payload.thread_id:
        # Validate thread_id is a valid UUID format before proceeding
        try:
            if isinstance(payload.thread_id, str):
                UUID(payload.thread_id)  # This will raise ValueError if invalid
        except ValueError:
            logger.error(
                "Invalid thread_id format received: %s (type: %s)",
                payload.thread_id,
                type(payload.thread_id).__name__
            )
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid thread ID format",
                    "error": f"invalid input syntax for type uuid: \"{payload.thread_id}\"",
                    "hint": "thread_id must be a valid UUID format (e.g., '550e8400-e29b-41d4-a716-446655440000')"
                }
            )
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
        except ValueError as e:
            # Handle UUID validation errors that might occur in database operations
            logger.error("UUID validation error accessing thread: %s", str(e))
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid thread ID",
                    "error": str(e),
                    "hint": "Please ensure you're using a valid thread_id from thread creation"
                }
            )
        except Exception as e:
            # Check if this is a PostgreSQL UUID error
            error_str = str(e)
            if "invalid input syntax for type uuid" in error_str.lower():
                logger.error("PostgreSQL UUID error: %s", error_str)
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": "Invalid thread ID format",
                        "error": error_str,
                        "hint": "thread_id must be a valid UUID"
                    }
                )
            try:
                await session.rollback()
            except Exception:
                logging.exception("Failed to rollback session after thread load failure")
            logging.exception("Failed to load thread before streaming message")
            history_warning = history_warning or base_warning
        else:
            resolved_thread_id = thread.thread_id
            resolved_user_id = thread.user_id
            if thread.inventory_id:
                resolved_inventory_id = thread.inventory_id
            
            logger.info(
                "Thread loaded successfully - thread_id=%s, user_id=%s, inventory_id=%s",
                resolved_thread_id,
                resolved_user_id,
                thread.inventory_id
            )
            
            # Extract CC access token from thread context for inventory queries
            cc_access_token = thread.get_access_token()
            if cc_access_token:
                from ..utils.token_manager import redact_token
                logger.debug("Loaded CC token from thread context: %s", redact_token(cc_access_token))
            else:
                # Proactively fetch a new token if none exists
                logger.info("No CC token found in thread, attempting to fetch a new token for user_id=%s", resolved_user_id)
                try:
                    from ..services.citycatalyst_client import CityCatalystClient
                    from ..utils.token_manager import redact_token, create_token_context
                    
                    cc_client = CityCatalystClient()
                    fresh_token, expires_in = await cc_client.refresh_token(resolved_user_id)
                    await cc_client.close()
                    
                    if fresh_token:
                        cc_access_token = fresh_token
                        logger.info(
                            "Successfully fetched new CC token for user_id=%s (expires_in=%ds, token=%s)",
                            resolved_user_id,
                            expires_in,
                            redact_token(fresh_token)
                        )
                        
                        # Store the new token in thread context
                        try:
                            token_context = create_token_context(fresh_token, expires_in=expires_in)
                            await thread_service.update_context(thread, token_context)
                            await session.commit()
                            logger.info("Persisted new CC token to thread context for thread_id=%s", resolved_thread_id)
                        except Exception as ctx_exc:
                            logger.warning("Failed to persist new CC token to thread context: %s", ctx_exc)
                            try:
                                await session.rollback()
                            except Exception:
                                pass
                except Exception as token_exc:
                    logger.error(
                        "Failed to fetch CC token for user_id=%s: %s. Continuing without inventory tools.",
                        resolved_user_id,
                        token_exc,
                        exc_info=True
                    )
            
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
        cc_access_token=cc_access_token,
        inventory_id=resolved_inventory_id,
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)
