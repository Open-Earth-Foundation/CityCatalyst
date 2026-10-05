"""Shared FastAPI dependencies for run-scoped Concept Note routes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from app.db.session import get_session
from app.models.db.concept_note import ConceptNoteRun
from app.services.concept_note_runs import ConceptNoteRunService
from fastapi import Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession


async def authorized_run(
    run_id: UUID,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteRun:
    """Recheck canonical user, run ownership and current city access on every call."""
    service = ConceptNoteRunService(session)
    try:
        return await service.get_authorized_run(
            run_id=run_id, requested_user_id=user_id, authorization=authorization
        )
    finally:
        await service.cc_client.close()


AuthorizedRun = Annotated[ConceptNoteRun, Depends(authorized_run)]
