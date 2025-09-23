from __future__ import annotations

from typing import AsyncIterator, List
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..config import get_settings
from ..db.session import get_session, get_session_factory
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
    thread_id: str,
    user_id: str,
    session_factory: async_sessionmaker[AsyncSession],
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
            except Exception:
                await session.rollback()
                raise

        yield format_sse({"ok": True, "request_id": req_id}, event="done").encode("utf-8")
    except Exception as exc:
        logging.exception("Unhandled exception in _stream_openrouter")
        yield format_sse({"message": "An internal error has occurred."}, event="error").encode("utf-8")
        yield format_sse({"ok": False, "request_id": req_id}, event="done").encode("utf-8")
    finally:
        await client.aclose()


@router.post("/messages")
async def post_message(
    payload: MessageCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    if not payload.thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    thread_service = ThreadService(session)
    thread = await thread_service.get_thread_for_user(payload.thread_id, payload.user_id)

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
        await session.rollback()
        raise

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    stream = _stream_openrouter(
        payload,
        thread_id=thread.thread_id,
        user_id=thread.user_id,
        session_factory=get_session_factory(),
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)
