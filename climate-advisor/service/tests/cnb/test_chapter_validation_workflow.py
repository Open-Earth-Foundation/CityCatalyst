"""Validation workflow, atomic persistence and the public HTTP action."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from app.main import get_app
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_chapter_validation import ChapterValidationDecision
from app.models.cnb.concept_note_draft import ConceptNoteChapterValidationResponse
from app.persistence.concept_notes.workspace_validation import (
    WorkspaceValidationChapter,
    WorkspaceValidationContext,
    WorkspaceValidationInputChangedError,
    WorkspaceValidationSnapshot,
)
from app.routes.concept_note_chapter_validation import (
    get_chapter_validation_workflow_service,
)
from app.services.cnb.application_context import (
    calculate_application_template_fingerprint,
)
from app.services.cnb.chapter_validation import (
    ChapterValidationTemplateError,
    ConceptNoteChapterValidationService,
)
from app.services.cnb.chapter_validation_workflow import (
    ChapterValidationWorkflowError,
    ConceptNoteChapterValidationWorkflowService,
    chapter_validation_response,
)
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.exc import SQLAlchemyError


def _template() -> ApplicationContextTemplate:
    return ApplicationContextTemplate(
        id=uuid4(),
        name="Application template",
        chapter_schema=[
            {
                "chapter_ref": "budget",
                "required": True,
                "required_fields": ["Project budget"],
            }
        ],
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


def _run(workflow_step: str = "editing_document") -> SimpleNamespace:
    return SimpleNamespace(
        run_id=uuid4(), user_id="user-1", workflow_step=workflow_step
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


def test_public_response_preserves_validation_source_provenance() -> None:
    snapshot = WorkspaceValidationSnapshot(
        validation_id=uuid4(),
        status="needs_review",
        is_stale=False,
        validated_revision_id=uuid4(),
        validated_revision_number=2,
        validation_input_fingerprint="a" * 64,
        validated_at=datetime.now(UTC),
        findings=[
            {
                "phase": "evidence",
                "category": "evidence",
                "severity": "warning",
                "message": "The stated date conflicts with the delivery plan.",
                "suggested_action": "Confirm the approved date.",
                "involved_chapter_ids": [str(uuid4())],
                "excerpts": ["Works begin in March 2028."],
                "evidence": [
                    {
                        "selected_source_label": "Delivery plan",
                        "source_location": "page 7",
                        "claim_ref": "implementation start date",
                        "quote_or_summary": "Works begin in March 2027.",
                    }
                ],
            }
        ],
    )

    response = chapter_validation_response(snapshot)

    assert response.findings[0].evidence[0].selected_source_label == "Delivery plan"
    assert response.findings[0].evidence[0].source_location == "page 7"


async def test_workflow_persists_the_validated_fingerprint() -> None:
    context = _context()
    template = _template()
    workflow, workspace, *_ = _workflow(
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

    response = await workflow.validate(run=_run(), chapter_id=context.target.chapter_id)

    assert response.status == "ready"
    persisted = workspace.upsert_validation.await_args.kwargs
    assert persisted["expected_fingerprint"] == context.fingerprint
    assert persisted["template_fingerprint"] == (
        calculate_application_template_fingerprint(template)
    )


async def test_workflow_maps_post_llm_fingerprint_race_to_409() -> None:
    workflow, *_rest, context = _workflow(
        upsert_effect=WorkspaceValidationInputChangedError()
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(run=_run(), chapter_id=context.target.chapter_id)

    assert (exc_info.value.status_code, exc_info.value.code) == (
        409,
        "chapter_revision_changed",
    )


async def test_workflow_rejects_template_change_during_validation() -> None:
    original = _template()
    changed = original.model_copy(deep=True)
    changed.chapter_schema[0]["required_fields"] = ["Project budget", "Currency"]
    workflow, workspace, *_rest, context = _workflow(
        template_effect=[
            SimpleNamespace(template=original),
            SimpleNamespace(template=changed),
        ]
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(run=_run(), chapter_id=context.target.chapter_id)

    assert exc_info.value.code == "chapter_revision_changed"
    workspace.upsert_validation.assert_not_called()


async def test_invalid_assignments_never_persist_a_validation_result() -> None:
    template = _template()
    template.chapter_schema[0].pop("required_fields")
    workflow, workspace, _, _, context = _workflow(
        template_effect=[SimpleNamespace(template=template)]
    )
    run_pass = AsyncMock()
    workflow._validator = ConceptNoteChapterValidationService(run_pass=run_pass)

    with pytest.raises(ChapterValidationTemplateError):
        await workflow.validate(run=_run(), chapter_id=context.target.chapter_id)

    run_pass.assert_not_awaited()
    workspace.upsert_validation.assert_not_called()


async def test_workflow_rejects_disallowed_state() -> None:
    workflow, workspace, *_ = _workflow()

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(run=_run("interviewing"), chapter_id=uuid4())

    assert exc_info.value.code == "chapter_validation_not_allowed"
    workspace.load_validation_context.assert_not_called()


async def test_workflow_requires_application_template() -> None:
    workflow, workspace, validator, *_ = _workflow(
        template_effect=[SimpleNamespace(template=None)]
    )

    with pytest.raises(ChapterValidationWorkflowError) as exc_info:
        await workflow.validate(run=_run(), chapter_id=uuid4())

    assert exc_info.value.code == "chapter_validation_template_unavailable"
    workspace.load_validation_context.assert_not_called()
    validator.validate.assert_not_called()


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
        await workflow.validate(run=_run(), chapter_id=uuid4())

    assert (exc_info.value.status_code, exc_info.value.code) == (
        503,
        "cnb_storage_unavailable",
    )
    workspace.upsert_validation.assert_not_called()


# --- HTTP action ---------------------------------------------------------------


def _post_validation(service: object) -> tuple[Response, UUID]:
    """Post one request with isolated authorization and validation services."""
    app = get_app()
    run_id = uuid4()
    chapter_id = uuid4()
    app.dependency_overrides[get_chapter_validation_workflow_service] = lambda: service
    authorized_run = SimpleNamespace(
        run_id=run_id,
        user_id="owner",
        workflow_step="editing_document",
    )
    try:
        with (
            patch(
                "app.routes.concept_note_chapter_validation."
                "ConceptNoteRunService.get_authorized_run",
                AsyncMock(return_value=authorized_run),
            ),
            TestClient(app) as client,
        ):
            response = client.post(
                f"/v1/concept-notes/{run_id}/chapters/{chapter_id}/validation",
                params={"user_id": "owner"},
                headers={"Authorization": "Bearer token"},
            )
    finally:
        app.dependency_overrides.clear()
    return response, chapter_id


def test_validation_route_returns_persisted_result_with_chapter_id() -> None:
    validation = ConceptNoteChapterValidationResponse(
        status="needs_review",
        is_stale=False,
        validated_revision_number=3,
        validated_at=datetime.now(UTC),
        findings=[],
    )
    service = SimpleNamespace(validate=AsyncMock(return_value=validation))

    response, chapter_id = _post_validation(service)

    assert response.status_code == 200
    payload = response.json()
    assert payload["chapter_id"] == str(chapter_id)
    assert payload["status"] == "needs_review"
    assert payload["validated_revision_number"] == 3
    assert service.validate.await_args.kwargs["chapter_id"] == chapter_id


@pytest.mark.parametrize(
    ("error", "code", "detail"),
    [
        (
            ChapterValidationWorkflowError(
                "chapter_revision_changed",
                409,
                "The document changed during validation; run validation again",
            ),
            "chapter_revision_changed",
            "Unable to validate the requested chapter",
        ),
        (
            ChapterValidationTemplateError("private source data"),
            "chapter_validation_template_invalid",
            ChapterValidationTemplateError.public_message,
        ),
    ],
    ids=["workflow-error", "invalid-template"],
)
def test_validation_route_returns_stable_code_and_safe_detail(
    error: Exception, code: str, detail: str
) -> None:
    """Return a stable code without exposing the internal exception message."""
    service = SimpleNamespace(validate=AsyncMock(side_effect=error))

    response, _ = _post_validation(service)

    assert response.status_code == 409
    assert response.json() == {"code": code, "detail": detail, "status": 409}
