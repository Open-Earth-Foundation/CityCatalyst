from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models.requests import ThreadCreateRequest
from ..models.responses import (
    ThreadCreateResponse,
    ThreadMessageResponse,
    ThreadMessagesResponse,
)
from ..services.message_service import MessageService
from ..services.thread_service import ThreadService


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/threads",
    status_code=status.HTTP_201_CREATED,
    response_model=ThreadCreateResponse,
)
async def create_thread(
    payload: ThreadCreateRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    logger.info(
        "=== POST /threads request received ===\n"
        "  user_id: %s\n"
        "  inventory_id: %s\n"
        "  has_context: %s\n"
        "  context_keys: %s",
        payload.user_id,
        payload.inventory_id,
        bool(payload.context),
        list(payload.context.keys()) if payload.context and isinstance(payload.context, dict) else []
    )
    
    service = ThreadService(session)
    try:
        thread = await service.create_thread(payload)
        await session.commit()
        
        logger.info(
            "=== Thread created successfully ===\n"
            "  thread_id: %s (type: %s)\n"
            "  user_id: %s\n"
            "  inventory_id: %s\n"
            "  stored_context_keys: %s\n"
            "  has_cc_token: %s\n"
            "  Location header: /v1/threads/%s",
            thread.thread_id,
            type(thread.thread_id).__name__,
            thread.user_id,
            thread.inventory_id,
            list(thread.context.keys()) if thread.context and isinstance(thread.context, dict) else [],
            bool(thread.context and isinstance(thread.context, dict) and thread.context.get("access_token")),
            thread.thread_id
        )
    except Exception as e:
        logger.error(
            "Failed to create thread for user_id=%s: %s",
            payload.user_id,
            str(e),
            exc_info=True
        )
        await session.rollback()
        raise

    response.headers["Location"] = f"/v1/threads/{thread.thread_id}"
    return ThreadCreateResponse(
        thread_id=thread.thread_id,
        inventory_id=thread.inventory_id,
        context=thread.context,
    )


@router.options("/threads", include_in_schema=False)
async def options_threads() -> Response:
    return Response(status_code=status.HTTP_200_OK)


@router.get(
    "/threads/{thread_id}/messages",
    response_model=ThreadMessagesResponse,
)
async def get_thread_messages(
    thread_id: UUID,
    user_id: str = Query(..., min_length=1),
    limit: int | None = Query(default=None, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> ThreadMessagesResponse:
    thread_service = ThreadService(session)
    message_service = MessageService(session)
    thread = await thread_service.get_thread_for_user(thread_id, user_id)
    messages = await message_service.get_thread_messages(
        thread_id=thread.thread_id,
        limit=limit,
    )

    return ThreadMessagesResponse(
        thread_id=thread.thread_id,
        messages=[
            ThreadMessageResponse(
                message_id=message.message_id,
                role=message.role.value,
                text=message.text,
                created_at=message.created_at,
            )
            for message in messages
        ],
    )

