from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import get_session_factory
from app.models.concept_note_markdown import ConceptNoteMarkdownRequest
from app.models.db.concept_note import ConceptNoteRun, ConceptNoteUpload


logger = logging.getLogger(__name__)


class ConceptNoteMarkdownRepositoryError(Exception):
    """Base error with a stable public code and HTTP status."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ConceptNoteStorageUnavailable(ConceptNoteMarkdownRepositoryError):
    """Raised when configured Concept Note workflow storage is unavailable."""

    def __init__(self) -> None:
        super().__init__(
            "cnb_storage_unavailable",
            503,
            "Concept Note Markdown storage is unavailable",
        )


class ConceptNoteMarkdownRepository(ABC):
    """Atomic registration boundary for received Concept Note Markdown."""

    @abstractmethod
    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> None:
        """Validate ownership/binding/idempotency and durably register Markdown."""


class UnavailableConceptNoteMarkdownRepository(ConceptNoteMarkdownRepository):
    """Safe fallback when the workflow database cannot be configured."""

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> None:
        """Reject registration when durable workflow storage is unavailable."""
        raise ConceptNoteStorageUnavailable()


class SqlAlchemyConceptNoteMarkdownRepository(ConceptNoteMarkdownRepository):
    """Persist validated Markdown in the Climate Advisor workflow database."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Store the session factory used for atomic registration."""
        self._session_factory = session_factory

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> None:
        """Validate run ownership and idempotently persist one Markdown handoff."""
        try:
            async with self._session_factory() as session, session.begin():
                run = await session.scalar(
                    select(ConceptNoteRun)
                    .where(ConceptNoteRun.run_id == run_id)
                    .with_for_update()
                )
                if run is None:
                    raise ConceptNoteMarkdownRepositoryError(
                        "concept_note_run_not_found",
                        404,
                        "Concept Note run was not found",
                    )
                if run.user_id != user_id:
                    raise ConceptNoteMarkdownRepositoryError(
                        "concept_note_run_forbidden",
                        403,
                        "Concept Note run belongs to another user",
                    )

                existing = await session.get(
                    ConceptNoteUpload,
                    upload_id,
                    with_for_update=True,
                )
                if existing is not None:
                    _validate_existing_upload(
                        existing=existing,
                        run_id=run_id,
                        markdown_sha256=payload.sha256,
                    )
                    return

                upload = ConceptNoteUpload(
                    upload_id=upload_id,
                    run_id=run_id,
                    uploaded_by_user_id=user_id,
                    filename=payload.filename,
                    source_label=payload.source_label,
                    markdown_text=payload.markdown,
                    markdown_sha256=payload.sha256,
                    page_count=payload.page_count,
                    ingest_status="processing",
                    ingest_started_at=func.now(),
                )
                try:
                    async with session.begin_nested():
                        session.add(upload)
                        await session.flush()
                except IntegrityError:
                    existing = await session.get(
                        ConceptNoteUpload,
                        upload_id,
                        with_for_update=True,
                    )
                    if existing is None:
                        raise
                    _validate_existing_upload(
                        existing=existing,
                        run_id=run_id,
                        markdown_sha256=payload.sha256,
                    )
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            logger.exception(
                "Failed to persist Concept Note Markdown",
                extra={"run_id": str(run_id), "upload_id": str(upload_id)},
            )
            raise ConceptNoteStorageUnavailable() from exc


def _validate_existing_upload(
    *,
    existing: ConceptNoteUpload,
    run_id: UUID,
    markdown_sha256: str,
) -> None:
    """Enforce immutable upload-to-run binding and Markdown identity."""
    if existing.run_id != run_id:
        raise ConceptNoteMarkdownRepositoryError(
            "upload_run_binding_conflict",
            409,
            "Upload is already associated with another Concept Note run",
        )
    if existing.markdown_sha256 != markdown_sha256:
        raise ConceptNoteMarkdownRepositoryError(
            "markdown_identity_conflict",
            409,
            "Upload Markdown digest cannot change",
        )


def get_concept_note_markdown_repository() -> ConceptNoteMarkdownRepository:
    """Provide the production repository implementation."""
    try:
        return SqlAlchemyConceptNoteMarkdownRepository(get_session_factory())
    except Exception:
        logger.exception("Concept Note workflow session factory is unavailable")
        return UnavailableConceptNoteMarkdownRepository()
