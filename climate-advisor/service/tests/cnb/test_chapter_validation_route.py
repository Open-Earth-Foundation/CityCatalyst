"""HTTP contracts for explicit Concept Note chapter validation."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.main import get_app
from app.models.cnb.concept_note_draft import ConceptNoteChapterValidationResponse
from app.routes.concept_note_chapter_validation import (
    get_chapter_validation_workflow_service,
)
from app.services.cnb.chapter_validation_workflow import (
    ChapterValidationWorkflowError,
)
from fastapi.testclient import TestClient


def _post_validation(service: object) -> tuple[object, object, object]:
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
    return response, run_id, chapter_id


def test_validation_route_returns_persisted_result_with_chapter_id() -> None:
    """Expose the fresh result through the stable public action contract."""
    validated_at = datetime.now(UTC)
    validation = ConceptNoteChapterValidationResponse(
        status="needs_review",
        is_stale=False,
        validated_revision_number=3,
        validated_at=validated_at,
        findings=[],
    )
    service = SimpleNamespace(validate=AsyncMock(return_value=validation))

    response, run_id, chapter_id = _post_validation(service)

    assert response.status_code == 200
    payload = response.json()
    assert payload["chapter_id"] == str(chapter_id)
    assert payload["status"] == "needs_review"
    assert payload["validated_revision_number"] == 3
    service.validate.assert_awaited_once_with(
        run=SimpleNamespace(
            run_id=run_id,
            user_id="owner",
            workflow_step="editing_document",
        ),
        chapter_id=chapter_id,
    )


def test_validation_route_preserves_error_code_and_sanitizes_detail() -> None:
    """Return a stable code without exposing the internal exception message."""
    service = SimpleNamespace(
        validate=AsyncMock(
            side_effect=ChapterValidationWorkflowError(
                "chapter_revision_changed",
                409,
                "The document changed during validation; run validation again",
            )
        )
    )

    response, _, _ = _post_validation(service)

    assert response.status_code == 409
    assert response.json() == {
        "code": "chapter_revision_changed",
        "detail": "Unable to validate the requested chapter",
        "status": 409,
    }
