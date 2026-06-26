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
from pydantic import BaseModel

from app.models.stationary_energy_drafts import StartStationaryEnergyDraftRequest
from app.services.stationary_energy.stationary_energy_draft_service import (
    StationaryEnergyDraftService,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


class StationaryEnergyStartDraftToolResult(BaseModel):
    """Tool response that asks the UI to load a freshly started draft."""

    success: bool
    action: str = "stationary_energy_start_draft"
    ui_event: str = "stationary_energy_draft_started"
    draft_run_id: UUID | None = None
    status: str | None = None
    message_key: str | None = None
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

    @function_tool
    async def stationary_energy_start_draft() -> str:
        """Start a new Stationary Energy draft for the active inventory.

        Generates source-backed values for every empty Stationary Energy row using
        the third-party datasets already connected to this inventory. Proposals
        generate in the background and then appear in the review pane for the user
        to confirm before any inventory write.

        Use this when the user asks to draft, generate, fill, or start the empty
        Stationary Energy rows (for example "draft the empty rows", "fill it in",
        "go ahead", or an affirmative reply to drafting) and no draft is loaded yet.
        This does not write to the CityCatalyst inventory.
        """
        token = token_ref.get("value")
        try:
            # Use a short-lived committed session, mirroring the review tools so the
            # draft-run row and its initial status updates persist atomically.
            async with session_factory() as session:
                service = StationaryEnergyDraftService(session)
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
        except Exception:
            logger.exception(
                "Stationary Energy start-draft tool failed user_id=%s inventory_id=%s",
                user_id,
                inventory_id,
            )
            result = StationaryEnergyStartDraftToolResult(
                success=False,
                message_key="tool-error-generic",
                error_code="tool_error",
            )
            return result.model_dump_json()

    return [stationary_energy_start_draft]
