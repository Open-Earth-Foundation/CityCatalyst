from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models.requests import ThreadCreateRequest
from ..models.responses import ThreadCreateResponse
from ..services.thread_service import ThreadService


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
    service = ThreadService(session)
    try:
        thread = await service.create_thread(payload)
        await session.commit()
    except Exception:
        await session.rollback()
        raise

    response.headers["Location"] = f"/v1/threads/{thread.thread_id}"
    return ThreadCreateResponse(
        thread_id=thread.thread_id,
        inventory_id=thread.inventory_id,
        context=thread.context,
    )

