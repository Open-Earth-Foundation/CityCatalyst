"""Hidden chat turn that checks files uploaded after drafting against open gaps.

Uploading a file to a drafted note rebuilds the context bundle but leaves the
draft untouched. The CNB frontend requests this turn once the new files are in
the bundle; Clima then checks the open gaps against them and, when the turn
carries an edit scope, proposes reviewable edits for the gaps they answer.
The service owns the request text, and each upload is reviewed at most once:
the claim records reviewed uploads on the run, and a failed turn releases them.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
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

from app.config.settings import PromptsConfig

logger = logging.getLogger(__name__)

CONCEPT_NOTE_TURN_OPTION = "concept_note_turn"
SOURCE_REVIEW_TURN = "source_review"
SOURCE_REVIEW_REQUEST_MARKER = "CONCEPT_NOTE_SOURCE_REVIEW_REQUEST"
SOURCE_REVIEW_UNAVAILABLE = "concept_note_source_review_unavailable"


@dataclass(frozen=True)
class NewSource:
    """One ready bundled source uploaded after the latest drafting run began."""

    upload_id: UUID
    source_index: int
    filename: str


@dataclass(frozen=True)
class SourceReviewRequest:
    """Server-owned request text and the uploads it names."""

    run_id: UUID
    upload_ids: tuple[UUID, ...]
    content: str


def is_source_review_turn(options: Any) -> bool:
    """Return whether the request asks for the hidden source review turn."""
    return (
        isinstance(options, dict)
        and options.get(CONCEPT_NOTE_TURN_OPTION) == SOURCE_REVIEW_TURN
    )


def source_review_instructions(prompts: PromptsConfig) -> str:
    """Compose the CNB chat instructions with the source review turn instructions."""
    return (
        f"{prompts.compose_prompt('cnb_chat')}\n\n"
        "<turn_instructions>\n"
        f"{prompts.get_prompt('cnb_source_review')}\n"
        "</turn_instructions>"
    )


def build_source_review_content(sources: list[NewSource]) -> str:
    """Write the review request that is also the edit instruction for this turn."""
    files = ", ".join(
        f"{json.dumps(source.filename, ensure_ascii=False)} (source {source.source_index})"
        for source in sources
    )
    return (
        f"{SOURCE_REVIEW_REQUEST_MARKER}\n"
        f"New files were uploaded after this concept note was drafted: {files}. "
        "Check the open missing-information gaps against these files. Where a file "
        "supplies a missing fact, add it to the chapter that asks for it and cite "
        "the file. Change nothing the new files do not support."
    )


async def find_new_sources(session: AsyncSession, run: ConceptNoteRun) -> list[NewSource]:
    """Return bundled sources uploaded after drafting began and not yet reviewed.

    Nothing is pending until drafting has completed and the context bundle that
    contains the new files is ready, so the review sees the files it names.
    """
    # Step 1: only a finished draft with a ready bundle can be reviewed.
    drafted_at = _reviewable_since(run)
    if drafted_at is None:
        return []
    summary = run.context_summary

    # Step 2: compare bundled sources with their upload times and past reviews.
    bundle_row = await session.get(ConceptNoteContextBundle, run.run_id)
    sources = normalize_bundle(
        bundle_row.context_bundle if bundle_row is not None else None
    ).selected_sources
    if not sources:
        return []
    received = dict(
        (
            await session.execute(
                select(ConceptNoteUpload.upload_id, ConceptNoteUpload.received_at).where(
                    ConceptNoteUpload.upload_id.in_([s.upload_id for s in sources])
                )
            )
        ).all()
    )
    reviewed = set((summary.get("source_review") or {}).get("reviewed_upload_ids", []))
    return [
        NewSource(
            upload_id=source.upload_id,
            source_index=index,
            filename=source.filename,
        )
        for index, source in enumerate(sources, start=1)
        if str(source.upload_id) not in reviewed
        and source.upload_id in received
        and _as_utc(received[source.upload_id]) > drafted_at
    ]


async def load_source_review_pending(
    session_factory: async_sessionmaker[AsyncSession], run: ConceptNoteRun
) -> bool:
    """Return whether the run has new files waiting for a source review turn.

    The draft state is polled often, so the loaded run is checked first and the
    database is only read once drafting has finished with a ready bundle.
    """
    if _reviewable_since(run) is None:
        return False
    try:
        async with session_factory() as session:
            return bool(await find_new_sources(session, run))
    except (OSError, SQLAlchemyError):
        # The draft stays readable; the review simply waits for the next poll.
        logger.warning(
            "Could not check new Concept Note sources run_id=%s",
            run.run_id,
            exc_info=True,
        )
        return False


async def prepare_source_review(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None,
    thread_id: str | UUID,
    user_id: str,
) -> SourceReviewRequest:
    """Build the review request for the thread's run without claiming it.

    Raises 409 when no new file is waiting, the thread is not the run's chat, or
    the run belongs to someone else.
    """
    if session_factory is None:
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"})
    try:
        async with session_factory() as session:
            run = await _thread_run(session, thread_id=thread_id, user_id=user_id)
            sources = await find_new_sources(session, run)
    except HTTPException:
        raise
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to prepare Concept Note source review")
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"}) from exc
    if not sources:
        raise _unavailable()
    return SourceReviewRequest(
        run_id=run.run_id,
        upload_ids=tuple(source.upload_id for source in sources),
        content=build_source_review_content(sources),
    )


async def claim_source_review(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None,
    request: SourceReviewRequest,
    user_id: str,
) -> tuple[UUID, tuple[UUID, ...]]:
    """Mark the request's still-pending uploads as reviewed, right before streaming.

    Returns the run and claimed upload IDs. Raises 409 when another tab already
    reviewed them.
    """
    if session_factory is None:
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"})
    try:
        async with session_factory() as session, session.begin():
            run = await session.scalar(
                select(ConceptNoteRun)
                .where(ConceptNoteRun.run_id == request.run_id)
                .with_for_update()
            )
            if run is None or run.user_id != user_id:
                raise _unavailable()
            pending = {source.upload_id for source in await find_new_sources(session, run)}
            claimed = tuple(
                upload_id for upload_id in request.upload_ids if upload_id in pending
            )
            if not claimed:
                raise _unavailable()
            _set_reviewed(run, _reviewed_ids(run) | {str(item) for item in claimed})
            logger.info(
                "Claimed Concept Note source review run_id=%s uploads=%s",
                run.run_id,
                len(claimed),
            )
            return run.run_id, claimed
    except HTTPException:
        raise
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to claim Concept Note source review")
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"}) from exc


async def release_source_review(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None,
    run_id: UUID,
    user_id: str,
    upload_ids: tuple[UUID, ...],
) -> None:
    """Make the uploads of a failed review turn reviewable again."""
    if session_factory is None:
        return
    try:
        async with session_factory() as session, session.begin():
            run = await session.scalar(
                select(ConceptNoteRun)
                .where(ConceptNoteRun.run_id == run_id)
                .with_for_update()
            )
            if run is None or run.user_id != user_id:
                return
            _set_reviewed(run, _reviewed_ids(run) - {str(item) for item in upload_ids})
    except Exception:
        logger.exception(
            "Failed to release Concept Note source review run_id=%s", run_id
        )


async def _thread_run(
    session: AsyncSession, *, thread_id: str | UUID, user_id: str
) -> ConceptNoteRun:
    """Resolve the thread's run, requiring the user's own run bound to that thread."""
    thread = await ThreadService(session).get_thread_for_user(thread_id, user_id)
    run_id = extract_concept_note_run_id(thread.context)
    run = await session.get(ConceptNoteRun, UUID(run_id)) if run_id else None
    if run is None or run.user_id != user_id or run.thread_id != thread.thread_id:
        raise _unavailable()
    return run


def _reviewable_since(run: ConceptNoteRun) -> datetime | None:
    """Return when the finished draft began, or None while nothing is reviewable."""
    summary = run.context_summary if isinstance(run.context_summary, dict) else {}
    draft = summary.get("draft_document") or {}
    bundle_progress = summary.get("context_bundle") or {}
    if draft.get("status") != "complete" or bundle_progress.get("status") != "ready":
        return None
    return _parse_time(draft.get("started_at"))


def _reviewed_ids(run: ConceptNoteRun) -> set[str]:
    summary = run.context_summary if isinstance(run.context_summary, dict) else {}
    return set((summary.get("source_review") or {}).get("reviewed_upload_ids", []))


def _set_reviewed(run: ConceptNoteRun, reviewed: set[str]) -> None:
    """Replace the run summary so the JSON column change is persisted."""
    summary = run.context_summary if isinstance(run.context_summary, dict) else {}
    run.context_summary = {
        **summary,
        "source_review": {"reviewed_upload_ids": sorted(reviewed)},
    }


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return _as_utc(datetime.fromisoformat(value))
    except ValueError:
        return None


def _as_utc(value: datetime) -> datetime:
    """Treat naive database timestamps as UTC so they compare with ISO times."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _unavailable() -> HTTPException:
    return HTTPException(409, detail={"code": SOURCE_REVIEW_UNAVAILABLE})
