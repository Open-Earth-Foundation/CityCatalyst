from __future__ import annotations

from typing import AsyncIterator, List, Optional, Union
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
from ..services.openrouter_client import OpenRouterClient
from ..services.thread_service import ThreadService
from ..utils.sse import format_sse


router = APIRouter()


async def _stream_openrouter(
    payload: MessageCreateRequest,
    *,
    thread_id: Union[str, UUID],
    user_id: str,
    session_factory: Optional[async_sessionmaker[AsyncSession]],
    history_warning: Optional[str] = None,
) -> AsyncIterator[bytes]:
    req_id = get_request_id()
    settings = get_settings()

    client = OpenRouterClient(
        api_key=settings.openrouter_api_key or "",
        llm_config=settings.llm,
    )

    # Use the appropriate system prompt from LLM config
    # TODO: Add inventory context injection when available
    system_prompt = settings.llm.prompts.get_prompt("default")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": payload.content},
    ]

    idx = 0
    assistant_chunks: List[str] = []
    history_saved = False

    if history_warning:
        warning_payload = {"message": history_warning, "thread_id": str(thread_id)}
        yield format_sse(warning_payload, event="warning").encode("utf-8")

    try:
        async for token in client.stream_chat(
            messages=messages,
            model=(payload.options or {}).get("model") if payload.options else None,
            temperature=(payload.options or {}).get("temperature") if payload.options else None,
            request_id=req_id,
        ):
            if token:
                assistant_chunks.append(token)
                yield format_sse(
                    {"index": idx, "content": token}, event="message", id=str(idx)
                ).encode("utf-8")
                idx += 1

        assistant_content = "".join(assistant_chunks)

        if session_factory is not None:
            try:
                async with session_factory() as session:
                    message_service = MessageService(session)
                    thread_service = ThreadService(session)
                    thread = await thread_service.get_thread_for_user(thread_id, user_id)
                    try:
                        await message_service.create_assistant_message(
                            thread_id=thread.thread_id,
                            user_id=user_id,
                            text=assistant_content,
                        )
                        await thread_service.touch_thread(thread)
                        await session.commit()
                        history_saved = True
                    except Exception:
                        await session.rollback()
                        logging.exception("Failed to persist assistant message")
            except Exception:
                logging.exception("Failed to persist assistant message")
        else:
            logging.warning("Skipping assistant message persistence because database is unavailable")

        yield format_sse(
            {"ok": True, "request_id": req_id, "history_saved": history_saved, "thread_id": str(thread_id)},
            event="done",
        ).encode("utf-8")
    except Exception:
        logging.exception("Unhandled exception in _stream_openrouter")
        yield format_sse({"message": "An internal error has occurred."}, event="error").encode("utf-8")
        yield format_sse(
            {"ok": False, "request_id": req_id, "history_saved": history_saved, "thread_id": str(thread_id)},
            event="done",
        ).encode("utf-8")
    finally:
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
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)
