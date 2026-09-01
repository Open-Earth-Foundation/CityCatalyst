"""Application workflow around validation and atomic persistence."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_chapter_validation import ChapterValidationDecision
from app.persistence.concept_notes.workspace import (
    WorkspaceValidationChapter,
    WorkspaceValidationContext,
    WorkspaceValidationInputChangedError,
    WorkspaceValidationSnapshot,
)
from app.services.cnb.application_context import (
    calculate_application_template_fingerprint,
)
from app.services.cnb.chapter_validation_workflow import (
    ChapterValidationWorkflowError,
    ConceptNoteChapterValidationWorkflowService,
)
from sqlalchemy.exc import SQLAlchemyError


def _template() -> ApplicationContextTemplate:
    return ApplicationContextTemplate(
        id=uuid4(),
        name="Application template",
        chapter_schema=[{"chapter_ref": "budget", "required": True}],
        required_fields=["Project budget"],
    )


def _context() -> WorkspaceValidationContext:
    chapter = WorkspaceValidationChapter(
        chapter_id=uuid4(),
        chapter_ref="budget",
        title="Budget",
        position=0,
        status="draft",
        required=True,
        body_markdown="The project costs EUR 2 million.",
        revision_id=uuid4(),
        revision_number=2,
    )
    return WorkspaceValidationContext(
        target=chapter,
        chapters=[chapter],
        open_gaps=[],
        evidence_links=[],
        fingerprint="a" * 64,
    )


def _decision(context: WorkspaceValidationContext) -> ChapterValidationDecision:
    return ChapterValidationDecision(
        target_chapter_id=context.target.chapter_id,
        validated_revision_number=2,
        validation_input_fingerprint=context.fingerprint,
        status="ready",
        findings=[],
    )


def _workflow(
    *,
    context: WorkspaceValidationContext | None = None,
    template_effect: object | None = None,
    upsert_effect: Exception | None = None,
):
    context = context or _context()
    workspace = MagicMock()
    workspace.load_validation_context = AsyncMock(return_value=context)
    workspace.upsert_validation = AsyncMock(side_effect=upsert_effect)
    validator = MagicMock()
    validator.validate = AsyncMock(return_value=_decision(context))
    application_context = MagicMock()
    if template_effect is None:
        application_context.load_for_run = AsyncMock(
            return_value=SimpleNamespace(template=_template())
        )
    else:
        application_context.load_for_run = AsyncMock(side_effect=template_effect)
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=workspace,
        validator=validator,
        application_context=application_context,
    )
    return service, workspace, validator, application_context, context


@pytest.mark.asyncio
async def test_workflow_persists_the_validated_fingerprint() -> None:
    context = _context()
    template = _template()
    workflow, workspace, validator, app_context, _ = _workflow(
        context=context,
        template_effect=[
            SimpleNamespace(template=template),
            SimpleNamespace(template=template),
        ],
    )
    workspace.upsert_validation.return_value = WorkspaceValidationSnapshot(
        validation_id=uuid4(),
        status="ready",
        is_stale=False,
        validated_revision_id=context.target.revision_id,
        validated_revision_number=2,
        validation_input_fingerprint=context.fingerprint,
        validated_at=datetime.now(UTC),
        findings=[],
    )
    run = SimpleNamespace(run_id=uuid4(), workflow_step="editing_document")

    response = await workflow.validate(run=run, chapter_id=context.target.chapter_id)

    assert response.status == "ready"
    assert len(response.checks) == 6
    app_context.load_for_run.assert_has_awaits([call(run), call(run)])
    validator.validate.assert_awaited_once()
    assert workspace.upsert_validation.await_args.kwargs["expected_fingerprint"] == (
        context.fingerprint
    )
    assert workspace.upsert_validation.await_args.kwargs["template_fingerprint"] == (
        calculate_application_template_fingerprint(template)
    )


@pytest.mark.asyncio
async def test_workflow_maps_post_llm_fingerprint_race_to_409() -> None:
    workflow, *_rest, context = _workflow(
        upsert_effect=WorkspaceValidationInputChangedError()
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(
            run=SimpleNamespace(run_id=uuid4(), workflow_step="editing_document"),
            chapter_id=context.target.chapter_id,
        )

    assert (exc_info.value.status_code, exc_info.value.code) == (
        409,
        "chapter_revision_changed",
    )


@pytest.mark.asyncio
async def test_workflow_rejects_template_change_during_validation() -> None:
    original = _template()
    changed = original.model_copy(update={"required_fields": ["Changed field"]})
    workflow, workspace, *_rest, context = _workflow(
        template_effect=[
            SimpleNamespace(template=original),
            SimpleNamespace(template=changed),
        ]
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(
            run=SimpleNamespace(run_id=uuid4(), workflow_step="editing_document"),
            chapter_id=context.target.chapter_id,
        )

    assert exc_info.value.code == "chapter_revision_changed"
    workspace.upsert_validation.assert_not_called()


@pytest.mark.asyncio
async def test_workflow_rejects_disallowed_state() -> None:
    workflow, workspace, *_ = _workflow()

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(
            run=SimpleNamespace(run_id=uuid4(), workflow_step="interviewing"),
            chapter_id=uuid4(),
        )

    assert exc_info.value.code == "chapter_validation_not_allowed"
    workspace.load_validation_context.assert_not_called()


@pytest.mark.asyncio
async def test_workflow_requires_application_template() -> None:
    workflow, workspace, validator, *_ = _workflow(
        template_effect=[SimpleNamespace(template=None)]
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(
            run=SimpleNamespace(run_id=uuid4(), workflow_step="editing_document"),
            chapter_id=uuid4(),
        )

    assert exc_info.value.code == "chapter_validation_template_unavailable"
    workspace.load_validation_context.assert_not_called()
    validator.validate.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "template_effect",
    [
        [OSError("offline")],
        [SimpleNamespace(template=_template()), SQLAlchemyError("offline")],
    ],
)
async def test_workflow_maps_template_storage_failures_to_503(
    template_effect: list[object],
) -> None:
    workflow, workspace, *_ = _workflow(template_effect=template_effect)

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(
            run=SimpleNamespace(run_id=uuid4(), workflow_step="editing_document"),
            chapter_id=uuid4(),
        )

    assert (exc_info.value.status_code, exc_info.value.code) == (
        503,
        "cnb_storage_unavailable",
    )
    workspace.upsert_validation.assert_not_called()
