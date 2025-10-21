from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)


logger = logging.getLogger(__name__)

DEFAULT_USER_ID = "3e9c2695-ba01-470c-ae66-b564b6b36996"

router = APIRouter(prefix="/dev", tags=["dev"])


class InventoryCheckRequest(BaseModel):
    """Payload for developer inventory connectivity check."""

    user_id: Optional[str] = None


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
async def user_inventories_check(payload: InventoryCheckRequest) -> InventoryCheckResponse:
    """Fetch inventories for the provided user ID using the CityCatalyst client."""

    user_id = payload.user_id or DEFAULT_USER_ID
    async with CityCatalystClient() as client:
        try:
            token, expires_in = await client.refresh_token(user_id)
        except TokenRefreshError as exc:
            logger.error("Token refresh failed for user_id=%s: %s", user_id, exc)
            raise HTTPException(status_code=502, detail=f"Token refresh failed: {exc}") from exc

        try:
            inventories = await client.get_user_inventories(
                token=token,
                user_id=user_id,
            )
        except CityCatalystClientError as exc:
            logger.error("User inventories fetch failed for user_id=%s: %s", user_id, exc)
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    data: List[Any] = []
    if isinstance(inventories, dict):
        maybe_data = inventories.get("data")
        if isinstance(maybe_data, list):
            data = maybe_data

    return InventoryCheckResponse(
        success=True,
        user_id=user_id,
        expires_in=expires_in,
        inventory_count=len(data),
        inventories=inventories,
    )
