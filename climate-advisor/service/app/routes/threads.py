from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.requests import ThreadCreateRequest
from app.models.responses import (
    ThreadCreateResponse,
    ThreadMessageResponse,
    ThreadMessagesResponse,
)
from app.services.message_service import MessageService
from app.services.thread_service import ThreadService
from app.utils.citycatalyst_auth import (
    authenticate_write_request,
    normalize_write_context,
)


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
    authorization: Annotated[str | None, Header()] = None,
):
    # Bind the write to Core's canonical subject before any persistence.
    identity = await authenticate_write_request(
        authorization=authorization,
        claimed_user_id=payload.user_id,
    )
    authenticated_payload = payload.model_copy(
        update={
            "user_id": identity.user_id,
            "context": normalize_write_context(payload.context, identity.token),
        }
    )
    logger.info(
        "=== POST /threads request received ===\n"
        "  user_id: %s\n"
        "  inventory_id: %s\n"
        "  has_context: %s\n"
        "  context_keys: %s",
        authenticated_payload.user_id,
        authenticated_payload.inventory_id,
        bool(authenticated_payload.context),
        list(authenticated_payload.context.keys())
        if authenticated_payload.context and isinstance(authenticated_payload.context, dict)
        else [],
    )

    service = ThreadService(session)
    try:
        thread = await service.create_thread(authenticated_payload)
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
            identity.user_id,
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

