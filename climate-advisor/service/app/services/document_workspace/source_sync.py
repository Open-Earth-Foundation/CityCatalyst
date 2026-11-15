"""Explicit setup sync retries the existing durable ready-source pipeline."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.persistence.concept_notes.context_bundle import normalize_bundle
from app.persistence.concept_notes.source_revalidation import queue_source_revalidation

logger = logging.getLogger(__name__)


async def queue_ready_source_sync(
    run: ConceptNoteRun, session_factory: async_sessionmaker[AsyncSession]
) -> bool:
    """Requeue still-ready, matching run sources even when setup did not change.

    An explicit user retry resets an exhausted job's attempts. Successful source
    readings remain checkpointed, so syncing does not erase candidates or force
    paid rereads of an unchanged, already successful extraction.
    """
    async with session_factory() as session, session.begin():
        current = await session.get(ConceptNoteRun, run.run_id, with_for_update=True)
        if (
            current is None
            or current.user_id != run.user_id
            or current.status != "active"
        ):
            raise HTTPException(
                409,
                "The concept note is no longer available for source synchronization.",
            )
        bundle_row = await session.get(ConceptNoteContextBundle, run.run_id)
        bundle = normalize_bundle(bundle_row.context_bundle if bundle_row else None)
        sources = {
            source.upload_id: source.sha256 for source in bundle.selected_sources
        }
        uploads = await session.scalars(
            select(ConceptNoteUpload).where(
                ConceptNoteUpload.run_id == run.run_id,
                ConceptNoteUpload.uploaded_by_user_id == run.user_id,
                ConceptNoteUpload.ingest_status == "ready",
            )
        )
        ready_ids = [
            upload.upload_id
            for upload in uploads
            if sources.get(upload.upload_id) == upload.markdown_sha256
            and upload.markdown_s3_key is not None
        ]
        if not ready_ids:
            return False
        current.context_summary = queue_source_revalidation(
            current.context_summary, ready_ids
        )
        logger.info(
            "Queued explicit document source sync run_id=%s sources=%s",
            run.run_id,
            len(ready_ids),
        )
        return True


def schedule_source_sync(run_id: UUID) -> None:
    """Start the normal retained worker; the durable job survives unavailability."""
    from app.services.cnb.context_bundle import (
        get_context_bundle_service,
        schedule_source_revalidation,
    )

    service = get_context_bundle_service()
    if service is not None:
        schedule_source_revalidation(service=service, run_id=run_id)
