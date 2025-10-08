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

logger = logging.getLogger(__name__)

router = APIRouter()


def _parse_tool_arguments(arguments: str) -> Optional[Dict[str, Any]]:
    if not arguments:
        return None
    try:
        parsed = json.loads(arguments)
    except json.JSONDecodeError:
        logger.warning("Unable to decode tool arguments as JSON")
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


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

    system_prompt = settings.llm.prompts.get_prompt("default")
    tools = [
        {
            "type": "function",
            "function": {
                "name": "climate_vector_search",
                "description": (
                    "Search the climate knowledge base for relevant information "
                    "about climate change, emissions, GHG, carbon, sustainability, "
                    "environmental policies, renewable energy, net zero goals, "
                    "climate adaptation, and mitigation strategies."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": (
                                "The search query to find relevant climate information "
                                "in the knowledge base. Optimize this query for semantic search."
                            ),
                        }
                    },
                    "required": ["question"],
                    "additionalProperties": False,
                },
                "strict": True,
            }
        }
    ]

    base_messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": payload.content},
    ]

    if history_warning:
        warning_payload = {"message": history_warning, "thread_id": str(thread_id)}
        yield format_sse(warning_payload, event="warning").encode("utf-8")

    climate_tool_instance = get_climate_vector_tool()
    options = payload.options or {}
    model_override = options.get("model")
    temperature_override = options.get("temperature")

    messages = list(base_messages)
    assistant_tokens: List[str] = []
    tool_invocations: List[dict] = []
    token_index = 0
    history_saved = False

    try:
        client = OpenRouterResponsesClient(
            api_key=settings.openrouter_api_key or "",
            llm_config=settings.llm,
        )

        max_iterations = 5
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            accumulated_tool_calls: List[Dict[str, Any]] = []
            needs_tool_response = False

            stream_kwargs: Dict[str, Any] = {
                "messages": messages,
                "model": model_override,
                "temperature": temperature_override,
                "tools": tools,
            }

            async with client.stream_response(**stream_kwargs) as stream:
                async for chunk in stream:
                    chunk_dict = chunk.model_dump() if hasattr(chunk, "model_dump") else {}
                    event_type = chunk_dict.get("type")

                    if event_type == "content.delta":
                        delta_text = chunk_dict.get("delta")
                        if delta_text:
                            assistant_tokens.append(delta_text)
                            sse_bytes = format_sse(
                                {"index": token_index, "content": delta_text},
                                event="message",
                                id=str(token_index),
                            ).encode("utf-8")
                            yield sse_bytes
                            token_index += 1
                        continue

                    if event_type != "chunk":
                        continue

                    chunk_payload = chunk_dict.get("chunk") or {}
                    choices = chunk_payload.get("choices") or []
                    if not choices:
                        continue

                    choice = choices[0]
                    delta = choice.get("delta") or {}
                    finish_reason = choice.get("finish_reason")

                    content_piece = delta.get("content")
                    if content_piece:
                        assistant_tokens.append(content_piece)
                        sse_bytes = format_sse(
                            {"index": token_index, "content": content_piece},
                            event="message",
                            id=str(token_index),
                        ).encode("utf-8")
                        yield sse_bytes
                        token_index += 1

                    tool_call_deltas = delta.get("tool_calls") or []
                    if tool_call_deltas:
                        for tool_delta in tool_call_deltas:
                            idx = tool_delta.get("index", len(accumulated_tool_calls))
                            call_id = tool_delta.get("id") or f"call_{idx}"
                            function_name = ""
                            arguments_fragment = ""
                            function_payload = tool_delta.get("function") or {}
                            if function_payload:
                                function_name = function_payload.get("name") or ""
                                arguments_fragment = function_payload.get("arguments") or ""

                            if idx >= len(accumulated_tool_calls):
                                accumulated_tool_calls.append(
                                    {
                                        "id": call_id,
                                        "type": tool_delta.get("type") or "function",
                                        "function": {
                                            "name": function_name,
                                            "arguments": arguments_fragment,
                                        },
                                    }
                                )
                            else:
                                call_entry = accumulated_tool_calls[idx]
                                if function_name:
                                    call_entry["function"]["name"] = function_name
                                call_entry["function"]["arguments"] += arguments_fragment

                    if finish_reason:
                        logger.info("Stream finish reason: %s", finish_reason)
                        break

            # For OpenRouter/OpenAI SDK, we use the accumulated data from streaming
            # instead of get_final_response() which doesn't exist in OpenAI SDK
            if finish_reason == "tool_calls" and accumulated_tool_calls:
                needs_tool_response = True
                logger.info(
                    "Model requested %s tool call(s)",
                    len(accumulated_tool_calls),
                )
            else:
                needs_tool_response = False

            if not needs_tool_response:
                break

            assistant_message = {
                "role": "assistant",
                "content": None,
                "tool_calls": accumulated_tool_calls,
            }
            messages.append(assistant_message)

            for tool_call in accumulated_tool_calls:
                tool_name = tool_call["function"]["name"]
                parsed_args = _parse_tool_arguments(tool_call["function"]["arguments"])
                question = parsed_args.get("question") if parsed_args else None

                if not question:
                    logger.warning(
                        "Vector search tool call missing 'question' argument"
                    )
                    tool_message = {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "name": tool_name,
                        "content": json.dumps({"error": "Missing 'question' argument"}),
                    }
                    messages.append(tool_message)
                    yield format_sse(
                        {
                            "tool_call_id": tool_call["id"],
                            "name": tool_name,
                            "status": "error",
                            "error": "Missing 'question' argument",
                        },
                        event="tool_result",
                    ).encode("utf-8")
                    continue

                logger.info(
                    "Vector search tool executing - call_id=%s question=%s",
                    tool_call["id"],
                    question,
                )

                tool_result = await climate_tool_instance.run(question, session=session)

                invocation_dict: Dict[str, Any] = (
                    tool_result.invocation.to_dict()
                    if tool_result.invocation
                    else {
                        "status": "success" if tool_result.matches else "no_results",
                        "arguments": parsed_args or {},
                        "results": [
                            match.to_dict() for match in tool_result.matches
                        ],
                        "used": tool_result.used,
                    }
                )
                invocation_dict["call_id"] = tool_call["id"]
                tool_invocations.append(invocation_dict)

                tool_payload = {
                    "tool_call_id": tool_call["id"],
                    "name": tool_name,
                    "status": invocation_dict.get("status"),
                    "arguments": invocation_dict.get("arguments"),
                    "results": invocation_dict.get("results"),
                    "used": tool_result.used,
                }
                if tool_result.prompt_context:
                    tool_payload["prompt_context"] = tool_result.prompt_context
                if tool_result.reason:
                    tool_payload["reason"] = tool_result.reason
                if invocation_dict.get("error"):
                    tool_payload["error"] = invocation_dict["error"]

                yield format_sse(tool_payload, event="tool_result").encode("utf-8")

                if tracer and conversation_run_id:
                    tracer.log_tool_run(
                        parent_run_id=conversation_run_id,
                        name=tool_name,
                        inputs={
                            "tool_call_id": tool_call["id"],
                            "question": question,
                            "arguments": invocation_dict.get("arguments"),
                        },
                        outputs={
                            "status": invocation_dict.get("status"),
                            "results": invocation_dict.get("results"),
                            "used": tool_result.used,
                            "reason": tool_result.reason,
                            "prompt_context": tool_result.prompt_context,
                        },
                        error=invocation_dict.get("error"),
                        tags=["rag"],
                    )

                tool_output_text = (
                    tool_result.prompt_context
                    or json.dumps(invocation_dict.get("results") or [])
                )
                tool_message = {
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": tool_name,
                    "content": tool_output_text,
                }
                messages.append(tool_message)

        assistant_content = "".join(assistant_tokens)
        history_saved = await persist_assistant_message(
            session_factory=session_factory,
            thread_id=thread_id,
            user_id=user_id,
            assistant_content=assistant_content,
            tool_invocations=tool_invocations or None,
        )

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
    except Exception as exc:
        langsmith_error = str(exc)
        logging.exception("Unhandled exception in _stream_openrouter")
        yield format_sse(
            {"message": "An internal error has occurred."}, event="error"
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
        assistant_snapshot = "".join(assistant_tokens)
        if tracer and conversation_run_id:
            conversation_outputs = {
                "assistant_response": assistant_snapshot,
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
        if client:
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
