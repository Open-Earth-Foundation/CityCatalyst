"""Local SQLite reproduction of a deferred pre-draft job after first drafting."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter, ConceptNoteChapterRevision
from app.models.db.document_workspace import (
    DocumentDependency,
    DocumentPoint,
    DocumentUpdateJob,
)
from app.persistence.concept_notes.edits import append_revision
from app.persistence.concept_notes.source_provenance import sources_provenance
from app.persistence.concept_notes.workspace import normalize_template_chapters
from app.services.document_workspace.jobs import claim_job, run_update_job
from tests.cnb.test_document_workspace import answer, fake_draft_service, template
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414


@pytest.mark.parametrize("case", ["current", "partial", "missing", "new_answer"])
async def test_deferred_job_skips_only_fully_applied_current_inputs(workspace, case):
    service, run, factory = workspace
    await answer(service, run)
    async with factory() as session:
        point_version = (await session.scalar(select(DocumentPoint))).accepted_version
    draft = fake_draft_service(factory)
    first = await claim_job(service)
    await run_update_job(
        service, *first, ca_session_factory=factory, draft_service=draft
    )
    async with factory() as session:
        job = await session.get(DocumentUpdateJob, first[0])
        assert job.status == "queued" and job.attempts == 0
    await draft._workspace.ensure_template_chapters(
        run_id=run.run_id,
        chapters=normalize_template_chapters(template().chapter_schema),
    )
    chapters = await draft._workspace.list_chapters(run_id=run.run_id)
    for chapter in chapters:
        assert await draft._workspace.save_generated_chapter(
            chapter_id=chapter.chapter_id,
            body_markdown="First draft already contains accepted requested amount: 125000.",
            missing_information=[],
            point_versions={"requested_amount": point_version},
            source_provenance=sources_provenance([]),
        )
    async with factory() as session, session.begin():
        assert all(
            row.applied_version == point_version
            for row in await session.scalars(select(DocumentDependency))
        )
        for chapter in await session.scalars(select(ConceptNoteChapter)):
            latest = await session.scalar(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.chapter_id == chapter.chapter_id
                )
            )
            await append_revision(
                session,
                chapter,
                latest,
                body=latest.body_markdown + " Literal user addition.",
                user_id="owner",
                idempotency_key=uuid4(),
                preserve_ready=False,
                patch_summary={"operation": "edit_text"},
            )
        job = await session.get(DocumentUpdateJob, first[0])
        job.available_at = datetime.now(UTC) - timedelta(seconds=1)
    if case == "new_answer":
        await answer(service, run, 420000)
    elif case in {"partial", "missing"}:
        async with factory() as session, session.begin():
            dependency = await session.scalar(select(DocumentDependency).limit(1))
            if case == "partial":
                dependency.applied_version = 0
            else:
                await session.delete(dependency)
    draft._load_run_context = AsyncMock(wraps=draft._load_run_context)
    draft._generate_chapter = AsyncMock(wraps=draft._generate_chapter)
    displayed_revision = (await service.load(run)).revision
    claim = await claim_job(service)
    assert claim is not None
    await run_update_job(
        service, *claim, ca_session_factory=factory, draft_service=draft
    )
    if case == "new_answer":
        async with factory() as session:
            assert (
                await session.get(DocumentUpdateJob, claim[0])
            ).status == "superseded"
        assert draft._generate_chapter.await_count == 0
        claim = await claim_job(service)
        assert claim is not None
        await run_update_job(
            service, *claim, ca_session_factory=factory, draft_service=draft
        )
    assert draft._generate_chapter.await_count == (0 if case == "current" else 2)
    if case == "current":
        assert (await service.load(run)).revision == displayed_revision
    assert (
        draft._load_run_context.await_count
        == {
            "current": 0,
            "new_answer": 2,
            "partial": 1,
            "missing": 1,
        }[case]
    )
    async with factory() as session:
        job = await session.get(DocumentUpdateJob, claim[0])
        assert job.status == ("complete" if case == "current" else "pending_review")
        assert len(list(await session.scalars(select(ConceptNoteEditProposal)))) == (
            0 if case == "current" else 2
        )
