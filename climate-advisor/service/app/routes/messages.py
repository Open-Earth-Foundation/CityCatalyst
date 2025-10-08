from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List, Optional, Union
from uuid import UUID, uuid4
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import get_settings
from ..db.session import get_session_optional, get_session_factory
from ..middleware import get_request_id
from ..models.requests import MessageCreateRequest
from ..services.message_service import MessageService
from ..services.langsmith_tracer import get_langsmith_tracer
from ..services.langchain_client import OpenRouterResponsesClient
from ..services.thread_service import ThreadService
from ..tools import ClimateVectorSearchTool
from ..utils.sse import format_sse
from ..utils.tool_handler import persist_assistant_message


router = APIRouter()


def get_climate_vector_tool():
    """Get climate vector search tool with current settings."""
    settings = get_settings()
    return ClimateVectorSearchTool(settings=settings)


async def _stream_openrouter(
    payload: MessageCreateRequest,
    *,
    thread_id: Union[str, UUID],
    user_id: str,
    session_factory: Optional[async_sessionmaker[AsyncSession]],
    history_warning: Optional[str] = None,
    session: Optional[AsyncSession] = None,
) -> AsyncIterator[bytes]:
    req_id = get_request_id()
    settings = get_settings()

    tracer = get_langsmith_tracer()
    conversation_run_id: Optional[str] = None
    if tracer:
        conversation_inputs = {
            "thread_id": str(thread_id),
            "user_id": user_id,
            "user_message": payload.content,
            "options": payload.options or {},
            "request_id": req_id,
        }
        if history_warning:
            conversation_inputs["history_warning"] = history_warning
        if payload.inventory_id:
            conversation_inputs["inventory_id"] = payload.inventory_id
        conversation_run_id = tracer.start_conversation_run(
            name="climate-advisor.message",
            inputs=conversation_inputs,
            tags=["conversation"],
        )

    langsmith_error: Optional[str] = None

    # Use LangChain client for automatic tracing
    client = LangChainClient(
        api_key=settings.openrouter_api_key or "",
        llm_config=settings.llm,
    )

    # Use the appropriate system prompt from LLM config
    system_prompt = settings.llm.prompts.get_prompt("default")

    # Define the climate vector search tool in OpenAI function calling format
    tools = [{
        "type": "function",
        "function": {
            "name": "climate_vector_search",
            "description": "Search the climate knowledge base for relevant information about climate change, emissions, GHG, carbon, sustainability, environmental policies, renewable energy, net zero goals, climate adaptation, and mitigation strategies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The search query to find relevant climate information in the knowledge base. Optimize this query for semantic search."
                    }
                },
                "required": ["question"],
                "additionalProperties": False
            }
        }
    }]

    messages: List[Dict] = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": payload.content})

    assistant_content = ""
    history_saved = False
    tool_invocations: Optional[List[dict]] = None
    tool_calls_accumulator = {}

    if history_warning:
        warning_payload = {"message": history_warning, "thread_id": str(thread_id)}
        yield format_sse(warning_payload, event="warning").encode("utf-8")

    try:
        # Stream the initial LLM response and accumulate any tool calls
        async for acc, content, _, sse_bytes in stream_initial_response(
            client=client,
            messages=messages,
            payload=payload,
            req_id=req_id,
            tools=tools,
        ):
            tool_calls_accumulator = acc
            assistant_content = content
            yield sse_bytes

        # Execute any tool calls and stream the final response
        if tool_calls_accumulator:
            logging.info(
                "Processing %s tool call(s) from LLM response",
                len(tool_calls_accumulator)
            )
            climate_tool_instance = get_climate_vector_tool()
            async for content_update, invocations, sse_bytes in handle_tool_calls(
                tool_calls_accumulator=tool_calls_accumulator,
                client=client,
                messages=messages,
                payload=payload,
                req_id=req_id,
                tools=tools,
                climate_tool=climate_tool_instance,
                session=session,
                tracer=tracer,
                conversation_run_id=conversation_run_id,
            ):
                if content_update is not None:
                    assistant_content = content_update
                if invocations is not None:
                    tool_invocations = invocations
                yield sse_bytes
        else:
            logging.info("No tool calls to process - LLM responded directly")

        # Persist the assistant message to database
        history_saved = await persist_assistant_message(
            session_factory=session_factory,
            thread_id=thread_id,
            user_id=user_id,
            assistant_content=assistant_content,
            tool_invocations=tool_invocations,
        )

        yield format_sse(
            {"ok": True, "request_id": req_id, "history_saved": history_saved, "thread_id": str(thread_id), "tools_used": tool_invocations},
            event="done",
        ).encode("utf-8")
    except Exception as exc:
        langsmith_error = str(exc)
        logging.exception("Unhandled exception in _stream_openrouter")
        yield format_sse({"message": "An internal error has occurred."}, event="error").encode("utf-8")
        yield format_sse(
            {"ok": False, "request_id": req_id, "history_saved": history_saved, "thread_id": str(thread_id), "tools_used": tool_invocations},
            event="done",
        ).encode("utf-8")
    finally:
        if tracer and conversation_run_id:
            conversation_outputs = {
                "assistant_response": assistant_content,
                "history_saved": history_saved,
                "tools_used": tool_invocations or [],
                "thread_id": str(thread_id),
                "request_id": req_id,
            }
            if history_warning:
                conversation_outputs["history_warning"] = history_warning
            tracer.complete_run(
                conversation_run_id,
                outputs=conversation_outputs,
                error=langsmith_error,
            )
        await client.aclose()


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

    stream = _stream_openrouter(
        payload,
        thread_id=resolved_thread_id,
        user_id=resolved_user_id,
        session_factory=assistant_session_factory,
        history_warning=history_warning,
        session=session,
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)
