from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.feature_flags import FeatureFlags, has_feature_flag
from app.db.session import get_session
from app.models.stationary_energy_drafts import (
    ListStationaryEnergyDraftsResponse,
    RetryStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftResponse,
    SaveStationaryEnergyDraftRequest,
    SaveStationaryEnergyDraftResponse,
    StartStationaryEnergyDraftRequest,
    StartStationaryEnergyDraftResponse,
    StationaryEnergyDraftStatusResponse,
)
from app.services.stationary_energy_draft_service import StationaryEnergyDraftService


router = APIRouter()


def require_stationary_energy_agentic_enabled() -> None:
    """Raise 404 when the Stationary Energy agentic workflow is disabled."""
    if not has_feature_flag(FeatureFlags.STATIONARY_ENERGY_AGENTIC):
        raise HTTPException(status_code=404, detail="Not found")


@router.post(
    "/stationary-energy-drafts/start",
    response_model=StartStationaryEnergyDraftResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def start_stationary_energy_draft(
    payload: StartStationaryEnergyDraftRequest,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> StartStationaryEnergyDraftResponse:
    """Start a new Stationary Energy draft generation run."""
    service = StationaryEnergyDraftService(session)
    try:
        response = await service.start_draft(payload, authorization=authorization)
        await session.commit()
        return response
    except HTTPException:
        await session.commit()
        raise
    except Exception:
        await session.rollback()
        raise


@router.get(
    "/stationary-energy-drafts",
    response_model=ListStationaryEnergyDraftsResponse,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def list_stationary_energy_drafts(
    user_id: str = Query(..., min_length=1),
    city_id: str = Query(..., min_length=1),
    inventory_id: str = Query(..., min_length=1),
    sector_code: str = Query(default="stationary_energy"),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ListStationaryEnergyDraftsResponse:
    """Return all active Stationary Energy drafts for this scoped user."""
    service = StationaryEnergyDraftService(session)
    if sector_code != "stationary_energy":
        raise HTTPException(status_code=400, detail="Unsupported sector_code")
    return await service.list_drafts_for_scope(
        requested_user_id=user_id,
        city_id=city_id,
        inventory_id=inventory_id,
        sector_code=sector_code,
        authorization=authorization,
    )


@router.get(
    "/stationary-energy-drafts/resume",
    response_model=StationaryEnergyDraftStatusResponse,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def resume_stationary_energy_draft(
    user_id: str = Query(..., min_length=1),
    city_id: str = Query(..., min_length=1),
    inventory_id: str = Query(..., min_length=1),
    sector_code: str = Query(default="stationary_energy"),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> StationaryEnergyDraftStatusResponse:
    """Return the latest active Stationary Energy draft for this scoped user."""
    service = StationaryEnergyDraftService(session)
    if sector_code != "stationary_energy":
        raise HTTPException(status_code=400, detail="Unsupported sector_code")
    return await service.resume_latest_draft(
        requested_user_id=user_id,
        city_id=city_id,
        inventory_id=inventory_id,
        sector_code=sector_code,
        authorization=authorization,
    )


@router.get(
    "/stationary-energy-drafts/{draft_run_id}",
    response_model=StationaryEnergyDraftStatusResponse,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def get_stationary_energy_draft(
    draft_run_id: UUID,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> StationaryEnergyDraftStatusResponse:
    """Return the latest stored snapshot for a specific draft run."""
    service = StationaryEnergyDraftService(session)
    return await service.get_draft_status(
        draft_run_id=draft_run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )


@router.post(
    "/stationary-energy-drafts/{draft_run_id}/retry",
    response_model=StartStationaryEnergyDraftResponse,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def retry_stationary_energy_draft(
    draft_run_id: UUID,
    payload: RetryStationaryEnergyDraftRequest,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> StartStationaryEnergyDraftResponse:
    """Retry draft generation for an existing non-terminal draft run."""
    service = StationaryEnergyDraftService(session)
    try:
        response = await service.retry_draft(
            draft_run_id=draft_run_id,
            payload=payload,
            authorization=authorization,
        )
        await session.commit()
        return response
    except HTTPException:
        await session.commit()
        raise
    except Exception:
        await session.rollback()
        raise


@router.post(
    "/stationary-energy-drafts/{draft_run_id}/review",
    response_model=ReviewStationaryEnergyDraftResponse,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def review_stationary_energy_draft(
    draft_run_id: UUID,
    payload: ReviewStationaryEnergyDraftRequest,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ReviewStationaryEnergyDraftResponse:
    """Persist the user's complete review decision set for a draft run."""
    service = StationaryEnergyDraftService(session)
    try:
        response = await service.review_draft(
            draft_run_id=draft_run_id,
            payload=payload,
            authorization=authorization,
        )
        await session.commit()
        return response
    except Exception:
        await session.rollback()
        raise


@router.post(
    "/stationary-energy-drafts/{draft_run_id}/save",
    response_model=SaveStationaryEnergyDraftResponse,
    dependencies=[Depends(require_stationary_energy_agentic_enabled)],
)
async def save_stationary_energy_draft(
    draft_run_id: UUID,
    payload: SaveStationaryEnergyDraftRequest,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> SaveStationaryEnergyDraftResponse:
    """Commit accepted reviewed rows from a draft into CityCatalyst."""
    service = StationaryEnergyDraftService(session)
    try:
        response = await service.save_draft(
            draft_run_id=draft_run_id,
            payload=payload,
            authorization=authorization,
        )
        await session.commit()
        return response
    except Exception:
        await session.rollback()
        raise
