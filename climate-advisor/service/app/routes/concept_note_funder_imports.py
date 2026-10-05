"""Add funders to the CNB catalogue from a run's document upload or by hand."""

from __future__ import annotations

from uuid import UUID

from app.db.session import get_session
from app.models.cnb.funder_import import (
    FunderCreateRequest,
    FunderCreateResponse,
    FunderImportDiscardRequest,
    FunderImportResponse,
    FunderImportStartRequest,
)
from app.models.db.concept_note import ConceptNoteRun
from app.services.cnb.funder_import import (
    create_funder,
    discard_funder_import,
    load_funder_import,
    start_funder_import,
)
from app.services.concept_note_runs import ConceptNoteRunService
from app.utils.citycatalyst_auth import extract_bearer_token
from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _authorized_run(
    session: AsyncSession, run_id: UUID, user_id: str, authorization: str | None
) -> ConceptNoteRun:
    """Return the owned run after revalidating the caller's city access."""
    return await ConceptNoteRunService(session).get_authorized_run(
        run_id=run_id, requested_user_id=user_id, authorization=authorization
    )


@router.get(
    "/concept-notes/{run_id}/funder-imports/current",
    response_model=FunderImportResponse,
)
async def get_current_funder_import(
    run_id: UUID,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> FunderImportResponse:
    """Return the pending funder document import, or null."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return FunderImportResponse(funder_import=await load_funder_import(session, run))


@router.post(
    "/concept-notes/{run_id}/funder-imports",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=FunderImportResponse,
)
async def start_concept_note_funder_import(
    run_id: UUID,
    payload: FunderImportStartRequest,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> FunderImportResponse:
    """Start reading funder details from a converted upload on this run."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    funder_import = await start_funder_import(
        session, run, upload_id=payload.upload_id, token=extract_bearer_token(authorization)
    )
    return FunderImportResponse(funder_import=funder_import)


@router.delete(
    "/concept-notes/{run_id}/funder-imports/current",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def discard_concept_note_funder_import(
    run_id: UUID,
    payload: FunderImportDiscardRequest,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Discard the pending import without adding anything to the catalogue."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    await discard_funder_import(session, run, import_id=payload.import_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/concept-notes/{run_id}/funders",
    status_code=status.HTTP_201_CREATED,
    response_model=FunderCreateResponse,
)
async def create_concept_note_funder(
    run_id: UUID,
    payload: FunderCreateRequest,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> FunderCreateResponse:
    """Add a reviewed funder, programme and template to the catalogue."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return await create_funder(session, run, payload)
