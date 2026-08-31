"""Authorized persistence workflow for Concept Note chapter validation."""

from __future__ import annotations

import logging
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterValidationResponse,
    ConceptNoteValidationCheckResponse,
    ConceptNoteValidationFindingResponse,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceValidationInputChangedError,
    WorkspaceValidationSnapshot,
)
from app.services.cnb.application_context import (
    ConceptNoteApplicationContextService,
    calculate_application_template_fingerprint,
)
from app.services.cnb.chapter_validation import (
    ConceptNoteChapterValidationService,
    build_chapter_validation_request,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ALLOWED_CHAPTER_VALIDATION_STEPS = frozenset({"drafting_document", "editing_document"})


class ChapterValidationWorkflowError(Exception):
    """Stable workflow failure exposed by the API and run-scoped agent tool."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        """Store the public error code, HTTP status, and safe message."""
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ConceptNoteChapterValidationWorkflowService:
    """Load, evaluate, and atomically persist one authorized chapter result."""

    def __init__(
        self,
        *,
        workflow_session: AsyncSession,
        workspace: ConceptNoteWorkspaceRepository | None = None,
        validator: ConceptNoteChapterValidationService | None = None,
        application_context: ConceptNoteApplicationContextService | None = None,
    ) -> None:
        """Store workflow and independently managed CNB persistence dependencies."""
        self._workspace = workspace or ConceptNoteWorkspaceRepository(
            get_cnb_reference_session_factory()
        )
        self._validator = validator or ConceptNoteChapterValidationService()
        self._application_context = application_context or (
            ConceptNoteApplicationContextService(workflow_session=workflow_session)
        )

    async def validate(
        self,
        *,
        run: ConceptNoteRun,
        chapter_id: UUID,
    ) -> ConceptNoteChapterValidationResponse:
        """Run both checks and persist the result when every input stays current.

        Args:
            run: Already authorized Concept Note run owned by the caller.
            chapter_id: Active chapter within that run to evaluate and update.

        Returns:
            The fresh persisted validation result for the requested chapter.

        Raises:
            ChapterValidationWorkflowError: When workflow state, storage, chapter
                identity, or concurrent input changes prevent a safe write.
        """
        if run.workflow_step not in ALLOWED_CHAPTER_VALIDATION_STEPS:
            raise ChapterValidationWorkflowError(
                "chapter_validation_not_allowed",
                409,
                "Chapter validation is available only while drafting or editing",
            )

        # Step 1: load the reviewed template included in the validation input.
        application_context = await self._application_context.load_for_run(run)
        template = application_context.template
        if template is None:
            raise ChapterValidationWorkflowError(
                "chapter_validation_template_unavailable",
                409,
                "The selected application template is unavailable",
            )
        template_fingerprint = calculate_application_template_fingerprint(template)

        # Step 2: snapshot all remaining LLM and deterministic inputs.
        try:
            context = await self._workspace.load_validation_context(
                run_id=run.run_id,
                chapter_id=chapter_id,
                template_fingerprint=template_fingerprint,
            )
        except ValueError as exc:
            raise ChapterValidationWorkflowError(
                "concept_note_chapter_not_found",
                404,
                "Concept Note chapter was not found",
            ) from exc
        except (OSError, SQLAlchemyError) as exc:
            logger.exception(
                "Failed to load chapter validation inputs run_id=%s chapter_id=%s",
                run.run_id,
                chapter_id,
            )
            raise ChapterValidationWorkflowError(
                "cnb_storage_unavailable",
                503,
                "Concept Note validation storage is unavailable",
            ) from exc

        # Step 3: run both LLM passes against the fingerprinted snapshot.
        request = build_chapter_validation_request(
            context,
            template=template,
        )
        decision = await self._validator.validate(request)

        # Step 4: recheck the independently stored template before publishing.
        latest_application_context = await self._application_context.load_for_run(run)
        latest_template = latest_application_context.template
        if (
            latest_template is None
            or calculate_application_template_fingerprint(latest_template)
            != template_fingerprint
        ):
            raise ChapterValidationWorkflowError(
                "chapter_revision_changed",
                409,
                "The document or application template changed during validation; "
                "run validation again",
            )

        # Step 5: recheck workspace inputs and publish result/status together.
        try:
            stored = await self._workspace.upsert_validation(
                run_id=run.run_id,
                chapter_id=chapter_id,
                template_fingerprint=template_fingerprint,
                expected_fingerprint=decision.validation_input_fingerprint,
                status=decision.status,
                checks=[check.model_dump(mode="json") for check in decision.checks],
                findings=[
                    finding.model_dump(mode="json") for finding in decision.findings
                ],
            )
        except WorkspaceValidationInputChangedError as exc:
            raise ChapterValidationWorkflowError(
                "chapter_revision_changed",
                409,
                "The document or application template changed during validation; "
                "run validation again",
            ) from exc
        except (OSError, SQLAlchemyError) as exc:
            logger.exception(
                "Failed to persist chapter validation run_id=%s chapter_id=%s",
                run.run_id,
                chapter_id,
            )
            raise ChapterValidationWorkflowError(
                "cnb_storage_unavailable",
                503,
                "Concept Note validation storage is unavailable",
            ) from exc

        return chapter_validation_response(stored)


def chapter_validation_response(
    snapshot: WorkspaceValidationSnapshot,
) -> ConceptNoteChapterValidationResponse:
    """Convert one detached persistence snapshot into the public contract."""
    return ConceptNoteChapterValidationResponse(
        status=snapshot.status,
        is_stale=snapshot.is_stale,
        validated_revision_number=snapshot.validated_revision_number,
        validated_at=snapshot.validated_at,
        checks=[
            ConceptNoteValidationCheckResponse.model_validate(check)
            for check in snapshot.checks
        ],
        findings=[
            ConceptNoteValidationFindingResponse.model_validate(finding)
            for finding in snapshot.findings
        ],
    )
