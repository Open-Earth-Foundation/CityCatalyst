"""Add funders to the CNB catalogue from a concept-note run."""

from __future__ import annotations

from uuid import UUID

from app.db.session import get_session
from app.models.cnb.funder_import import FunderCreateRequest, FunderCreateResponse
from app.services.cnb.funder_import import create_funder
from app.services.concept_note_runs import ConceptNoteRunService
from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


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
    run = await ConceptNoteRunService(session).get_authorized_run(
        run_id=run_id, requested_user_id=user_id, authorization=authorization
    )
    return await create_funder(run, payload)
