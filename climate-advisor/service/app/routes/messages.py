"""Message creation and streaming endpoints."""

from __future__ import annotations

import logging
from typing import Optional, Union
from uuid import UUID

from agents import set_trace_processors
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from langsmith.wrappers import OpenAIAgentsTracingProcessor
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import get_settings
from ..db.session import get_session_factory, get_session_optional
from ..middleware import get_request_id
from ..models.requests import MessageCreateRequest
from ..services.message_service import MessageService
from ..services.thread_service import ThreadService
from ..utils.streaming_handler import StreamingHandler
from ..utils.thread_resolver import ThreadResolver

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


@router.options("/messages", include_in_schema=False)
async def options_messages() -> Response:
    return Response(status_code=200)


@router.post("/messages")
async def post_message(
    payload: MessageCreateRequest,
    session: Optional[AsyncSession] = Depends(get_session_optional),
    session_factory: Optional[async_sessionmaker[AsyncSession]] = Depends(get_session_factory),
) -> StreamingResponse:
    """Create a message and stream AI response.
    
    This endpoint handles:
    - Thread resolution/creation
    - User message persistence
    - AI response streaming via SSE
    - Token management for inventory API access
    
    Args:
        payload: Message creation request (user_id, content, optional thread_id, inventory_id)
        session: Database session (optional, for graceful degradation)
        session_factory: Session factory for async operations
        
    Returns:
        StreamingResponse with Server-Sent Events (SSE)
    """
    logger.info(
        "POST /messages - user_id=%s, thread_id=%s, content_length=%d, inventory_id=%s, has_context=%s",
        payload.user_id,
        payload.thread_id,
        len(payload.content),
        payload.inventory_id,
        bool(payload.context),
    )
    
    # Base warnings for database unavailability
    history_warning: Optional[str] = None
    if session is None and session_factory is None:
        history_warning = (
            "Chat history is temporarily unavailable. The conversation will continue, "
            "but your messages will not be saved."
        )
    
    try:
        # 1. Resolve or create thread
        resolved_thread_id = await ThreadResolver.resolve_thread(
            thread_id=payload.thread_id,
            payload=payload,
            user_id=payload.user_id,
            session_factory=session_factory,
        )
        
        logger.info("Thread resolved: thread_id=%s", resolved_thread_id)
        
        # 2. Load CC token - check payload first, then thread context
        cc_access_token: Optional[str] = None
        token_from_payload = None
        
        # Check if token is provided in the request payload context
        if payload.context and isinstance(payload.context, dict):
            # Check both "cc_access_token" (new) and "access_token" (standard) keys
            token_from_payload = payload.context.get("cc_access_token") or payload.context.get("access_token")
            if token_from_payload:
                logger.info("Found CC token in request payload context")
                cc_access_token = token_from_payload
        
        # If no token in payload, load from thread context
        if not cc_access_token and session_factory:
            from ..utils.token_handler import TokenHandler
            token_handler = TokenHandler(
                thread_id=resolved_thread_id,
                user_id=payload.user_id,
                session_factory=session_factory,
            )
            logger.info("Attempting to load CC token from thread context for thread_id=%s", resolved_thread_id)
            cc_access_token = await token_handler.load_token_from_thread()
            if cc_access_token:
                logger.info("Successfully loaded CC token from thread context")
            else:
                logger.info("No CC token found in thread context")
        
        # Log token status for debugging
        logger.info(
            "CC token status - from_payload=%s, final_token=%s",
            "present" if token_from_payload else "absent",
            "present" if cc_access_token else "absent"
        )
        
        # 3. Persist user message and update token if needed
        if session_factory:
            try:
                async with session_factory() as db_session:
                    thread_service = ThreadService(db_session)
                    thread = await thread_service.get_thread(resolved_thread_id)
                    
                    if thread:
                        # If token came from payload, persist it to thread context using standard "access_token" key
                        if token_from_payload:
                            await thread_service.update_context(
                                thread=thread,
                                context_update={"access_token": token_from_payload},
                            )
                            logger.info("Persisted CC token from payload to thread context")
                        
                        message_service = MessageService(db_session)
                        await message_service.create_user_message(
                            thread_id=resolved_thread_id,
                            user_id=payload.user_id,
                            text=payload.content,
                        )
                        await thread_service.touch_thread(thread)
                        await db_session.commit()
                    
                    logger.info("User message persisted to thread_id=%s", resolved_thread_id)
            except Exception as e:
                logger.warning("Failed to persist user message: %s", e)
                history_warning = (
                    "Chat history is temporarily unavailable. The conversation will continue, "
                    "but your messages will not be saved."
                )
        
        # 4. Create streaming handler and stream response
        handler = StreamingHandler(
            thread_id=resolved_thread_id,
            user_id=payload.user_id,
            session_factory=session_factory,
            cc_access_token=cc_access_token,
            inventory_id=payload.inventory_id,
        )
        
        async def stream_wrapper():
            """Wrapper to handle message persistence after streaming."""
            async for chunk in handler.stream_response(payload, history_warning):
                yield chunk
            
            # Persist assistant message after streaming completes
            await handler.persist_message()
        
        headers = {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
        
        return StreamingResponse(
            stream_wrapper(),
            media_type="text/event-stream",
            headers=headers,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unhandled exception in post_message")
        raise HTTPException(
            status_code=500,
            detail={"message": "An internal error occurred", "error": str(e)},
        )
