from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.concept_note_runs import (
    ConceptNoteRunListResponse,
    ConceptNoteRunResponse,
    ConceptNoteStartRequest,
)
from app.services.concept_note_runs import ConceptNoteRunService


router = APIRouter()


@router.get(
    "/concept-notes",
    response_model=ConceptNoteRunListResponse,
)
async def list_concept_note_runs(
    user_id: str = Query(..., min_length=1),
    city_id: UUID = Query(...),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteRunListResponse:
    """Return the authenticated user's runs for one accessible city."""
    service = ConceptNoteRunService(session)
    return await service.list_runs(
        requested_user_id=user_id,
        city_id=city_id,
        authorization=authorization,
    )


@router.post(
    "/concept-notes/start",
    status_code=201,
    response_model=ConceptNoteRunResponse,
    responses={200: {"model": ConceptNoteRunResponse}},
)
async def start_concept_note_run(
    payload: ConceptNoteStartRequest,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Create a concept-note run or replay an identical idempotent request."""
    service = ConceptNoteRunService(session)
    response = await service.start_run(payload, authorization=authorization)
    await session.commit()

    return JSONResponse(
        status_code=201 if response.created else 200,
        content=jsonable_encoder(response),
    )


@router.get(
    "/concept-notes/{run_id}",
    response_model=ConceptNoteRunResponse,
)
async def get_concept_note_run(
    run_id: UUID,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteRunResponse:
    """Return one concept-note run after ownership and city-access checks."""
    service = ConceptNoteRunService(session)
    return await service.get_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
