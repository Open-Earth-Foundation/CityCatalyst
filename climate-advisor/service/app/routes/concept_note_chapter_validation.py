"""Authenticated Concept Note chapter-validation route."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from app.db.session import get_session
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterValidationActionResponse,
)
from app.services.cnb.chapter_validation import ChapterValidationError
from app.services.cnb.chapter_validation_workflow import (
    ChapterValidationWorkflowError,
    ConceptNoteChapterValidationWorkflowService,
)
from app.services.concept_note_runs import ConceptNoteRunService
from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def get_chapter_validation_workflow_service(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ConceptNoteChapterValidationWorkflowService | None:
    """Build validation dependencies, returning unavailable when CNB DB is unset."""
    try:
        return ConceptNoteChapterValidationWorkflowService(workflow_session=session)
    except RuntimeError:
        return None


@router.post(
    "/concept-notes/{run_id}/chapters/{chapter_id}/validation",
    response_model=ConceptNoteChapterValidationActionResponse,
)
async def validate_concept_note_chapter(
    run_id: UUID,
    chapter_id: UUID,
    validation_service: Annotated[
        ConceptNoteChapterValidationWorkflowService | None,
        Depends(get_chapter_validation_workflow_service),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
    user_id: Annotated[str, Query(min_length=1)],
    authorization: Annotated[str | None, Header()] = None,
) -> ConceptNoteChapterValidationActionResponse | JSONResponse:
    """Validate one authorized chapter and publish its effective ready state."""
    run_service = ConceptNoteRunService(session)
    run = await run_service.get_authorized_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    if validation_service is None:
        return _problem(
            503,
            "cnb_storage_unavailable",
            "Concept Note validation storage is unavailable",
        )

    try:
        validation = await validation_service.validate(
            run=run,
            chapter_id=chapter_id,
        )
    except (ChapterValidationWorkflowError, ChapterValidationError) as exc:
        return _problem(
            exc.status_code,
            exc.code,
            "Unable to validate the requested chapter",
        )

    return ConceptNoteChapterValidationActionResponse(
        chapter_id=chapter_id,
        **validation.model_dump(),
    )


def _problem(status_code: int, code: str, message: str) -> JSONResponse:
    """Return one stable machine-readable validation failure."""
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "detail": message, "status": status_code},
        media_type="application/problem+json",
    )
