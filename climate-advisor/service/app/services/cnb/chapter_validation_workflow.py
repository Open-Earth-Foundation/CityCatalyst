"""Authorized persistence workflow for Concept Note chapter validation."""

from __future__ import annotations

import logging
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.concept_note_application_context import (
    ApplicationContextTemplate,
)
from app.models.cnb.concept_note_chapter_validation import ChapterValidationDecision
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterValidationResponse,
    ConceptNoteValidationCheckResponse,
    ConceptNoteValidationFindingResponse,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceValidationContext,
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
REVISION_CHANGED_MESSAGE = (
    "The document or application template changed during validation; "
    "run validation again"
)
STORAGE_UNAVAILABLE_MESSAGE = "Concept Note validation storage is unavailable"


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
        # Step 1: authorize the workflow state and freeze the reviewed template.
        if run.workflow_step not in ALLOWED_CHAPTER_VALIDATION_STEPS:
            raise ChapterValidationWorkflowError(
                "chapter_validation_not_allowed",
                409,
                "Chapter validation is available only while drafting or editing",
            )
        template = await self._load_template(run=run, chapter_id=chapter_id)
        if template is None:
            raise ChapterValidationWorkflowError(
                "chapter_validation_template_unavailable",
                409,
                "The selected application template is unavailable",
            )
        template_fingerprint = calculate_application_template_fingerprint(template)

        # Step 2: snapshot all remaining LLM and deterministic inputs.
        context = await self._load_validation_context(
            run=run,
            chapter_id=chapter_id,
            template_fingerprint=template_fingerprint,
        )

        # Step 3: run both LLM passes against the fingerprinted snapshot.
        decision = await self._validator.validate(
            build_chapter_validation_request(context, template=template)
        )

        # Step 4: recheck the independently stored template before publishing.
        latest_template = await self._load_template(run=run, chapter_id=chapter_id)
        if (
            latest_template is None
            or calculate_application_template_fingerprint(latest_template)
            != template_fingerprint
        ):
            raise ChapterValidationWorkflowError(
                "chapter_revision_changed",
                409,
                REVISION_CHANGED_MESSAGE,
            )

        # Step 5: recheck workspace inputs and publish result/status together.
        stored = await self._persist_decision(
            run=run,
            chapter_id=chapter_id,
            template_fingerprint=template_fingerprint,
            decision=decision,
        )
        return chapter_validation_response(stored)

    async def _load_validation_context(
        self,
        *,
        run: ConceptNoteRun,
        chapter_id: UUID,
        template_fingerprint: str,
    ) -> WorkspaceValidationContext:
        """Load the fingerprinted workspace context with stable public errors."""
        try:
            return await self._workspace.load_validation_context(
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
                STORAGE_UNAVAILABLE_MESSAGE,
            ) from exc

    async def _persist_decision(
        self,
        *,
        run: ConceptNoteRun,
        chapter_id: UUID,
        template_fingerprint: str,
        decision: ChapterValidationDecision,
    ) -> WorkspaceValidationSnapshot:
        """Atomically publish a decision if the workspace fingerprint is current."""
        try:
            return await self._workspace.upsert_validation(
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
                REVISION_CHANGED_MESSAGE,
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
                STORAGE_UNAVAILABLE_MESSAGE,
            ) from exc

    async def _load_template(
        self,
        *,
        run: ConceptNoteRun,
        chapter_id: UUID,
    ) -> ApplicationContextTemplate | None:
        """Load template state while preserving the workflow's stable storage error."""
        try:
            application_context = await self._application_context.load_for_run(run)
        except (OSError, SQLAlchemyError) as exc:
            logger.exception(
                "Failed to load chapter validation template run_id=%s chapter_id=%s",
                run.run_id,
                chapter_id,
            )
            raise ChapterValidationWorkflowError(
                "cnb_storage_unavailable",
                503,
                STORAGE_UNAVAILABLE_MESSAGE,
            ) from exc
        return application_context.template


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
