"""Authorized, run-scoped review-before-apply Concept Note edit endpoints."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from app.db.session import get_session
from app.middleware.request_context import get_request_id
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditProposalRequest,
    EditProposalResponse,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.edits import EditOperationError
from app.services.cnb.edits import (
    ConceptNoteEditService,
    get_edit_service,
    load_edit_context,
)
from app.services.concept_note_runs import ConceptNoteRunService
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def authorized_edit_run(
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


async def edit_service() -> AsyncIterator[ConceptNoteEditService]:
    """Map storage failures to safe recoverable errors without logging SQL payloads."""
    service = get_edit_service()
    if service is None:
        raise HTTPException(
            status_code=503, detail="Concept Note editing is unavailable"
        )
    try:
        yield service
    except SQLAlchemyError:
        raise EditOperationError(
            "edit_storage_unavailable",
            "Edit storage is unavailable. Retry when the service recovers.",
            status_code=503,
        ) from None


async def edit_exception_handler(
    request: Request, error: EditOperationError
) -> JSONResponse:
    """Preserve the safe edit failure category through the existing web proxy."""
    return JSONResponse(
        status_code=error.status_code,
        content={
            "code": error.code,
            "detail": str(error),
            "status": error.status_code,
            "request_id": get_request_id(),
        },
    )


def require_active_run(run: ConceptNoteRun) -> None:
    """Never append revisions to an archived or otherwise inactive run."""
    if run.status != "active":
        raise EditOperationError(
            "run_inactive", "Only an active Concept Note can be edited."
        )


@router.get(
    "/concept-notes/{run_id}/edit-proposals", response_model=list[EditProposalResponse]
)
async def list_edit_proposals(
    run: Annotated[ConceptNoteRun, Depends(authorized_edit_run)],
    service: Annotated[ConceptNoteEditService, Depends(edit_service)],
) -> list[EditProposalResponse]:
    """Restore durable pending and completed proposals for the authorized run."""
    return await service.repository.list(run_id=run.run_id, user_id=run.user_id)


@router.post(
    "/concept-notes/{run_id}/edit-proposals",
    response_model=EditProposalResponse,
    status_code=202,
)
async def propose_edit(
    payload: EditProposalRequest,
    run: Annotated[ConceptNoteRun, Depends(authorized_edit_run)],
    service: Annotated[ConceptNoteEditService, Depends(edit_service)],
    session: AsyncSession = Depends(get_session),
) -> EditProposalResponse:
    """Create or replay a proposal without mutating the current draft."""
    require_active_run(run)
    return await service.propose(
        run, payload, await load_edit_context(session, run.run_id)
    )


@router.get(
    "/concept-notes/{run_id}/edit-proposals/{proposal_id}",
    response_model=EditProposalResponse,
)
async def get_edit_proposal(
    proposal_id: UUID,
    run: Annotated[ConceptNoteRun, Depends(authorized_edit_run)],
    service: Annotated[ConceptNoteEditService, Depends(edit_service)],
) -> EditProposalResponse:
    """Read a complete diff only after verifying its run and owner binding."""
    return await service.repository.get(
        run_id=run.run_id, user_id=run.user_id, proposal_id=proposal_id
    )


@router.post(
    "/concept-notes/{run_id}/edit-proposals/{proposal_id}/apply",
    response_model=EditProposalResponse,
)
async def apply_edit_proposal(
    proposal_id: UUID,
    payload: EditApplyRequest,
    run: Annotated[ConceptNoteRun, Depends(authorized_edit_run)],
    service: Annotated[ConceptNoteEditService, Depends(edit_service)],
    session: AsyncSession = Depends(get_session),
) -> EditProposalResponse:
    """Apply only explicit user acceptance of a complete expected revision vector."""
    require_active_run(run)
    return await service.apply(
        run, proposal_id, payload, await load_edit_context(session, run.run_id)
    )


@router.post(
    "/concept-notes/{run_id}/edit-proposals/{proposal_id}/reject",
    response_model=EditProposalResponse,
)
async def reject_edit_proposal(
    proposal_id: UUID,
    run: Annotated[ConceptNoteRun, Depends(authorized_edit_run)],
    service: Annotated[ConceptNoteEditService, Depends(edit_service)],
) -> EditProposalResponse:
    """Idempotently reject or cancel a proposal; no chapter revision is written."""
    require_active_run(run)
    return await service.reject(run, proposal_id)


@router.post(
    "/concept-notes/{run_id}/edit-proposals/{proposal_id}/refine",
    response_model=EditProposalResponse,
    status_code=202,
)
async def refine_edit_proposal(
    proposal_id: UUID,
    payload: EditProposalRequest,
    run: Annotated[ConceptNoteRun, Depends(authorized_edit_run)],
    service: Annotated[ConceptNoteEditService, Depends(edit_service)],
    session: AsyncSession = Depends(get_session),
) -> EditProposalResponse:
    """Create a separately reviewable replacement for an owned prior proposal."""
    require_active_run(run)
    if payload.refines_proposal_id not in {None, proposal_id}:
        raise EditOperationError(
            "refinement_target_mismatch",
            "The refinement must refer to this proposal.",
            status_code=422,
        )
    await service.repository.get(
        run_id=run.run_id, user_id=run.user_id, proposal_id=proposal_id
    )
    bound = payload.model_copy(update={"refines_proposal_id": proposal_id})
    return await service.propose(
        run, bound, await load_edit_context(session, run.run_id)
    )
