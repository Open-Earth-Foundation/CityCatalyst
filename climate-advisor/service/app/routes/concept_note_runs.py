"""Authenticated Concept Note run lifecycle routes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from app.db.session import get_session
from app.models.cnb.concept_note_application_context import (
    ConceptNoteApplicationContextResponse,
)
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterConfirmRequest,
    ConceptNoteDraftResponse,
    ConceptNoteGapResolveRequest,
)
from app.models.cnb.concept_note_runs import (
    ConceptNoteRenameRequest,
    ConceptNoteRunListResponse,
    ConceptNoteRunResponse,
    ConceptNoteStartRequest,
)
from app.services.cnb.application_context import (
    ConceptNoteApplicationContextService,
)
from app.services.cnb.chapter_drafting import (
    ChapterDraftingError,
    ConceptNoteChapterDraftService,
    get_chapter_draft_service,
    schedule_chapter_drafting,
    schedule_gap_regeneration,
)
from app.services.cnb.context_bundle import (
    ContextBundleService,
    get_context_bundle_service,
)
from app.services.concept_note_runs import ConceptNoteRunService
from app.services.concept_note_lifecycle import ConceptNoteLifecycleService
from app.utils.cnb_observability import CNBInteraction
from app.utils.mlflow_logging import (
    climate_advisor_experiment_name,
    log_tags,
    set_span_outputs,
    start_run as start_mlflow_run,
    start_trace_span,
    update_current_trace_context,
)
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

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
    context_bundle_service: Annotated[
        ContextBundleService | None,
        Depends(get_context_bundle_service),
    ],
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Create a concept-note run or replay an identical idempotent request."""
    interaction = CNBInteraction.START
    with start_mlflow_run(
        run_name=interaction.mlflow_run_name,
        experiment_name=climate_advisor_experiment_name(),
        tags={
            "endpoint": "/v1/concept-notes/start",
            "workflow": "CNB",
            "workflow_name": "concept_note_run_lifecycle",
            "interaction": interaction.value,
        },
    ), start_trace_span(
        name="CNB start",
        span_type="CHAIN",
        attributes={
            "workflow": "CNB",
            "workflow_name": "concept_note_run_lifecycle",
            "interaction": interaction.value,
        },
    ) as span:
        service = ConceptNoteRunService(session)
        response = await service.start_run_and_schedule_context(
            payload,
            authorization=authorization,
            context_bundle_service=context_bundle_service,
        )
        result = "created" if response.created else "replayed"
        correlation_tags = {
            "concept_note_run_id": str(response.run_id),
            "result": result,
        }
        log_tags(correlation_tags)
        update_current_trace_context(
            session_id=response.run_id,
            tags={
                "workflow": "CNB",
                "interaction": interaction.value,
                **correlation_tags,
            },
            metadata=correlation_tags,
        )
        set_span_outputs(span, correlation_tags)

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


@router.patch(
    "/concept-notes/{run_id}",
    response_model=ConceptNoteRunResponse,
)
async def rename_concept_note_run(
    run_id: UUID,
    payload: ConceptNoteRenameRequest,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteRunResponse:
    """Rename one active concept note and its dedicated chat."""
    service = ConceptNoteLifecycleService(session)
    return await service.rename_run(
        run_id=run_id,
        payload=payload,
        requested_user_id=user_id,
        authorization=authorization,
    )


@router.post(
    "/concept-notes/{run_id}/duplicate",
    response_model=ConceptNoteRunResponse,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": ConceptNoteRunResponse}},
)
async def duplicate_concept_note_run(
    run_id: UUID,
    user_id: str = Query(..., min_length=1),
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Create or replay an independent working copy of a concept note."""
    service = ConceptNoteLifecycleService(session)
    response, created = await service.duplicate_run(
        run_id=run_id,
        idempotency_key=idempotency_key,
        requested_user_id=user_id,
        authorization=authorization,
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        content=jsonable_encoder(response),
    )


@router.delete(
    "/concept-notes/{run_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_concept_note_run(
    run_id: UUID,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Permanently delete one concept note and its dedicated chat."""
    service = ConceptNoteLifecycleService(session)
    await service.delete_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/concept-notes/{run_id}/application-context",
    response_model=ConceptNoteApplicationContextResponse,
)
async def get_concept_note_application_context(
    run_id: UUID,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteApplicationContextResponse:
    """Return one authorized run's reviewed funder, programme, and template."""
    run_service = ConceptNoteRunService(session)
    run = await run_service.get_authorized_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    application_context_service = ConceptNoteApplicationContextService(
        workflow_session=session
    )
    return await application_context_service.load_for_run(run)


@router.get(
    "/concept-notes/{run_id}/draft",
    response_model=ConceptNoteDraftResponse,
)
async def get_concept_note_draft_state(
    run_id: UUID,
    draft_service: Annotated[
        ConceptNoteChapterDraftService | None,
        Depends(get_chapter_draft_service),
    ],
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteDraftResponse:
    """Return the dedicated chapter-drafting workspace for one run."""
    run_service = ConceptNoteRunService(session)
    run = await run_service.get_authorized_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    if draft_service is None:
        raise HTTPException(
            status_code=503,
            detail="Concept Note chapter drafting is unavailable",
        )
    return await draft_service.load_state(run)


@router.post(
    "/concept-notes/{run_id}/draft",
    response_model=ConceptNoteDraftResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_concept_note_drafting(
    run_id: UUID,
    draft_service: Annotated[
        ConceptNoteChapterDraftService | None,
        Depends(get_chapter_draft_service),
    ],
    http_response: Response,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteDraftResponse:
    """Start or resume the independent sequential drafting process."""
    run_service = ConceptNoteRunService(session)
    run = await run_service.get_authorized_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    if draft_service is None:
        raise HTTPException(
            status_code=503,
            detail="Concept Note chapter drafting is unavailable",
        )
    try:
        draft, build_id = await draft_service.start(run)
        if build_id is not None:
            schedule_chapter_drafting(
                service=draft_service,
                run_id=run.run_id,
                user_id=run.user_id,
                build_id=build_id,
            )
        else:
            http_response.status_code = status.HTTP_200_OK
        return draft
    except ChapterDraftingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post(
    "/concept-notes/{run_id}/gaps/{gap_id}/resolve",
    response_model=ConceptNoteDraftResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={200: {"model": ConceptNoteDraftResponse}},
)
async def resolve_concept_note_gap(
    run_id: UUID,
    gap_id: UUID,
    payload: ConceptNoteGapResolveRequest,
    draft_service: Annotated[
        ConceptNoteChapterDraftService | None,
        Depends(get_chapter_draft_service),
    ],
    http_response: Response,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteDraftResponse:
    """Accept one audited gap disposition and regenerate its chapter."""
    run_service = ConceptNoteRunService(session)
    run = await run_service.get_authorized_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    if draft_service is None:
        raise HTTPException(
            status_code=503,
            detail="Concept Note chapter drafting is unavailable",
        )
    try:
        draft, start = await draft_service.resolve_gap(
            run=run,
            gap_id=gap_id,
            payload=payload,
        )
        if start.should_regenerate:
            schedule_gap_regeneration(
                service=draft_service,
                run_id=run.run_id,
                user_id=run.user_id,
                chapter_id=start.chapter_id,
                gap_id=gap_id,
                resolution_id=start.resolution_id,
            )
        else:
            http_response.status_code = status.HTTP_200_OK
        return draft
    except ChapterDraftingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post(
    "/concept-notes/{run_id}/chapters/{chapter_id}/confirm",
    response_model=ConceptNoteDraftResponse,
)
async def confirm_concept_note_chapter(
    run_id: UUID,
    chapter_id: UUID,
    payload: ConceptNoteChapterConfirmRequest,
    draft_service: Annotated[
        ConceptNoteChapterDraftService | None,
        Depends(get_chapter_draft_service),
    ],
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> ConceptNoteDraftResponse:
    """Confirm one exact gap-free chapter revision as Ready."""
    run_service = ConceptNoteRunService(session)
    run = await run_service.get_authorized_run(
        run_id=run_id,
        requested_user_id=user_id,
        authorization=authorization,
    )
    if draft_service is None:
        raise HTTPException(
            status_code=503,
            detail="Concept Note chapter drafting is unavailable",
        )
    try:
        return await draft_service.confirm_chapter(
            run=run,
            chapter_id=chapter_id,
            payload=payload,
        )
    except ChapterDraftingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
