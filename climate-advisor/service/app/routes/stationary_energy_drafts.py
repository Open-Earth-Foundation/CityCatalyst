from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.feature_flags import FeatureFlags, has_feature_flag
from app.db.session import get_session
from app.models.stationary_energy_drafts import (
    RetryStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftRequest,
    ReviewStationaryEnergyDraftResponse,
    StartStationaryEnergyDraftRequest,
    StartStationaryEnergyDraftResponse,
    StationaryEnergyDraftStatusResponse,
)
from app.services.stationary_energy_draft_service import StationaryEnergyDraftService


router = APIRouter()


def require_stationary_energy_agentic_enabled() -> None:
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
