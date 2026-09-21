from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from app.db.session import get_session_factory
from app.models.cnb.concept_note_markdown import (
    ConceptNoteMarkdownRequest,
    ConceptNoteSourceFormat,
    ConceptNoteUploadCreateRequest,
    source_format_from_filename,
)
from app.models.db.concept_note import ConceptNoteRun, ConceptNoteUpload
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

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
            "Concept Note upload storage is unavailable",
        )


@dataclass(frozen=True)
class ConceptNoteUploadSnapshot:
    """Detached upload state safe to return outside a database session."""

    upload_id: UUID
    run_id: UUID
    user_id: str
    filename: str
    source_label: str | None
    markdown_s3_key: str | None
    markdown_sha256: str | None
    page_count: int | None
    status: str
    error_code: str | None
    received_at: datetime
    completed_at: datetime | None
    source_format: ConceptNoteSourceFormat = "pdf"


class ConceptNoteMarkdownRepository(ABC):
    """Atomic persistence boundary for run-scoped CNB uploads."""

    @abstractmethod
    async def create_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        payload: ConceptNoteUploadCreateRequest,
    ) -> ConceptNoteUploadSnapshot:
        """Create or replay an immutable pre-conversion upload row."""

    @abstractmethod
    async def get_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        """Return an owned upload bound to the requested run."""

    @abstractmethod
    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> ConceptNoteUploadSnapshot:
        """Register the immutable CC S3 pointer and mark the upload ready."""

    @abstractmethod
    async def mark_failed(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        error_code: str,
    ) -> ConceptNoteUploadSnapshot:
        """Persist a terminal upload or OCR failure."""

    @abstractmethod
    async def retry_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        """Return a failed upload to the queued lifecycle."""

    @abstractmethod
    async def get_delivery_context(
        self,
        *,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        """Return source metadata for authenticated CC delivery."""


class UnavailableConceptNoteMarkdownRepository(ConceptNoteMarkdownRepository):
    """Safe fallback when the workflow database cannot be configured."""

    async def create_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        payload: ConceptNoteUploadCreateRequest,
    ) -> ConceptNoteUploadSnapshot:
        raise ConceptNoteStorageUnavailable()

    async def get_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        raise ConceptNoteStorageUnavailable()

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> ConceptNoteUploadSnapshot:
        raise ConceptNoteStorageUnavailable()

    async def mark_failed(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        error_code: str,
    ) -> ConceptNoteUploadSnapshot:
        raise ConceptNoteStorageUnavailable()

    async def retry_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        raise ConceptNoteStorageUnavailable()

    async def get_delivery_context(
        self,
        *,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        raise ConceptNoteStorageUnavailable()


class SqlAlchemyConceptNoteMarkdownRepository(ConceptNoteMarkdownRepository):
    """Persist CNB upload lifecycle state in the CA workflow database."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._session_factory = session_factory

    async def create_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        payload: ConceptNoteUploadCreateRequest,
    ) -> ConceptNoteUploadSnapshot:
        """Create or idempotently replay one pre-conversion upload."""
        try:
            async with self._session_factory() as session, session.begin():
                run = await _require_owned_run(
                    session=session,
                    user_id=user_id,
                    run_id=run_id,
                )
                existing = await session.get(
                    ConceptNoteUpload,
                    payload.upload_id,
                    with_for_update=True,
                )
                if existing is not None:
                    _validate_upload_identity(
                        existing=existing,
                        run_id=run_id,
                        user_id=user_id,
                        filename=payload.filename,
                        source_label=payload.source_label,
                        source_format=payload.source_format,
                    )
                    return _snapshot(existing)

                upload = ConceptNoteUpload(
                    upload_id=payload.upload_id,
                    run_id=run_id,
                    uploaded_by_user_id=user_id,
                    filename=payload.filename,
                    source_label=payload.source_label,
                    ingest_status="queued",
                )
                try:
                    async with session.begin_nested():
                        session.add(upload)
                        await session.flush()
                except IntegrityError:
                    existing = await session.get(
                        ConceptNoteUpload,
                        payload.upload_id,
                        with_for_update=True,
                    )
                    if existing is None:
                        raise
                    _validate_upload_identity(
                        existing=existing,
                        run_id=run_id,
                        user_id=user_id,
                        filename=payload.filename,
                        source_label=payload.source_label,
                        source_format=payload.source_format,
                    )
                    return _snapshot(existing)

                # Keep dashboard ordering aligned with upload lifecycle activity.
                _touch_run(run)
                await session.flush()
                await session.refresh(upload)
                return _snapshot(upload)
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            _raise_storage_unavailable(
                exc,
                message="Failed to create Concept Note upload",
                run_id=run_id,
                upload_id=payload.upload_id,
            )

    async def get_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        """Return one owned upload."""
        try:
            async with self._session_factory() as session:
                await _require_owned_run(
                    session=session,
                    user_id=user_id,
                    run_id=run_id,
                )
                upload = await session.get(ConceptNoteUpload, upload_id)
                _require_upload_binding(
                    upload=upload,
                    run_id=run_id,
                    user_id=user_id,
                )
                return _snapshot(upload)
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            _raise_storage_unavailable(
                exc,
                message="Failed to load Concept Note upload",
                run_id=run_id,
                upload_id=upload_id,
            )

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> ConceptNoteUploadSnapshot:
        """Persist one immutable CC Markdown pointer and mark it ready."""
        try:
            async with self._session_factory() as session, session.begin():
                run = await _require_owned_run(
                    session=session,
                    user_id=user_id,
                    run_id=run_id,
                )
                upload = await session.get(
                    ConceptNoteUpload,
                    upload_id,
                    with_for_update=True,
                )
                _require_upload_binding(
                    upload=upload,
                    run_id=run_id,
                    user_id=user_id,
                )
                _validate_upload_identity(
                    existing=upload,
                    run_id=run_id,
                    user_id=user_id,
                    filename=payload.filename,
                    source_label=payload.source_label,
                    source_format=payload.source_format,
                )
                if upload.markdown_sha256 is not None:
                    _validate_existing_markdown(
                        existing=upload,
                        markdown_s3_key=payload.markdown_s3_key,
                        markdown_sha256=payload.sha256,
                        page_count=payload.page_count,
                    )
                    return _snapshot(upload)

                upload.markdown_s3_key = payload.markdown_s3_key
                upload.markdown_sha256 = payload.sha256
                upload.page_count = payload.page_count
                upload.ingest_status = "ready"
                upload.ingest_error_code = None
                upload.ingest_started_at = upload.ingest_started_at or func.now()
                upload.ingest_completed_at = func.now()
                # Keep dashboard ordering aligned with upload lifecycle activity.
                _touch_run(run)
                await session.flush()
                await session.refresh(upload)
                return _snapshot(upload)
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            _raise_storage_unavailable(
                exc,
                message="Failed to persist Concept Note Markdown pointer",
                run_id=run_id,
                upload_id=upload_id,
            )

    async def mark_failed(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        error_code: str,
    ) -> ConceptNoteUploadSnapshot:
        """Mark a non-ready upload failed without deleting its identity."""
        try:
            async with self._session_factory() as session, session.begin():
                run = await _require_owned_run(
                    session=session,
                    user_id=user_id,
                    run_id=run_id,
                )
                upload = await session.get(
                    ConceptNoteUpload,
                    upload_id,
                    with_for_update=True,
                )
                _require_upload_binding(
                    upload=upload,
                    run_id=run_id,
                    user_id=user_id,
                )
                if upload.ingest_status == "ready":
                    raise ConceptNoteMarkdownRepositoryError(
                        "upload_already_ready",
                        409,
                        "A ready upload cannot be marked failed",
                    )
                upload.ingest_status = "failed"
                upload.ingest_error_code = error_code
                upload.ingest_completed_at = func.now()
                # Keep dashboard ordering aligned with upload lifecycle activity.
                _touch_run(run)
                await session.flush()
                await session.refresh(upload)
                return _snapshot(upload)
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            _raise_storage_unavailable(
                exc,
                message="Failed to mark Concept Note upload failed",
                run_id=run_id,
                upload_id=upload_id,
            )

    async def retry_upload(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        """Return a failed upload to queued state."""
        try:
            async with self._session_factory() as session, session.begin():
                run = await _require_owned_run(
                    session=session,
                    user_id=user_id,
                    run_id=run_id,
                )
                upload = await session.get(
                    ConceptNoteUpload,
                    upload_id,
                    with_for_update=True,
                )
                _require_upload_binding(
                    upload=upload,
                    run_id=run_id,
                    user_id=user_id,
                )
                if upload.ingest_status == "ready":
                    raise ConceptNoteMarkdownRepositoryError(
                        "upload_not_retryable",
                        409,
                        "A ready upload cannot be retried",
                    )
                upload.ingest_status = "queued"
                upload.ingest_error_code = None
                upload.ingest_completed_at = None
                # Keep dashboard ordering aligned with upload lifecycle activity.
                _touch_run(run)
                await session.flush()
                await session.refresh(upload)
                return _snapshot(upload)
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            _raise_storage_unavailable(
                exc,
                message="Failed to retry Concept Note upload",
                run_id=run_id,
                upload_id=upload_id,
            )

    async def get_delivery_context(
        self,
        *,
        upload_id: UUID,
    ) -> ConceptNoteUploadSnapshot:
        """Return upload metadata to an authenticated CC service request."""
        try:
            async with self._session_factory() as session:
                upload = await session.get(ConceptNoteUpload, upload_id)
                if upload is None:
                    raise ConceptNoteMarkdownRepositoryError(
                        "concept_note_upload_not_found",
                        404,
                        "Concept Note upload was not found",
                    )
                return _snapshot(upload)
        except ConceptNoteMarkdownRepositoryError:
            raise
        except (OSError, SQLAlchemyError) as exc:
            _raise_storage_unavailable(
                exc,
                message="Failed to load Concept Note delivery context",
                upload_id=upload_id,
            )


async def _require_owned_run(
    *,
    session: AsyncSession,
    user_id: str,
    run_id: UUID,
) -> ConceptNoteRun:
    run = await session.scalar(
        select(ConceptNoteRun).where(ConceptNoteRun.run_id == run_id).with_for_update()
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
    return run


def _touch_run(run: ConceptNoteRun) -> None:
    """Record upload lifecycle activity on the parent run."""
    run.updated_at = datetime.now(timezone.utc)


def _require_upload_binding(
    *,
    upload: ConceptNoteUpload | None,
    run_id: UUID,
    user_id: str,
) -> None:
    if upload is None:
        raise ConceptNoteMarkdownRepositoryError(
            "concept_note_upload_not_found",
            404,
            "Concept Note upload was not found",
        )
    if upload.run_id != run_id:
        raise ConceptNoteMarkdownRepositoryError(
            "upload_run_binding_conflict",
            409,
            "Upload is associated with another Concept Note run",
        )
    if upload.uploaded_by_user_id != user_id:
        raise ConceptNoteMarkdownRepositoryError(
            "concept_note_upload_forbidden",
            403,
            "Concept Note upload belongs to another user",
        )


def _validate_upload_identity(
    *,
    existing: ConceptNoteUpload,
    run_id: UUID,
    user_id: str,
    filename: str,
    source_label: str | None,
    source_format: ConceptNoteSourceFormat,
) -> None:
    _require_upload_binding(
        upload=existing,
        run_id=run_id,
        user_id=user_id,
    )
    if (
        existing.filename != filename
        or existing.source_label != source_label
        or source_format_from_filename(existing.filename) != source_format
    ):
        raise ConceptNoteMarkdownRepositoryError(
            "upload_identity_conflict",
            409,
            "Upload metadata cannot change",
        )


def _validate_existing_markdown(
    *,
    existing: ConceptNoteUpload,
    markdown_s3_key: str,
    markdown_sha256: str,
    page_count: int | None,
) -> None:
    if (
        existing.markdown_s3_key != markdown_s3_key
        or existing.markdown_sha256 != markdown_sha256
        or existing.page_count != page_count
    ):
        raise ConceptNoteMarkdownRepositoryError(
            "markdown_identity_conflict",
            409,
            "Upload Markdown identity cannot change",
        )


def _snapshot(upload: ConceptNoteUpload) -> ConceptNoteUploadSnapshot:
    return ConceptNoteUploadSnapshot(
        upload_id=upload.upload_id,
        run_id=upload.run_id,
        user_id=upload.uploaded_by_user_id,
        filename=upload.filename,
        source_label=upload.source_label,
        source_format=source_format_from_filename(upload.filename),
        markdown_s3_key=upload.markdown_s3_key,
        markdown_sha256=upload.markdown_sha256,
        page_count=upload.page_count,
        status=upload.ingest_status,
        error_code=upload.ingest_error_code,
        received_at=upload.received_at,
        completed_at=upload.ingest_completed_at,
    )


def _raise_storage_unavailable(
    exc: Exception,
    *,
    message: str,
    run_id: UUID | None = None,
    upload_id: UUID | None = None,
) -> None:
    logger.exception(
        message,
        extra={
            "run_id": str(run_id) if run_id else None,
            "upload_id": str(upload_id) if upload_id else None,
        },
    )
    raise ConceptNoteStorageUnavailable() from exc


def get_concept_note_markdown_repository() -> ConceptNoteMarkdownRepository:
    """Provide the production repository implementation."""
    try:
        return SqlAlchemyConceptNoteMarkdownRepository(get_session_factory())
    except Exception:
        logger.exception("Concept Note workflow session factory is unavailable")
        return UnavailableConceptNoteMarkdownRepository()
