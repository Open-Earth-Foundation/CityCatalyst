"""Focused contracts for Concept Note rename, duplicate, and delete."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import DefaultClause, event, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.cnb import CnbBase
from app.models.concept_note_runs import ConceptNoteRenameRequest
from app.models.db.cnb_reference import CnbFundedProject, CnbFunder  # noqa: F401
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteExport,
)
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.concept_note_lifecycle import ConceptNoteLifecycleService


@asynccontextmanager
async def _ca_session():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    tables = (
        Thread.__table__,
        ConceptNoteRun.__table__,
        ConceptNoteContextBundle.__table__,
        ConceptNoteUpload.__table__,
    )
    try:
        async with engine.begin() as connection:
            for table in tables:
                await connection.run_sync(table.create)
        async with session_factory() as session:
            yield session
    finally:
        await engine.dispose()


@asynccontextmanager
async def _workspace_repository():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    changed_defaults: list[tuple[object, object]] = []
    for table in CnbBase.metadata.tables.values():
        for column in table.columns:
            default = column.server_default
            if default is not None and "::jsonb" in str(default.arg):
                changed_defaults.append((column, default))
                column.server_default = DefaultClause(
                    text(str(default.arg).replace("::jsonb", ""))
                )
    try:
        async with engine.begin() as connection:
            await connection.run_sync(CnbBase.metadata.create_all)
        yield ConceptNoteWorkspaceRepository(session_factory), session_factory
    finally:
        for column, default in changed_defaults:
            column.server_default = default
        await engine.dispose()


def _run(*, run_id: UUID, thread_id: UUID, city_id: UUID) -> ConceptNoteRun:
    return ConceptNoteRun(
        run_id=run_id,
        thread_id=thread_id,
        user_id="owner-1",
        name="Heat resilience",
        city_id=str(city_id),
        status="active",
        workflow_step="editing_document",
        context_summary={
            "context_bundle": {"status": "ready"},
            "draft_document": {
                "status": "complete",
                "completed_chapters": 1,
                "total_chapters": 1,
            },
        },
        permission_summary={},
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
    )


async def test_lifecycle_actions_keep_copies_independent() -> None:
    """Exercise the complete service flow without lifecycle-operation tables."""
    source_run_id = uuid4()
    source_thread_id = uuid4()
    source_upload_id = uuid4()
    source_chapter_id = uuid4()
    city_id = uuid4()
    duplicate_key = uuid4()

    async with _ca_session() as session, _workspace_repository() as (
        workspace,
        workspace_sessions,
    ):
        source = _run(
            run_id=source_run_id,
            thread_id=source_thread_id,
            city_id=city_id,
        )
        session.add_all(
            [
                Thread(
                    thread_id=source_thread_id,
                    user_id="owner-1",
                    context={"access_token": "old-token"},
                    title=source.name,
                ),
                source,
                ConceptNoteContextBundle(
                    run_id=source_run_id,
                    context_bundle={
                        "selected_sources": [
                            {
                                "upload_id": str(source_upload_id),
                                "source_label": "City plan",
                                "filename": "plan.pdf",
                                "sha256": "b" * 64,
                                "source_format": "pdf",
                                "page_count": 3,
                                "summary": "Current plan",
                                "topics": ["heat"],
                                "key_excerpts": [],
                            }
                        ]
                    },
                ),
                ConceptNoteUpload(
                    upload_id=source_upload_id,
                    run_id=source_run_id,
                    uploaded_by_user_id="owner-1",
                    filename="plan.pdf",
                    markdown_s3_key="shared/plan.md",
                    markdown_sha256="b" * 64,
                    page_count=3,
                    ingest_status="ready",
                ),
            ]
        )
        await session.commit()

        async with workspace_sessions() as workspace_session, workspace_session.begin():
            workspace_session.add_all(
                [
                    ConceptNoteChapter(
                        chapter_id=source_chapter_id,
                        run_id=source_run_id,
                        title="Summary",
                        position=0,
                        status="draft",
                    ),
                    ConceptNoteChapterRevision(
                        chapter_id=source_chapter_id,
                        revision_number=1,
                        author_type="agent",
                        change_type="draft",
                        body_markdown="Old content",
                    ),
                    ConceptNoteChapterRevision(
                        chapter_id=source_chapter_id,
                        revision_number=2,
                        author_type="user",
                        change_type="edit_text",
                        body_markdown="Current content",
                    ),
                    ConceptNoteExport(
                        run_id=source_run_id,
                        file_type="pdf",
                        file_ref="exports/source.pdf",
                        status="ready",
                    ),
                ]
            )

        service = ConceptNoteLifecycleService(session, workspace=workspace)
        service.run_service.get_authorized_run = AsyncMock(return_value=source)
        response, created = await service.duplicate_run(
            run_id=source_run_id,
            idempotency_key=duplicate_key,
            requested_user_id="owner-1",
            authorization="Bearer new-token",
        )

        assert created
        assert response.name == "Heat resilience (copy)"
        destination = await session.get(ConceptNoteRun, response.run_id)
        assert destination is not None
        assert destination.thread_id != source_thread_id
        destination_upload = await session.scalar(
            select(ConceptNoteUpload).where(
                ConceptNoteUpload.run_id == destination.run_id
            )
        )
        assert destination_upload is not None
        assert destination_upload.upload_id != source_upload_id
        assert destination_upload.markdown_s3_key == "shared/plan.md"

        async with workspace_sessions() as workspace_session:
            copied_chapter = await workspace_session.scalar(
                select(ConceptNoteChapter).where(
                    ConceptNoteChapter.run_id == destination.run_id
                )
            )
            copied_revision = await workspace_session.scalar(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.chapter_id
                    == copied_chapter.chapter_id
                )
            )
            copied_export = await workspace_session.scalar(
                select(ConceptNoteExport).where(
                    ConceptNoteExport.run_id == destination.run_id
                )
            )
        assert copied_chapter.chapter_id != source_chapter_id
        assert copied_revision.body_markdown == "Current content"
        assert copied_export is None

        replay, replay_created = await service.duplicate_run(
            run_id=source_run_id,
            idempotency_key=duplicate_key,
            requested_user_id="owner-1",
            authorization="Bearer new-token",
        )
        assert not replay_created
        assert replay.run_id == destination.run_id

        service.run_service.get_authorized_run = AsyncMock(return_value=destination)
        renamed = await service.rename_run(
            run_id=destination.run_id,
            payload=ConceptNoteRenameRequest(name="Cooling schools"),
            requested_user_id="owner-1",
            authorization="Bearer new-token",
        )
        assert renamed.name == "Cooling schools"
        destination_thread = await session.get(Thread, destination.thread_id)
        assert destination_thread.title == "Cooling schools"

        await service.delete_run(
            run_id=destination.run_id,
            requested_user_id="owner-1",
            authorization="Bearer new-token",
        )
        assert await session.get(ConceptNoteRun, destination.run_id) is None
        assert await session.get(Thread, destination.thread_id) is None
        assert await session.get(ConceptNoteRun, source_run_id) is not None
        async with workspace_sessions() as workspace_session:
            assert (
                await workspace_session.scalar(
                    select(ConceptNoteChapter).where(
                        ConceptNoteChapter.run_id == destination.run_id
                    )
                )
                is None
            )


@pytest.mark.parametrize("value", ["", "   ", "x" * 121])
def test_rename_validation_rejects_invalid_names(value: str) -> None:
    with pytest.raises(ValidationError):
        ConceptNoteRenameRequest(name=value)


def test_rename_validation_trims_names() -> None:
    assert ConceptNoteRenameRequest(name="  Cooling schools  ").name == (
        "Cooling schools"
    )
