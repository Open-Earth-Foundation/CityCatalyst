"""Atomic persistence for PDF-first Concept Note context-bundle builds."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.models.cnb.context_bundle import ConceptNoteContextBundle, SelectedSource
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import ConceptNoteRun, ConceptNoteUpload
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)

ALLOWED_SOURCE_QUERY_STEPS = frozenset(
    {"interviewing", "drafting_document", "editing_document"}
)


class ContextBundlePersistenceError(Exception):
    """Persistence failure with a stable public code and HTTP status."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class ContextBundleBuildSnapshot:
    """Detached inputs for one guarded bundle build."""

    run_id: UUID
    city_id: str
    build_id: UUID
    uploads: list[ConceptNoteUploadSnapshot]
    already_current: bool


@dataclass(frozen=True)
class ContextBundleQuerySource:
    """Authorized selected source and immutable upload identity."""

    source: SelectedSource
    upload: ConceptNoteUploadSnapshot


async def begin_build(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    user_id: str,
    run_id: UUID,
    build_id: UUID,
    force: bool = False,
) -> ContextBundleBuildSnapshot:
    """Snapshot ready uploads and persist the active guarded build."""
    try:
        async with session_factory() as session, session.begin():
            run = await _require_owned_run(
                session=session,
                user_id=user_id,
                run_id=run_id,
            )
            uploads = list(
                (
                    await session.scalars(
                        select(ConceptNoteUpload)
                        .where(ConceptNoteUpload.run_id == run_id)
                        .order_by(
                            ConceptNoteUpload.received_at.asc(),
                            ConceptNoteUpload.upload_id.asc(),
                        )
                    )
                ).all()
            )
            ready_uploads = [
                _upload_snapshot(upload)
                for upload in uploads
                if upload.ingest_status == "ready"
            ]
            fingerprint = source_fingerprint(ready_uploads)
            previous = _bundle_progress(run.context_summary)
            already_current = bool(
                not force
                and previous.get("status") == "ready"
                and previous.get("source_fingerprint") == fingerprint
                and ready_uploads
            )
            if not already_current:
                status_counts: dict[str, int] = {}
                for upload in uploads:
                    status_counts[upload.ingest_status] = (
                        status_counts.get(upload.ingest_status, 0) + 1
                    )
                run.context_summary = _replace_bundle_progress(
                    run.context_summary,
                    {
                        "build_id": str(build_id),
                        "source_fingerprint": fingerprint,
                        "status": "building",
                        "source_counts": {
                            "ready": len(ready_uploads),
                            "queued": status_counts.get("queued", 0),
                            "processing": status_counts.get("processing", 0),
                            "failed": status_counts.get("failed", 0),
                        },
                        "optional_sources": {
                            "ghgi": "pending",
                            "hiap": "pending",
                        },
                        "warnings": [],
                        "retryable": False,
                        "completion_event": None,
                    },
                )
                run.status = "active"
                run.updated_at = datetime.now(timezone.utc)
            return ContextBundleBuildSnapshot(
                run_id=run_id,
                city_id=run.city_id,
                build_id=build_id,
                uploads=ready_uploads,
                already_current=already_current,
            )
    except ContextBundlePersistenceError:
        raise
    except (OSError, SQLAlchemyError) as exc:
        logger.exception("Failed to begin Concept Note context-bundle build")
        raise ContextBundlePersistenceError(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is unavailable",
        ) from exc


async def complete_build(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    user_id: str,
    run_id: UUID,
    build_id: UUID,
    selected_sources: list[SelectedSource],
    ghgi: dict[str, Any] | None,
    hiap: dict[str, Any] | None,
    optional_sources: dict[str, str],
    warnings: list[str],
) -> bool:
    """Commit only the active build's owned bundle sections."""
    try:
        async with session_factory() as session, session.begin():
            run = await _require_owned_run(
                session=session,
                user_id=user_id,
                run_id=run_id,
            )
            progress = _bundle_progress(run.context_summary)
            if progress.get("build_id") != str(
                build_id
            ) or not await _matches_current_source_fingerprint(
                session=session,
                run_id=run_id,
                progress=progress,
            ):
                logger.info(
                    "Skipped stale Concept Note context build run_id=%s build_id=%s",
                    run_id,
                    build_id,
                )
                return False
            ready_count = progress.get("source_counts", {}).get("ready")
            selected_upload_ids = {source.upload_id for source in selected_sources}
            if (
                not selected_sources
                or ready_count != len(selected_sources)
                or len(selected_upload_ids) != len(selected_sources)
            ):
                raise ContextBundlePersistenceError(
                    "incomplete_source_coverage",
                    409,
                    "Every ready city PDF must be analyzed exactly once",
                )

            bundle_row = await session.get(
                ConceptNoteContextBundleRow,
                run_id,
                with_for_update=True,
            )
            if bundle_row is None:
                bundle_row = ConceptNoteContextBundleRow(
                    run_id=run_id,
                    context_bundle={},
                )
                session.add(bundle_row)
            bundle = normalize_bundle(bundle_row.context_bundle)
            bundle.selected_sources = selected_sources
            bundle.cc_context.ghgi = ghgi
            bundle.cc_context.hiap = hiap
            bundle_row.context_bundle = bundle.model_dump(mode="json")

            run.context_summary = _replace_bundle_progress(
                run.context_summary,
                {
                    **progress,
                    "status": "ready",
                    "optional_sources": optional_sources,
                    "warnings": warnings,
                    "retryable": False,
                    "completion_event": "concept_note_context_bundle_ready",
                },
            )
            if run.workflow_step == "assembling_context":
                run.workflow_step = "interviewing"
            run.status = "active"
            run.updated_at = datetime.now(timezone.utc)
            return True
    except ContextBundlePersistenceError:
        raise
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to complete Concept Note context-bundle build")
        raise ContextBundlePersistenceError(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is unavailable",
        ) from exc


async def fail_build(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    user_id: str,
    run_id: UUID,
    build_id: UUID,
    error_code: str,
    warning: str,
) -> bool:
    """Persist a retryable failure only if this build is still active."""
    try:
        async with session_factory() as session, session.begin():
            run = await _require_owned_run(
                session=session,
                user_id=user_id,
                run_id=run_id,
            )
            progress = _bundle_progress(run.context_summary)
            if (
                progress.get("status") != "building"
                or progress.get("build_id") != str(build_id)
                or not await _matches_current_source_fingerprint(
                    session=session,
                    run_id=run_id,
                    progress=progress,
                )
            ):
                return False
            run.context_summary = _replace_bundle_progress(
                run.context_summary,
                {
                    **progress,
                    "status": "failed",
                    "error_code": error_code,
                    "warnings": [warning],
                    "retryable": True,
                    "completion_event": None,
                },
            )
            # The run remains active while its persisted bundle status records
            # the retryable failure. This avoids inventing a new run-level
            # lifecycle state for an in-process background task.
            run.status = "active"
            run.updated_at = datetime.now(timezone.utc)
            return True
    except ContextBundlePersistenceError:
        raise
    except (OSError, SQLAlchemyError) as exc:
        logger.exception("Failed to persist Concept Note context-bundle failure")
        raise ContextBundlePersistenceError(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is unavailable",
        ) from exc


async def recover_stale_builds(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    stale_before: datetime,
) -> int:
    """Mark interrupted context-bundle builds retryable after their stale cutoff."""
    try:
        async with session_factory() as session, session.begin():
            query = (
                select(ConceptNoteRun)
                .where(
                    ConceptNoteRun.status == "active",
                    ConceptNoteRun.updated_at < stale_before,
                    (
                        ConceptNoteRun.context_summary["context_bundle"]["status"]
                        .as_string()
                        == "building"
                    ),
                )
                .with_for_update(skip_locked=True)
            )
            runs = list((await session.scalars(query)).all())
            recovered_at = datetime.now(timezone.utc)
            recovered = 0
            for run in runs:
                progress = _bundle_progress(run.context_summary)
                if progress.get("status") != "building":
                    continue
                run.context_summary = _replace_bundle_progress(
                    run.context_summary,
                    {
                        **progress,
                        "status": "failed",
                        "error_code": "context_bundle_build_interrupted",
                        "warnings": [
                            "Context bundle assembly was interrupted and can be retried."
                        ],
                        "retryable": True,
                        "completion_event": None,
                    },
                )
                run.updated_at = recovered_at
                recovered += 1
            return recovered
    except (OSError, SQLAlchemyError) as exc:
        logger.exception("Failed to recover stale Concept Note context-bundle builds")
        raise ContextBundlePersistenceError(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is unavailable",
        ) from exc


async def load_query_source(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    user_id: str,
    run_id: UUID,
    upload_id: UUID,
) -> ContextBundleQuerySource:
    """Authorize a ready selected source for the active workflow step."""
    try:
        async with session_factory() as session:
            run = await _require_owned_run(
                session=session,
                user_id=user_id,
                run_id=run_id,
                lock=False,
            )
            if run.workflow_step not in ALLOWED_SOURCE_QUERY_STEPS:
                raise ContextBundlePersistenceError(
                    "concept_note_source_query_not_allowed",
                    409,
                    "Source query is not available in the current workflow step",
                )
            if _bundle_progress(run.context_summary).get("status") != "ready":
                raise ContextBundlePersistenceError(
                    "concept_note_context_bundle_not_ready",
                    409,
                    "Concept Note context bundle is not ready",
                )
            bundle_row = await session.get(ConceptNoteContextBundleRow, run_id)
            bundle = normalize_bundle(
                bundle_row.context_bundle if bundle_row is not None else None
            )
            source = next(
                (
                    item
                    for item in bundle.selected_sources
                    if item.upload_id == upload_id
                ),
                None,
            )
            if source is None:
                raise ContextBundlePersistenceError(
                    "concept_note_source_not_selected",
                    404,
                    "Selected Concept Note source was not found",
                )
            upload = await session.get(ConceptNoteUpload, upload_id)
            if (
                upload is None
                or upload.run_id != run_id
                or upload.uploaded_by_user_id != user_id
                or upload.ingest_status != "ready"
                or upload.markdown_sha256 != source.sha256
            ):
                raise ContextBundlePersistenceError(
                    "concept_note_source_unavailable",
                    409,
                    "Selected Concept Note source is no longer available",
                )
            return ContextBundleQuerySource(
                source=source,
                upload=_upload_snapshot(upload),
            )
    except ContextBundlePersistenceError:
        raise
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to load Concept Note query source")
        raise ContextBundlePersistenceError(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is unavailable",
        ) from exc


async def load_agent_context(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    user_id: str,
    run_id: UUID,
) -> dict[str, Any] | None:
    """Return compact ready bundle context for the authorized CNB agent."""
    try:
        async with session_factory() as session:
            run = await _require_owned_run(
                session=session,
                user_id=user_id,
                run_id=run_id,
                lock=False,
            )
            bundle_progress = _bundle_progress(run.context_summary)
            if bundle_progress.get("status") != "ready":
                return None
            bundle_row = await session.get(ConceptNoteContextBundleRow, run_id)
            bundle = normalize_bundle(
                bundle_row.context_bundle if bundle_row is not None else None
            )
            return {
                "concept_note_run_id": str(run_id),
                "workflow_step": run.workflow_step,
                "context_bundle_status": bundle_progress,
                "selected_sources": [
                    {
                        "upload_id": str(source.upload_id),
                        "source_label": source.source_label,
                        "filename": source.filename,
                        "page_count": source.page_count,
                        "summary": source.summary,
                        "topics": source.topics,
                    }
                    for source in bundle.selected_sources
                ],
                "cc_context": bundle.cc_context.model_dump(mode="json"),
                "funder_context": bundle.funder_context,
                "similar_projects": bundle.similar_projects,
                "document_context": bundle.document_context,
            }
    except ContextBundlePersistenceError:
        raise
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to load Concept Note agent context")
        raise ContextBundlePersistenceError(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is unavailable",
        ) from exc


async def _require_owned_run(
    *,
    session: AsyncSession,
    user_id: str,
    run_id: UUID,
    lock: bool = True,
) -> ConceptNoteRun:
    """Load a run and enforce canonical user ownership."""
    query = select(ConceptNoteRun).where(ConceptNoteRun.run_id == run_id)
    if lock:
        query = query.with_for_update()
    run = await session.scalar(query)
    if run is None:
        raise ContextBundlePersistenceError(
            "concept_note_run_not_found",
            404,
            "Concept Note run was not found",
        )
    if run.user_id != user_id:
        raise ContextBundlePersistenceError(
            "concept_note_run_forbidden",
            403,
            "Concept Note run belongs to another user",
        )
    return run


def source_fingerprint(uploads: list[ConceptNoteUploadSnapshot]) -> str:
    """Hash the deterministic ready-upload set without including storage keys."""
    # Skip unchanged bundles and reject stale build writes when ready sources change.
    payload = [
        {
            "upload_id": str(upload.upload_id),
            "sha256": upload.markdown_sha256,
            "page_count": upload.page_count,
        }
        for upload in uploads
    ]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


async def _matches_current_source_fingerprint(
    *,
    session: AsyncSession,
    run_id: UUID,
    progress: dict[str, Any],
) -> bool:
    """Reject a build as soon as the persisted ready-upload set changes."""
    uploads = list(
        (
            await session.scalars(
                select(ConceptNoteUpload)
                .where(
                    ConceptNoteUpload.run_id == run_id,
                    ConceptNoteUpload.ingest_status == "ready",
                )
                .order_by(
                    ConceptNoteUpload.received_at.asc(),
                    ConceptNoteUpload.upload_id.asc(),
                )
            )
        ).all()
    )
    return progress.get("source_fingerprint") == source_fingerprint(
        [_upload_snapshot(upload) for upload in uploads]
    )


def normalize_bundle(value: Any) -> ConceptNoteContextBundle:
    """Validate a bundle while letting its typed defaults fill missing sections."""
    if value is None:
        return ConceptNoteContextBundle()
    if not isinstance(value, dict):
        raise ValueError("Concept Note context bundle must be a JSON object")
    return ConceptNoteContextBundle.model_validate(value)


def _bundle_progress(summary: Any) -> dict[str, Any]:
    """Read the nested context-bundle progress object defensively."""
    if not isinstance(summary, dict):
        return {}
    progress = summary.get("context_bundle")
    return progress if isinstance(progress, dict) else {}


def _replace_bundle_progress(summary: Any, progress: dict[str, Any]) -> dict[str, Any]:
    """Replace only context-bundle progress and preserve unrelated run metadata."""
    return {
        **(summary if isinstance(summary, dict) else {}),
        "context_bundle": progress,
    }


def _upload_snapshot(upload: ConceptNoteUpload) -> ConceptNoteUploadSnapshot:
    """Detach one upload row for background processing."""
    return ConceptNoteUploadSnapshot(
        upload_id=upload.upload_id,
        run_id=upload.run_id,
        user_id=upload.uploaded_by_user_id,
        filename=upload.filename,
        source_label=upload.source_label,
        markdown_s3_key=upload.markdown_s3_key,
        markdown_sha256=upload.markdown_sha256,
        page_count=upload.page_count,
        status=upload.ingest_status,
        error_code=upload.ingest_error_code,
        received_at=upload.received_at,
        completed_at=upload.ingest_completed_at,
    )
