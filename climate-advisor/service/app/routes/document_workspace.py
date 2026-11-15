"""Owner-authorized HTTP entry points for the canonical point workspace."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.db.concept_note import ConceptNoteRun
from app.models.document_workspace.contracts import (
    DocumentExportRequest,
    DocumentExportResponse,
    DocumentPointCommand,
    DocumentPointCommandResult,
    DocumentPointQuestion,
    DocumentSetupRequest,
    DocumentWorkspace,
)
from app.services.concept_note_runs import ConceptNoteRunService
from app.services.document_workspace.service import (
    DocumentWorkspaceService,
    get_document_workspace_service,
)
from app.services.document_workspace.source_access import document_source_validator

router = APIRouter()
Service = Annotated[DocumentWorkspaceService, Depends(get_document_workspace_service)]
Session = Annotated[AsyncSession, Depends(get_session)]


async def _authorized_run(
    session: AsyncSession,
    run_id: UUID,
    user_id: str,
    authorization: str | None,
) -> ConceptNoteRun:
    """Recheck run scope and release the per-request Core client."""
    run_service = ConceptNoteRunService(session)
    try:
        run = await run_service.get_authorized_run(
            run_id=run_id, requested_user_id=user_id, authorization=authorization
        )
        # Authorization is read-only. Detach its loaded run and return the CA
        # connection before any separate CNB lock or owned CA lease is acquired.
        await session.close()
        return run
    finally:
        await run_service.cc_client.close()


class PointQuestionRequest(BaseModel):
    """Language preference for a read-only point question."""

    model_config = ConfigDict(extra="forbid")
    language: str = Field(default="en", min_length=2, max_length=30)


@router.get("/concept-notes/{run_id}/workspace", response_model=DocumentWorkspace)
async def get_workspace(
    run_id: UUID,
    service: Service,
    session: Session,
    user_id: str = Query(min_length=1),
    authorization: str | None = Header(default=None),
) -> DocumentWorkspace:
    """Read requirements only after canonical run authorization succeeds."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return await service.load(run)


@router.put("/concept-notes/{run_id}/setup", response_model=DocumentWorkspace)
async def save_setup(
    run_id: UUID,
    payload: DocumentSetupRequest,
    service: Service,
    session: Session,
    user_id: str = Query(min_length=1),
    authorization: str | None = Header(default=None),
) -> DocumentWorkspace:
    """Reconcile a selected template with explicit version and replay protection."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return await service.save_setup(run, payload)


@router.post(
    "/concept-notes/{run_id}/points/{point_key}/commands",
    response_model=DocumentPointCommandResult,
)
async def command_point(
    run_id: UUID,
    point_key: str,
    payload: DocumentPointCommand,
    service: Service,
    session: Session,
    user_id: str = Query(min_length=1),
    authorization: str | None = Header(default=None),
) -> DocumentPointCommandResult:
    """Persist the same validated point command used by scoped Clima tools."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return await service.command(
        run,
        point_key,
        payload,
        user_id=user_id,
        source_validator=document_source_validator(authorization),
    )


@router.post(
    "/concept-notes/{run_id}/points/{point_key}/question",
    response_model=DocumentPointQuestion,
)
async def question_point(
    run_id: UUID,
    point_key: str,
    payload: PointQuestionRequest,
    service: Service,
    session: Session,
    user_id: str = Query(min_length=1),
    authorization: str | None = Header(default=None),
) -> DocumentPointQuestion:
    """Generate guidance without mutating the point or accepting a suggestion."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return await service.question(run, point_key, payload.language)


@router.post("/concept-notes/{run_id}/exports", response_model=DocumentExportResponse)
async def export_workspace(
    run_id: UUID,
    payload: DocumentExportRequest,
    service: Service,
    session: Session,
    user_id: str = Query(min_length=1),
    authorization: str | None = Header(default=None),
) -> DocumentExportResponse:
    """Enforce final eligibility in the operation producing the exported content."""
    run = await _authorized_run(session, run_id, user_id, authorization)
    return await service.export(
        run, payload, source_validator=document_source_validator(authorization)
    )
