from fastapi import APIRouter, status, Response
from uuid import uuid4

from ..models.requests import ThreadCreateRequest
from ..models.responses import ThreadCreateResponse


router = APIRouter()


@router.post(
    "/threads",
    status_code=status.HTTP_201_CREATED,
    response_model=ThreadCreateResponse,
)
async def create_thread(payload: ThreadCreateRequest, response: Response):
    thread_id = str(uuid4())
    # Optional Location header to newly created resource
    response.headers["Location"] = f"/v1/threads/{thread_id}"
    return ThreadCreateResponse(
        thread_id=thread_id,
        inventory_id=payload.inventory_id,
        context=payload.context,
    )

