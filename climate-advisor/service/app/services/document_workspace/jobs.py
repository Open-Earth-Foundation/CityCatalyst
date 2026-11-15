"""Leased durable propagation of accepted point revisions into chapter text."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config.settings import get_settings
from app.db.session import get_session_factory
from app.models.cnb.concept_note_edits import EditChange
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter, ConceptNoteChapterRevision
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.document_workspace import (
    DocumentDependency,
    DocumentPoint,
    DocumentUpdateJob,
)
from app.persistence.concept_notes.gaps import (
    _chapter_gaps,
    _dropped_unanswered_gaps,
    _reconcile_evidence_gaps,
    _restore_dropped_gaps,
)
from app.persistence.concept_notes.workspace import _require_marker_parity
from app.services.document_workspace.requirements import fingerprint
from app.services.document_workspace.service import ACCEPTED, DocumentWorkspaceService

logger = logging.getLogger(__name__)
LEASE_DURATION = timedelta(minutes=15)


async def point_context(
    service: DocumentWorkspaceService, run_id: UUID
) -> list[dict[str, Any]]:
    """Return accepted values and declared unknowns without database identifiers."""
    async with service.session_factory() as session:
        rows = await session.scalars(
            select(DocumentPoint)
            .where(DocumentPoint.run_id == run_id, DocumentPoint.active.is_(True))
            .order_by(DocumentPoint.semantic_key)
        )
        return [
            {
                "key": point.semantic_key,
                "label": point.definition["label"],
                "description": point.definition["description"],
                "chapter_refs": point.definition["chapter_refs"],
                "required": point.definition["required"],
                "version": point.accepted_version,
                "status": point.disposition,
                "value": point.value if point.disposition in ACCEPTED else None,
                "reason": (
                    point.task.get("note")
                    if point.task
                    and point.disposition in {"assumption", "not_applicable"}
                    else None
                ),
            }
            for point in rows
        ]


async def claim_job(service: DocumentWorkspaceService) -> tuple[UUID, UUID] | None:
    """Claim queued/retryable or expired work with a fencing lease token."""
    now = datetime.now(UTC)
    async with service.session_factory() as session, session.begin():
        await session.execute(
            update(DocumentUpdateJob)
            .where(
                DocumentUpdateJob.status == "running",
                DocumentUpdateJob.lease_until < now,
                DocumentUpdateJob.attempts >= 5,
            )
            .values(
                status="failed",
                error_code="document_point_retries_exhausted",
                lease_token=None,
                lease_until=None,
            )
        )
        job = await session.scalar(
            select(DocumentUpdateJob)
            .where(
                DocumentUpdateJob.kind == "draft",
                DocumentUpdateJob.available_at <= now,
                or_(
                    DocumentUpdateJob.status.in_(["queued", "failed"]),
                    (DocumentUpdateJob.status == "running")
                    & (DocumentUpdateJob.lease_until < now),
                ),
                DocumentUpdateJob.attempts < 5,
            )
            .order_by(DocumentUpdateJob.available_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            return None
        job.status, job.lease_token = "running", uuid4()
        job.lease_until = now + LEASE_DURATION
        job.attempts += 1
        return job.job_id, job.lease_token


async def refresh_reviews(service: DocumentWorkspaceService) -> None:
    """Finish propagation only after all persisted proposals were applied."""
    async with service.session_factory() as session:
        pending = list(
            await session.execute(
                select(DocumentUpdateJob.job_id, DocumentUpdateJob.run_id).where(
                    DocumentUpdateJob.status == "pending_review"
                )
            )
        )
    for job_id, run_id in pending:
        async with service.session_factory() as session, session.begin():
            # Match point-command lock order: state, then job. Locking jobs
            # first can deadlock a command that is invalidating old proposals.
            state = await service._state(session, run_id)
            job = await session.scalar(
                select(DocumentUpdateJob)
                .where(
                    DocumentUpdateJob.job_id == job_id,
                    DocumentUpdateJob.status == "pending_review",
                )
                .with_for_update(skip_locked=True)
            )
            if job is None:
                continue
            proposal_ids = [
                UUID(value) for value in job.payload.get("proposal_ids", [])
            ]
            proposals = [
                await session.get(ConceptNoteEditProposal, proposal_id)
                for proposal_id in proposal_ids
            ]
            if not proposals or any(
                proposal is None
                or proposal.status
                in {"rejected", "failed", "stale", "partially_applied"}
                for proposal in proposals
            ):
                job.status, job.error_code = "failed", "point_update_review_unavailable"
                state.revision += 1
                continue
            if not all(proposal.status == "applied" for proposal in proposals):
                continue
            points = list(
                await session.scalars(
                    select(DocumentPoint).where(
                        DocumentPoint.run_id == job.run_id,
                        DocumentPoint.active.is_(True),
                    )
                )
            )
            vector = job.payload.get("point_versions", {})
            if {
                point.semantic_key: point.accepted_version for point in points
            } != vector:
                job.status = "superseded"
                continue
            for dependency in await session.scalars(
                select(DocumentDependency)
                .join(DocumentPoint)
                .where(
                    DocumentPoint.run_id == job.run_id,
                    DocumentDependency.chapter_ref.in_(job.payload["chapter_refs"]),
                )
            ):
                point = next(
                    point for point in points if point.point_id == dependency.point_id
                )
                dependency.applied_version = point.accepted_version
            job.status = "complete"
            state.revision += 1


async def run_update_job(
    service: DocumentWorkspaceService,
    job_id: UUID,
    lease_token: UUID,
    *,
    ca_session_factory: async_sessionmaker[AsyncSession] | None = None,
    draft_service: Any = None,
) -> None:
    """Generate outside transactions and fence every chapter/point write.

    Manual/Ready chapters receive normal persisted EditChange proposals. Free
    chapters append revisions in the same transaction as dependency freshness.
    A failed generation never rolls back the already accepted human answer.
    """
    from app.services.cnb.chapter_drafting import (
        ConceptNoteChapterDraftService,
        build_chapter_input,
    )

    ca_session_factory = ca_session_factory or get_session_factory()
    try:
        async with service.session_factory() as session:
            job = await session.get(DocumentUpdateJob, job_id)
        if job is None or job.lease_token != lease_token:
            return
        async with ca_session_factory() as session:
            run = await session.get(ConceptNoteRun, job.run_id)
        if run is None or run.user_id != job.payload["user_id"]:
            raise ValueError("Document run unavailable")
        draft_service = draft_service or ConceptNoteChapterDraftService(
            ca_session_factory, cnb_session_factory=service.session_factory
        )
        run_context, included = await draft_service._load_run_context(
            run.run_id, run.user_id
        )
        context = await point_context(service, run.run_id)
        vector = {point["key"]: point["version"] for point in context}
        if vector.get(job.payload["point_key"]) != job.payload["point_version"]:
            await _finish_superseded(service, job_id, lease_token)
            return
        run_context["document_workspace_points"] = context
        application = await draft_service._application_context.load_for_run(
            run, included_sources=included
        )
        chapters = await draft_service._workspace.list_chapters(run_id=run.run_id)
        targets = [
            chapter
            for chapter in chapters
            if chapter.chapter_ref in job.payload["chapter_refs"]
        ]
        # If prose has not been generated, keep acceptance durable and wait for
        # the first-draft workflow to mark its canonical inputs current.
        if not targets:
            raise ValueError("Dependent chapters have not been materialized")
        outputs = []
        for chapter in targets:
            async with service.session_factory() as session, session.begin():
                renewed = await session.execute(
                    update(DocumentUpdateJob)
                    .where(
                        DocumentUpdateJob.job_id == job_id,
                        DocumentUpdateJob.status == "running",
                        DocumentUpdateJob.lease_token == lease_token,
                    )
                    .values(lease_until=datetime.now(UTC) + LEASE_DURATION)
                )
                if not renewed.rowcount:
                    return
            generated = await draft_service._generate_chapter(
                build_chapter_input(
                    application_context=application,
                    run_context=run_context,
                    current=chapter,
                    template_chapter=None,
                    chapters=chapters,
                )
            )
            _require_marker_parity(
                generated.body_markdown, generated.missing_information
            )
            outputs.append((chapter, generated))
        async with service.session_factory() as session, session.begin():
            state = await service._state(session, run.run_id)
            current_job = await session.get(
                DocumentUpdateJob, job_id, with_for_update=True
            )
            if (
                current_job is None
                or current_job.status != "running"
                or current_job.lease_token != lease_token
            ):
                return
            points = list(
                await session.scalars(
                    select(DocumentPoint).where(
                        DocumentPoint.run_id == run.run_id,
                        DocumentPoint.active.is_(True),
                    )
                )
            )
            if {
                point.semantic_key: point.accepted_version for point in points
            } != vector:
                current_job.status = "superseded"
                return
            # Acquire every chapter before writing any result. A concurrent edit
            # invalidates the entire generated vector instead of partial apply.
            locked = []
            for before, generated in outputs:
                chapter = await session.get(
                    ConceptNoteChapter, before.chapter_id, with_for_update=True
                )
                latest = await session.scalar(
                    select(ConceptNoteChapterRevision)
                    .where(ConceptNoteChapterRevision.chapter_id == before.chapter_id)
                    .order_by(ConceptNoteChapterRevision.revision_number.desc())
                    .limit(1)
                )
                if (
                    chapter is None
                    or chapter.status == "deleted"
                    or (latest.revision_number if latest else 0)
                    != (before.revision_number or 0)
                ):
                    raise ValueError("Dependent chapter changed during generation")
                locked.append((chapter, latest, generated))
            proposals = []
            pending_refs = []
            for chapter, latest, generated in locked:
                existing = await _chapter_gaps(session, chapter.chapter_id)
                accepted_keys = {
                    point.semantic_key
                    for point in points
                    if point.disposition in ACCEPTED
                }
                answered = {
                    gap.gap_id for gap in existing if gap.field_key in accepted_keys
                }
                dropped = _dropped_unanswered_gaps(
                    existing, generated.missing_information, answered
                )
                if dropped:
                    generated = _restore_dropped_gaps(generated, dropped)
                    _require_marker_parity(
                        generated.body_markdown, generated.missing_information
                    )
                manual = await session.scalar(
                    select(ConceptNoteChapterRevision.revision_id)
                    .where(
                        ConceptNoteChapterRevision.chapter_id == chapter.chapter_id,
                        ConceptNoteChapterRevision.author_type == "user",
                    )
                    .limit(1)
                )
                protected = latest is not None and (
                    chapter.user_locked
                    or chapter.status == "ready"
                    or chapter.confirmed_revision_id is not None
                    or manual is not None
                )
                if protected and generated.body_markdown != latest.body_markdown:
                    change = EditChange(
                        change_id=uuid4(),
                        chapter_id=chapter.chapter_id,
                        chapter_title=chapter.title,
                        base_revision=latest.revision_number,
                        start=0,
                        before=latest.body_markdown,
                        after=generated.body_markdown,
                        kind="factual",
                        group_id="canonical_points",
                        user_input_quote=json.dumps(context, ensure_ascii=False)[:8000],
                    )
                    proposal = ConceptNoteEditProposal(
                        proposal_id=uuid4(),
                        run_id=run.run_id,
                        actor_user_id=run.user_id,
                        idempotency_key=uuid4(),
                        request_fingerprint=fingerprint(
                            {"job": str(job_id), "chapter": str(chapter.chapter_id)}
                        ),
                        instruction="Update this chapter to the accepted canonical document point values.",
                        scope={
                            "kind": "auto",
                            "focused_chapter_id": str(chapter.chapter_id),
                        },
                        base_revisions={
                            str(chapter.chapter_id): latest.revision_number
                        },
                        changes=[change.model_dump(mode="json")],
                        notices=[],
                        status="proposed",
                    )
                    session.add(proposal)
                    proposals.append(str(proposal.proposal_id))
                    pending_refs.append(chapter.template_section_id)
                else:
                    _reconcile_evidence_gaps(
                        session,
                        chapter,
                        existing,
                        generated.missing_information,
                        [],
                        answered,
                    )
                    if (
                        latest is None
                        or generated.body_markdown != latest.body_markdown
                    ):
                        session.add(
                            ConceptNoteChapterRevision(
                                chapter_id=chapter.chapter_id,
                                revision_number=(
                                    latest.revision_number if latest else 0
                                )
                                + 1,
                                author_type="agent",
                                change_type="rewrite" if latest else "draft",
                                body_markdown=generated.body_markdown,
                                patch_summary={
                                    "document_point_versions": vector,
                                    "update_job_id": str(job_id),
                                },
                            )
                        )
                        chapter.status = (
                            "needs_review" if generated.missing_information else "draft"
                        )
                        chapter.updated_at = datetime.now(UTC)
            for dependency in await session.scalars(
                select(DocumentDependency)
                .join(DocumentPoint)
                .where(
                    DocumentPoint.run_id == run.run_id,
                    DocumentDependency.chapter_ref.in_(job.payload["chapter_refs"]),
                )
            ):
                if dependency.chapter_ref not in pending_refs:
                    point = next(
                        point
                        for point in points
                        if point.point_id == dependency.point_id
                    )
                    dependency.applied_version = point.accepted_version
            current_job.payload = {
                **current_job.payload,
                "proposal_ids": proposals,
                "point_versions": vector,
            }
            current_job.status = "pending_review" if proposals else "complete"
            current_job.lease_token, current_job.lease_until = None, None
            state.revision += 1
            logger.info(
                "Document point propagation run_id=%s job_id=%s status=%s",
                run.run_id,
                job_id,
                current_job.status,
            )
    except asyncio.CancelledError:
        raise
    # Accepted answers survive any worker failure; the durable job is retried.
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Document update failed job_id=%s error_type=%s", job_id, type(exc).__name__
        )
        async with service.session_factory() as session, session.begin():
            job = await session.get(DocumentUpdateJob, job_id, with_for_update=True)
            if job is not None and job.lease_token == lease_token:
                job.status, job.error_code = (
                    "failed",
                    "document_point_propagation_failed",
                )
                job.lease_token, job.lease_until = None, None
                job.available_at = datetime.now(UTC) + timedelta(
                    seconds=min(300, 10 * 2**job.attempts)
                )


async def _finish_superseded(
    service: DocumentWorkspaceService, job_id: UUID, token: UUID
) -> None:
    """Retire work whose canonical answer was replaced before it started."""
    async with service.session_factory() as session, session.begin():
        job = await session.get(DocumentUpdateJob, job_id, with_for_update=True)
        if job is not None and job.lease_token == token:
            job.status, job.lease_token, job.lease_until = "superseded", None, None


async def run_document_workspace_reconciler() -> None:
    """Recover interrupted updates and pending reviews throughout service life."""
    settings = get_settings()
    if not settings.cnb_database_url or not settings.database_url:
        logger.info("Document workspace reconciliation disabled without CA/CNB storage")
        return
    while True:
        try:
            service = DocumentWorkspaceService()
            await refresh_reviews(service)
            claim = await claim_job(service)
            if claim:
                await run_update_job(service, *claim)
                continue
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Document workspace reconciliation unavailable")
            # Match the existing CNB reconcilers' storage-outage backoff.
            await asyncio.sleep(300)
            continue
        await asyncio.sleep(10)
