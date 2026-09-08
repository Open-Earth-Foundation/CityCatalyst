"""Exercise permanent workspace deletion with PostgreSQL foreign keys enabled."""

import os
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.cnb import CnbBase
from app.models.db import cnb_reference  # noqa: F401
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository


@pytest.mark.skipif(
    not os.getenv("CNB_TEST_DATABASE_URL"),
    reason="Requires disposable CNB_TEST_DATABASE_URL",
)
async def test_delete_removes_private_history_and_cascades_without_touching_another_run():
    url = os.environ["CNB_TEST_DATABASE_URL"].replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    repository = ConceptNoteWorkspaceRepository(sessions)
    run_ids = [uuid4(), uuid4()]
    records = {}
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await connection.run_sync(CnbBase.metadata.create_all)
        for run_id in run_ids:
            async with sessions() as session, session.begin():
                chapter = ConceptNoteChapter(
                    run_id=run_id, title="Private chapter", position=0
                )
                proposal = ConceptNoteEditProposal(
                    run_id=run_id,
                    actor_user_id="owner",
                    idempotency_key=uuid4(),
                    request_fingerprint="a" * 64,
                    instruction="Private instructions",
                    scope={"kind": "auto"},
                )
                session.add_all([chapter, proposal])
                await session.flush()
                revision = ConceptNoteChapterRevision(
                    chapter_id=chapter.chapter_id,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown="Private text",
                )
                gap = ConceptNoteGap(
                    run_id=run_id,
                    chapter_id=chapter.chapter_id,
                    field_key="budget",
                    severity="critical",
                    question="Budget?",
                    why_asking="Required",
                )
                application = ConceptNoteEditApplication(
                    run_id=run_id,
                    actor_user_id="owner",
                    proposal_id=proposal.proposal_id,
                    sequence=1,
                    operation="apply",
                    idempotency_key=uuid4(),
                    request_fingerprint="b" * 64,
                    before_revisions={},
                    after_revisions={},
                    accepted_change_ids=[],
                )
                evidence = ConceptNoteEvidenceLink(
                    chapter_id=chapter.chapter_id,
                    selected_source_label="Private source",
                    quote_or_summary="Private quote",
                )
                export = ConceptNoteExport(
                    run_id=run_id,
                    file_type="pdf",
                    file_ref="browser-download",
                    status="ready",
                )
                session.add_all([revision, gap, application, evidence, export])
                await session.flush()
                chapter.confirmed_revision_id = revision.revision_id
                review = ConceptNoteChapterReview(
                    chapter_id=chapter.chapter_id,
                    revision_id=revision.revision_id,
                    user_id="owner",
                    idempotency_key=uuid4(),
                )
                resolution = ConceptNoteGapResolution(
                    gap_id=gap.gap_id,
                    action="answer",
                    answer="Private answer",
                    actor_user_id="owner",
                    idempotency_key=uuid4(),
                )
                undo = ConceptNoteEditApplication(
                    run_id=run_id,
                    actor_user_id="owner",
                    restores_application_id=application.application_id,
                    sequence=2,
                    operation="undo",
                    idempotency_key=uuid4(),
                    request_fingerprint="c" * 64,
                    before_revisions={},
                    after_revisions={},
                    accepted_change_ids=[],
                )
                session.add_all([review, resolution, undo])
                await session.flush()
                records[run_id] = [
                    (
                        type(row),
                        tuple(
                            getattr(row, col.name) for col in row.__table__.primary_key
                        ),
                    )
                    for row in [
                        chapter,
                        proposal,
                        revision,
                        gap,
                        application,
                        evidence,
                        export,
                        review,
                        resolution,
                        undo,
                    ]
                ]
        await repository.delete_run(run_id=run_ids[0])
        await repository.delete_run(run_id=run_ids[0])  # safe retry
        async with sessions() as session:
            for run_id, expected in [(run_ids[0], False), (run_ids[1], True)]:
                for model, identity in records[run_id]:
                    assert (
                        await session.get(model, identity) is not None
                    ) == expected, model.__name__
    finally:
        for run_id in run_ids:
            await repository.delete_run(run_id=run_id)
        await engine.dispose()
