from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated, Any, Dict, List

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.utils.citycatalyst_auth import authenticate_write_request
from app.utils.token_manager import get_token_expiry


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dev", tags=["dev"])


class InventoryCheckRequest(BaseModel):
    """Payload for developer inventory connectivity check."""

    user_id: str


class InventoryCheckResponse(BaseModel):
    success: bool
    user_id: str
    expires_in: int
    inventory_count: int
    inventories: Dict[str, Any]


@router.post(
    "/user-inventories-check",
    response_model=InventoryCheckResponse,
    summary="Fetch inventories for debugging CityCatalyst connectivity.",
)
async def user_inventories_check(
    payload: InventoryCheckRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> InventoryCheckResponse:
    """Fetch inventories for the authenticated canonical user."""

    identity = await authenticate_write_request(
        authorization=authorization,
        claimed_user_id=payload.user_id,
    )
    async with CityCatalystClient() as client:
        try:
            inventories = await client.get_user_inventories(
                token=identity.token,
                user_id=identity.user_id,
            )
        except CityCatalystClientError as exc:
            logger.error(
                "User inventories fetch failed for user_id=%s: %s",
                identity.user_id,
                exc,
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    data: List[Any] = []
    if isinstance(inventories, dict):
        maybe_data = inventories.get("data")
        if isinstance(maybe_data, list):
            data = maybe_data

    expires_at = get_token_expiry(identity.token)
    expires_in = (
        max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
        if expires_at is not None
        else 0
    )
    return InventoryCheckResponse(
        success=True,
        user_id=identity.user_id,
        expires_in=expires_in,
        inventory_count=len(data),
        inventories=inventories,
    )
