"""Application workflow around two-pass validation and atomic persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_application_context import (
    ApplicationContextTemplate,
)
from app.models.cnb.concept_note_chapter_validation import (
    ChapterValidationCheck,
    ChapterValidationDecision,
)
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


def _template() -> ApplicationContextTemplate:
    """Build the reviewed template required by the validation workflow."""
    return ApplicationContextTemplate(
        id=uuid4(),
        name="Application template",
        chapter_schema=[
            {
                "chapter_ref": "budget",
                "title": "Budget",
                "required": True,
            }
        ],
        required_fields=["Project budget"],
    )


def _validation_context() -> WorkspaceValidationContext:
    """Build one deterministic repository snapshot for workflow tests."""
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
    """Build a complete fixed-check decision returned by the core validator."""
    keys = (
        "required_content",
        "template_constraints",
        "blocking_gaps",
        "evidence_citations",
        "internal_consistency",
        "cross_chapter_consistency",
    )
    return ChapterValidationDecision(
        target_chapter_id=context.target.chapter_id,
        validated_revision_number=context.target.revision_number,
        validation_input_fingerprint=context.fingerprint,
        status="ready",
        checks=[
            ChapterValidationCheck(
                key=key,
                label=key.replace("_", " ").title(),
                status="pass",
            )
            for key in keys
        ],
        findings=[],
    )


@pytest.mark.asyncio
async def test_workflow_runs_core_then_persists_same_fingerprint() -> None:
    """Publish a result only after the core returns both validation passes."""
    context = _validation_context()
    decision = _decision(context)
    stored = WorkspaceValidationSnapshot(
        validation_id=uuid4(),
        status="ready",
        is_stale=False,
        validated_revision_id=context.target.revision_id,
        validated_revision_number=context.target.revision_number,
        validation_input_fingerprint=context.fingerprint,
        validated_at=datetime.now(UTC),
        checks=[check.model_dump(mode="json") for check in decision.checks],
        findings=[],
    )
    workspace = MagicMock()
    workspace.load_validation_context = AsyncMock(return_value=context)
    workspace.upsert_validation = AsyncMock(return_value=stored)
    validator = MagicMock()
    validator.validate = AsyncMock(return_value=decision)
    application_context = MagicMock()
    template = _template()
    application_context.load_for_run = AsyncMock(
        return_value=SimpleNamespace(template=template)
    )
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=workspace,
        validator=validator,
        application_context=application_context,
    )
    run = SimpleNamespace(
        run_id=uuid4(),
        workflow_step="editing_document",
    )

    response = await service.validate(
        run=run,
        chapter_id=context.target.chapter_id,
    )

    assert response.status == "ready"
    template_fingerprint = calculate_application_template_fingerprint(template)
    application_context.load_for_run.assert_has_awaits([call(run), call(run)])
    workspace.load_validation_context.assert_awaited_once_with(
        run_id=run.run_id,
        chapter_id=context.target.chapter_id,
        template_fingerprint=template_fingerprint,
    )
    validator.validate.assert_awaited_once()
    workspace.upsert_validation.assert_awaited_once_with(
        run_id=run.run_id,
        chapter_id=context.target.chapter_id,
        template_fingerprint=template_fingerprint,
        expected_fingerprint=context.fingerprint,
        status="ready",
        checks=[check.model_dump(mode="json") for check in decision.checks],
        findings=[],
    )


@pytest.mark.asyncio
async def test_workflow_maps_post_llm_fingerprint_race_to_stable_409() -> None:
    """Never persist an evaluation made against a changed document snapshot."""
    context = _validation_context()
    workspace = MagicMock()
    workspace.load_validation_context = AsyncMock(return_value=context)
    workspace.upsert_validation = AsyncMock(
        side_effect=WorkspaceValidationInputChangedError()
    )
    validator = MagicMock()
    validator.validate = AsyncMock(return_value=_decision(context))
    application_context = MagicMock()
    application_context.load_for_run = AsyncMock(
        return_value=SimpleNamespace(template=_template())
    )
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=workspace,
        validator=validator,
        application_context=application_context,
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await service.validate(
            run=SimpleNamespace(
                run_id=uuid4(),
                workflow_step="editing_document",
            ),
            chapter_id=context.target.chapter_id,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "chapter_revision_changed"


@pytest.mark.asyncio
async def test_workflow_rejects_a_template_change_during_validation() -> None:
    """Never persist a model result evaluated against superseded constraints."""
    context = _validation_context()
    workspace = MagicMock()
    workspace.load_validation_context = AsyncMock(return_value=context)
    workspace.upsert_validation = AsyncMock()
    validator = MagicMock()
    validator.validate = AsyncMock(return_value=_decision(context))
    original_template = _template()
    changed_template = original_template.model_copy(
        update={"required_fields": ["Project budget", "Delivery timeline"]}
    )
    application_context = MagicMock()
    application_context.load_for_run = AsyncMock(
        side_effect=[
            SimpleNamespace(template=original_template),
            SimpleNamespace(template=changed_template),
        ]
    )
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=workspace,
        validator=validator,
        application_context=application_context,
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await service.validate(
            run=SimpleNamespace(
                run_id=uuid4(),
                workflow_step="editing_document",
            ),
            chapter_id=context.target.chapter_id,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "chapter_revision_changed"
    workspace.upsert_validation.assert_not_called()


@pytest.mark.asyncio
async def test_workflow_rejects_validation_outside_drafting_and_editing() -> None:
    """Keep the explicit action unavailable during context assembly/interviewing."""
    workspace = MagicMock()
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=workspace,
        validator=MagicMock(),
        application_context=MagicMock(),
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await service.validate(
            run=SimpleNamespace(
                run_id=uuid4(),
                workflow_step="interviewing",
            ),
            chapter_id=uuid4(),
        )

    assert exc_info.value.code == "chapter_validation_not_allowed"
    workspace.load_validation_context.assert_not_called()


@pytest.mark.asyncio
async def test_workflow_preserves_state_when_template_is_unavailable() -> None:
    """Never claim readiness when required application constraints cannot load."""
    context = _validation_context()
    workspace = MagicMock()
    workspace.load_validation_context = AsyncMock(return_value=context)
    validator = MagicMock()
    application_context = MagicMock()
    application_context.load_for_run = AsyncMock(
        return_value=SimpleNamespace(template=None)
    )
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=workspace,
        validator=validator,
        application_context=application_context,
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await service.validate(
            run=SimpleNamespace(
                run_id=uuid4(),
                workflow_step="editing_document",
            ),
            chapter_id=context.target.chapter_id,
        )

    assert exc_info.value.code == "chapter_validation_template_unavailable"
    workspace.load_validation_context.assert_not_called()
    validator.validate.assert_not_called()
    workspace.upsert_validation.assert_not_called()
