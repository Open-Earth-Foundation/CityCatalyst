"""Agent tool that starts (generates) a Stationary Energy draft.

Unlike the review tools, which operate on an already-generated draft run, this
tool creates a brand-new draft run for the active city + inventory and kicks off
proposal generation. It lets the chat agent fulfil natural-language requests such
as "draft the empty rows" instead of relying on the UI button alone.
"""

from __future__ import annotations

import logging
from typing import Dict, Optional, Sequence
from uuid import UUID

from agents import function_tool
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.stationary_energy_drafts import StartStationaryEnergyDraftRequest
from app.services.stationary_energy.stationary_energy_draft_service import (
    StationaryEnergyDraftService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    MessageParamValue,
)

logger = logging.getLogger(__name__)


class StationaryEnergyStartDraftToolResult(BaseModel):
    """Tool response that asks the UI to load a freshly started draft."""

    success: bool
    action: str = "stationary_energy_start_draft"
    ui_event: str = "stationary_energy_draft_started"
    draft_run_id: UUID | None = None
    status: str | None = None
    message_key: str | None = None
    message_params: dict[str, MessageParamValue] = Field(default_factory=dict)
    error_code: str | None = None


def build_stationary_energy_start_draft_tools(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    city_id: str,
    inventory_id: str,
    user_id: str,
    thread_id: Optional[UUID],
    token_ref: Dict[str, Optional[str]],
    locale: Optional[str] = None,
) -> Sequence[object]:
    """Create a Stationary Energy start-draft tool scoped to one city + inventory."""

    async def _run_start_draft() -> str:
        """Start a draft inside a committed database session."""
        try:
            # Use a short-lived committed session, mirroring the review tools so the
            # draft-run row and its initial status updates persist atomically.
            async with session_factory() as session:
                service = StationaryEnergyDraftService(session)
                token = await service.ensure_user_token(
                    user_id=user_id,
                    thread_id=thread_id,
                    token=token_ref.get("value"),
                )
                token_ref["value"] = token
                payload = StartStationaryEnergyDraftRequest(
                    user_id=user_id,
                    city_id=city_id,
                    inventory_id=inventory_id,
                    thread_id=thread_id,
                    locale=locale,
                )
                authorization = f"Bearer {token}" if token else None
                response = await service.start_draft(
                    payload,
                    authorization=authorization,
                )
                await session.commit()
                logger.info(
                    "Stationary Energy start-draft tool created draft_run_id=%s "
                    "status=%s user_id=%s inventory_id=%s",
                    response.draft_run_id,
                    response.status,
                    user_id,
                    inventory_id,
                )
                result = StationaryEnergyStartDraftToolResult(
                    success=True,
                    draft_run_id=response.draft_run_id,
                    status=response.status,
                    message_key="tool-message-draft-started",
                )
                return result.model_dump_json()
        except HTTPException as exc:
            logger.info(
                "Stationary Energy start-draft tool rejected user_id=%s "
                "inventory_id=%s status=%s detail=%s",
                user_id,
                inventory_id,
                exc.status_code,
                exc.detail,
            )
            return _error_payload(
                message_key="tool-error-http",
                message_params={"status": exc.status_code},
                error_code=f"http_{exc.status_code}",
            )
        except Exception:
            logger.exception(
                "Stationary Energy start-draft tool failed user_id=%s inventory_id=%s",
                user_id,
                inventory_id,
            )
            return _error_payload(
                message_key="tool-error-generic",
                error_code="tool_error",
            )

    @function_tool
    async def stationary_energy_start_draft() -> str:
        """Start a new Stationary Energy draft for the active inventory.

        This tool is only registered on the pre-draft Stationary Energy surface
        when the active inventory has no loaded Stationary Energy draft. It takes
        no arguments because city, inventory, user, and thread scope are supplied
        by runtime.

        Generates source-backed values for every empty Stationary Energy row using
        the third-party datasets already connected to this inventory. Proposals
        generate in the background and then appear in the review pane for the user
        to confirm before any inventory write.

        Use this when the user asks to draft, generate, fill, or start the empty
        Stationary Energy rows (for example "draft the empty rows", "fill it in",
        "go ahead", or an affirmative reply about drafting). Answer other
        questions normally. This does not write to the CityCatalyst inventory.
        """
        return await _run_start_draft()

    return [stationary_energy_start_draft]


def _error_payload(
    *,
    message_key: str,
    error_code: str,
    message_params: dict[str, MessageParamValue] | None = None,
) -> str:
    """Serialize a standard failed Stationary Energy start-draft response."""
    result = StationaryEnergyStartDraftToolResult(
        success=False,
        message_key=message_key,
        message_params=message_params or {},
        error_code=error_code,
    )
    return result.model_dump_json()
