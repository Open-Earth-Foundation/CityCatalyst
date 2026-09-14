"""Reject CNB chat turns before persistence when their source context is not ready."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.persistence.concept_notes.context_bundle import normalize_bundle
from app.services.thread_service import ThreadService
from app.utils.concept_note_context import extract_concept_note_run_id
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


async def require_chat_context_ready(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None,
    thread_id: str | UUID,
    user_id: str,
    context: Any,
    options: dict[str, Any] | None,
) -> None:
    """Validate the same request/thread CNB scope used by the streaming handler.

    Raise 409 with ``concept_note_context_not_ready`` for pending, failed, or
    stale context. Ready city-only runs are supported. Ownership and storage
    errors retain distinct statuses; no user message or agent is created here.
    """
    requested_run_id = extract_concept_note_run_id(context, options)
    if session_factory is None:
        if requested_run_id:
            raise HTTPException(503, detail={"code": "cnb_storage_unavailable"})
        return

    try:
        async with session_factory() as session:
            # Read canonical thread scope even when the client omits CNB context.
            thread = await ThreadService(session).get_thread_for_user(
                thread_id, user_id
            )
            run_id = requested_run_id or extract_concept_note_run_id(thread.context)
            if run_id is None:
                return
            try:
                run_uuid = UUID(run_id)
            except ValueError as exc:
                raise HTTPException(
                    400, detail={"code": "invalid_concept_note_run_id"}
                ) from exc

            # Authorize before exposing any readiness information.
            run = await session.get(ConceptNoteRun, run_uuid)
            if run is None:
                raise HTTPException(404, detail={"code": "concept_note_run_not_found"})
            if run.user_id != user_id:
                raise HTTPException(403, detail={"code": "concept_note_run_forbidden"})
            uploads = list(
                (
                    await session.scalars(
                        select(ConceptNoteUpload)
                        .where(ConceptNoteUpload.run_id == run_uuid)
                        .order_by(
                            ConceptNoteUpload.received_at.desc(),
                            ConceptNoteUpload.upload_id.desc(),
                        )
                    )
                ).all()
            )
            progress = (run.context_summary or {}).get("context_bundle", {})
            bundle_row = await session.get(ConceptNoteContextBundle, run_uuid)

            # Match the UI recovery rule: old failures do not poison a newer
            # upload, while pending uploads and a failed latest upload block.
            pending = any(
                upload.ingest_status in {"queued", "processing"} for upload in uploads
            )
            latest_failed = bool(uploads and uploads[0].ingest_status == "failed")
            ready = {
                upload.upload_id: upload.markdown_sha256
                for upload in uploads
                if upload.ingest_status == "ready"
            }
            bundle = normalize_bundle(bundle_row.context_bundle if bundle_row else None)
            selected = {
                source.upload_id: source.sha256 for source in bundle.selected_sources
            }
            if (
                pending
                or latest_failed
                or progress.get("status") != "ready"
                or bundle_row is None
                or selected != ready
                or (ready and progress.get("document_grounding") != "uploaded_evidence")
            ):
                logger.info("Blocked CNB chat pending context run_id=%s", run_uuid)
                raise HTTPException(
                    409,
                    detail={
                        "code": "concept_note_context_not_ready",
                        "message": "Concept Note document context is not ready. Review context and retry when preparation finishes.",
                    },
                )
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to validate Concept Note chat readiness")
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"}) from exc
