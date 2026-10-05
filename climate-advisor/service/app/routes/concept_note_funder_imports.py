"""Add funders to the CNB catalogue from a run's document upload or by hand."""

from __future__ import annotations

from app.db.session import get_session
from app.models.cnb.funder_import import (
    FunderCreateRequest,
    FunderCreateResponse,
    FunderImportDiscardRequest,
    FunderImportResponse,
    FunderImportStartRequest,
)
from app.routes.dependencies import AuthorizedRun
from app.services.cnb.funder_import import (
    create_funder,
    discard_funder_import,
    load_funder_import,
    start_funder_import,
)
from app.utils.citycatalyst_auth import extract_bearer_token
from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get(
    "/concept-notes/{run_id}/funder-imports/current",
    response_model=FunderImportResponse,
)
async def get_current_funder_import(
    run: AuthorizedRun, session: AsyncSession = Depends(get_session)
) -> FunderImportResponse:
    """Return the pending funder document import, or null."""
    return FunderImportResponse(funder_import=await load_funder_import(session, run))


@router.post(
    "/concept-notes/{run_id}/funder-imports",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=FunderImportResponse,
)
async def start_concept_note_funder_import(
    payload: FunderImportStartRequest,
    run: AuthorizedRun,
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> FunderImportResponse:
    """Read funder details from an upload on this run once it has converted."""
    funder_import = await start_funder_import(
        session, run, upload_id=payload.upload_id, token=extract_bearer_token(authorization)
    )
    return FunderImportResponse(funder_import=funder_import)


@router.delete(
    "/concept-notes/{run_id}/funder-imports/current",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def discard_concept_note_funder_import(
    payload: FunderImportDiscardRequest,
    run: AuthorizedRun,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Discard the pending import without adding anything to the catalogue."""
    await discard_funder_import(session, run, import_id=payload.import_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/concept-notes/{run_id}/funders",
    status_code=status.HTTP_201_CREATED,
    response_model=FunderCreateResponse,
)
async def create_concept_note_funder(
    payload: FunderCreateRequest,
    run: AuthorizedRun,
    session: AsyncSession = Depends(get_session),
) -> FunderCreateResponse:
    """Add a reviewed funder, programme and template to the catalogue."""
    return await create_funder(session, run, payload)
