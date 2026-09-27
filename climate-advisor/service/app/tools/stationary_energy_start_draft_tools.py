"""Agent tool that starts (generates) a Stationary Energy draft.

Unlike the review tools, which operate on an already-generated draft run, this
tool creates a brand-new draft run for the active city + inventory and kicks off
proposal generation. It lets the chat agent fulfil natural-language requests such
as "draft the empty rows" instead of relying on the UI button alone. The pack
also carries the read-only whole-inventory context tools so questions that need
no run are answered without starting one.
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
from app.tools.inventory_context_tools import build_inventory_context_tools

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
    # The page re-sends the user's request once the run is ready when true.
    continue_request: bool = False


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
    """Create the pre-draft Stationary Energy tools scoped to one city + inventory."""

    async def _resolve_inventory_scope() -> tuple[str, str]:
        """Return the page's city and inventory; the LLM never supplies scope ids."""
        return city_id, inventory_id

    async def _run_start_draft(continue_request: bool) -> str:
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
                    continue_request=continue_request,
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
    async def stationary_energy_start_draft(continue_request: bool = False) -> str:
        """Start a new Stationary Energy run (draft) for the active inventory.

        This tool is only registered on the pre-draft Stationary Energy surface
        when the active inventory has no loaded Stationary Energy draft. City,
        inventory, user, and thread scope are supplied by runtime.

        The run searches the third-party datasets connected to this inventory and
        prepares source-backed proposals for every empty Stationary Energy row.
        Proposals generate in the background and then appear in the review pane
        for the user to confirm before any inventory write. Until a run exists,
        no city data, connected sources, or row proposals are available.

        Use this only when the user asks to draft or fill the Stationary Energy
        rows ("draft the empty rows", "go ahead") or to use or add data from a
        source ("add all SEEG data"). Do not start a run for read-only questions;
        answer whole-inventory questions with `inventory_status_overview` or
        `inventory_emissions_context`, and offer to start a run when a question
        needs row or source data. This does not write to the CityCatalyst
        inventory.

        Args:
            continue_request: True when the request asks for more than starting
                the run (for example "add all SEEG data"), so the page re-sends
                it once the run is ready. False when starting or drafting the
                rows is the whole request.
        """
        return await _run_start_draft(continue_request)

    inventory_context_tools = build_inventory_context_tools(
        resolve_scope=_resolve_inventory_scope,
        user_id=user_id,
        token_ref=token_ref,
    )

    return [*inventory_context_tools, stationary_energy_start_draft]


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
