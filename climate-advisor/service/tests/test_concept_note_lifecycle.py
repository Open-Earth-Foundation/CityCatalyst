"""Focused contracts for Concept Note rename, duplicate, chats, and delete."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import DefaultClause, event, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.cnb import CnbBase
from app.models.cnb.concept_note_runs import ConceptNoteRenameRequest
from app.models.db.cnb_reference import CnbFundedProject, CnbFunder  # noqa: F401
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
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
from app.models.db.message import Message, MessageRole
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.cnb.draft_overview import DRAFT_OVERVIEW_REQUEST
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
        Message.__table__,
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

    async with (
        _ca_session() as session,
        _workspace_repository() as (
            workspace,
            workspace_sessions,
        ),
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
        service.run_service.cc_client.delete_concept_note_sources = AsyncMock()
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
                    ConceptNoteChapterRevision.chapter_id == copied_chapter.chapter_id
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

        async with workspace_sessions() as ws, ws.begin():
            for run_id in [source_run_id, destination.run_id]:
                proposal = ConceptNoteEditProposal(
                    run_id=run_id,
                    actor_user_id="owner-1",
                    idempotency_key=uuid4(),
                    request_fingerprint="c" * 64,
                    instruction="Private document edits",
                    scope={"kind": "auto"},
                )
                ws.add(proposal)
                await ws.flush()
                ws.add(
                    ConceptNoteEditApplication(
                        run_id=run_id,
                        actor_user_id="owner-1",
                        proposal_id=proposal.proposal_id,
                        sequence=1,
                        operation="apply",
                        idempotency_key=uuid4(),
                        request_fingerprint="d" * 64,
                        before_revisions={},
                        after_revisions={},
                        accepted_change_ids=[],
                    )
                )
        message_id = uuid4()
        session.add(
            Message(
                message_id=message_id,
                thread_id=destination.thread_id,
                user_id="owner-1",
                text="Private chat",
            )
        )
        await session.commit()

        await service.delete_run(
            run_id=destination.run_id,
            requested_user_id="owner-1",
            authorization="Bearer new-token",
        )
        assert await session.get(ConceptNoteRun, destination.run_id) is None
        assert await session.get(Thread, destination.thread_id) is None
        assert await session.get(ConceptNoteRun, source_run_id) is not None
        assert (
            await session.scalar(
                select(Message).where(Message.message_id == message_id)
            )
            is None
        )
        assert (
            await session.scalar(
                select(ConceptNoteUpload).where(
                    ConceptNoteUpload.run_id == destination.run_id
                )
            )
            is None
        )
        assert (
            await session.scalar(
                select(ConceptNoteContextBundle).where(
                    ConceptNoteContextBundle.run_id == destination.run_id
                )
            )
            is None
        )
        async with workspace_sessions() as workspace_session:
            for model in [ConceptNoteEditProposal, ConceptNoteEditApplication]:
                assert (
                    await workspace_session.scalar(
                        select(model).where(model.run_id == destination.run_id)
                    )
                    is None
                )
                assert (
                    await workspace_session.scalar(
                        select(model).where(model.run_id == source_run_id)
                    )
                    is not None
                )
            assert (
                await workspace_session.scalar(
                    select(ConceptNoteChapter).where(
                        ConceptNoteChapter.run_id == destination.run_id
                    )
                )
                is None
            )


async def test_source_cleanup_preserves_shared_copies_and_cleans_the_last_reference() -> (
    None
):
    async with _ca_session() as session:
        source_id, copy_id, original_upload, copy_upload = [uuid4() for _ in range(4)]
        for run_id in [source_id, copy_id]:
            session.add(_run(run_id=run_id, thread_id=uuid4(), city_id=uuid4()))
        await session.flush()
        for run_id, upload_id in [(source_id, original_upload), (copy_id, copy_upload)]:
            session.add(
                ConceptNoteUpload(
                    run_id=run_id,
                    upload_id=upload_id,
                    uploaded_by_user_id="owner-1",
                    filename="plan.pdf",
                    markdown_s3_key=f"pdf-ocr/results/concept_note_upload/{original_upload}/1/combined_markdown.md",
                )
            )
        await session.commit()
        service = ConceptNoteLifecycleService(session)
        assert await service._unshared_source_upload_ids(source_id) == []
        original = await session.get(ConceptNoteRun, source_id)
        await session.delete(original)
        await session.commit()
        assert set(await service._unshared_source_upload_ids(copy_id)) == {
            str(original_upload),
            str(copy_upload),
        }


@pytest.mark.parametrize("upstream_status", [409, 503])
async def test_failed_source_cleanup_preserves_run_and_workspace_for_retry(
    upstream_status: int,
) -> None:
    async with _ca_session() as session:
        run = _run(run_id=uuid4(), thread_id=uuid4(), city_id=uuid4())
        session.add(run)
        session.add(
            Thread(
                thread_id=run.thread_id,
                user_id=run.user_id,
                concept_note_run_id=run.run_id,
            )
        )
        await session.commit()
        service = ConceptNoteLifecycleService(session, workspace=AsyncMock())
        service.run_service.get_authorized_run = AsyncMock(return_value=run)
        service._unshared_source_upload_ids = AsyncMock(return_value=[str(uuid4())])
        service.run_service.cc_client.delete_concept_note_sources = AsyncMock(
            side_effect=httpx.HTTPStatusError(
                "Source cleanup failed",
                request=httpx.Request("DELETE", "https://cc.example/sources/"),
                response=httpx.Response(upstream_status),
            )
        )
        with pytest.raises(HTTPException) as error:
            await service.delete_run(
                run_id=run.run_id,
                requested_user_id=run.user_id,
                authorization="Bearer token",
            )
        assert error.value.status_code == upstream_status
        service.workspace.delete_run.assert_not_called()
        assert await session.get(ConceptNoteRun, run.run_id) is not None
        assert await session.get(Thread, run.thread_id) is not None
        # Once source delivery finishes, the same note can be deleted on retry.
        service.run_service.cc_client.delete_concept_note_sources.side_effect = None
        await service.delete_run(
            run_id=run.run_id,
            requested_user_id=run.user_id,
            authorization="Bearer token",
        )
        service.workspace.delete_run.assert_awaited_once_with(run_id=run.run_id)
        assert await session.get(ConceptNoteRun, run.run_id) is None
        assert await session.get(Thread, run.thread_id) is None


async def test_chats_stay_attached_to_their_run_and_can_be_switched() -> None:
    """Starting a chat keeps earlier ones; listing and switching stay run-scoped."""
    async with _ca_session() as session:
        run = _run(run_id=uuid4(), thread_id=uuid4(), city_id=uuid4())
        other_run = _run(run_id=uuid4(), thread_id=uuid4(), city_id=uuid4())
        session.add_all([run, other_run])
        # SQLite timestamps have second precision; keep the first chat clearly older.
        started_at = datetime.now(UTC) - timedelta(minutes=5)
        first_thread = Thread(
            thread_id=run.thread_id,
            user_id=run.user_id,
            concept_note_run_id=run.run_id,
            title=run.name,
            context={"access_token": "old-token"},
            created_at=started_at,
        )
        foreign_thread = Thread(
            thread_id=other_run.thread_id,
            user_id=run.user_id,
            concept_note_run_id=other_run.run_id,
        )
        session.add_all([first_thread, foreign_thread])
        session.add_all(
            [
                Message(
                    message_id=uuid4(),
                    thread_id=first_thread.thread_id,
                    user_id=run.user_id,
                    role=MessageRole.USER,
                    text=DRAFT_OVERVIEW_REQUEST,
                    created_at=started_at,
                ),
                Message(
                    message_id=uuid4(),
                    thread_id=first_thread.thread_id,
                    user_id=run.user_id,
                    role=MessageRole.USER,
                    text="  Tighten the   budget\njustification please  ",
                    created_at=started_at + timedelta(seconds=1),
                ),
                Message(
                    message_id=uuid4(),
                    thread_id=first_thread.thread_id,
                    user_id=run.user_id,
                    role=MessageRole.ASSISTANT,
                    text="Done.",
                    created_at=started_at + timedelta(seconds=2),
                ),
            ]
        )
        await session.commit()
        service = ConceptNoteLifecycleService(session, workspace=AsyncMock())
        service.run_service.get_authorized_run = AsyncMock(return_value=run)

        # Step 1: a new chat becomes active without deleting the first one.
        started = await service.start_chat(
            run_id=run.run_id,
            requested_user_id=run.user_id,
            authorization="Bearer new-token",
        )
        assert started.thread_id not in {first_thread.thread_id, None}
        assert await session.get(Thread, first_thread.thread_id) is not None
        new_thread = await session.get(Thread, started.thread_id)
        assert new_thread.concept_note_run_id == run.run_id
        assert new_thread.context["concept_note_run_id"] == str(run.run_id)

        # Step 2: listing is run-scoped, newest first, and hides the overview trigger.
        listing = await service.list_chat_threads(
            run_id=run.run_id,
            requested_user_id=run.user_id,
            authorization="Bearer new-token",
        )
        assert listing.active_thread_id == started.thread_id
        assert [thread.thread_id for thread in listing.threads] == [
            started.thread_id,
            first_thread.thread_id,
        ]
        newest, oldest = listing.threads
        assert (newest.message_count, newest.preview, newest.last_message_at) == (
            0,
            None,
            None,
        )
        assert oldest.message_count == 2
        assert oldest.preview == "Tighten the budget justification please"
        assert oldest.last_message_at is not None

        # Step 3: switching back only accepts chats attached to this run.
        with pytest.raises(HTTPException) as foreign:
            await service.activate_chat_thread(
                run_id=run.run_id,
                thread_id=foreign_thread.thread_id,
                requested_user_id=run.user_id,
                authorization="Bearer new-token",
            )
        assert foreign.value.status_code == 404
        reactivated = await service.activate_chat_thread(
            run_id=run.run_id,
            thread_id=first_thread.thread_id,
            requested_user_id=run.user_id,
            authorization="Bearer new-token",
        )
        assert reactivated.thread_id == first_thread.thread_id
        assert (await session.get(ConceptNoteRun, run.run_id)).thread_id == (
            first_thread.thread_id
        )

        # Step 4: busy runs keep their active chat until the work finishes.
        run.context_summary = {"draft_document": {"status": "running"}}
        with pytest.raises(HTTPException) as busy:
            await service.activate_chat_thread(
                run_id=run.run_id,
                thread_id=started.thread_id,
                requested_user_id=run.user_id,
                authorization="Bearer new-token",
            )
        assert busy.value.status_code == 409
        with pytest.raises(HTTPException) as busy_start:
            await service.start_chat(
                run_id=run.run_id,
                requested_user_id=run.user_id,
                authorization="Bearer new-token",
            )
        assert busy_start.value.status_code == 409

        # Step 5: deleting the run removes every attached chat, nothing else.
        run.context_summary = {}
        service._unshared_source_upload_ids = AsyncMock(return_value=[])
        await service.delete_run(
            run_id=run.run_id,
            requested_user_id=run.user_id,
            authorization="Bearer new-token",
        )
        assert await session.get(Thread, first_thread.thread_id) is None
        assert await session.get(Thread, started.thread_id) is None
        assert await session.get(Thread, foreign_thread.thread_id) is not None
        assert (
            await session.scalar(
                select(Message).where(Message.thread_id == first_thread.thread_id)
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
