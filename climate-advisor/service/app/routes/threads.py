from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models.requests import ThreadCreateRequest
from ..models.responses import ThreadCreateResponse
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
        "  has_context: %s",
        payload.user_id,
        payload.inventory_id,
        bool(payload.context)
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
            "  Location header: /v1/threads/%s",
            thread.thread_id,
            type(thread.thread_id).__name__,
            thread.user_id,
            thread.inventory_id,
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

