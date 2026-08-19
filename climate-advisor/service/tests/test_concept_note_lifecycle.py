"""Persistence and retry contracts for Concept Note lifecycle operations."""

from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import DefaultClause, event, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.cnb import CnbBase
from app.models.concept_note_runs import ConceptNoteRenameRequest
from app.models.db.cnb_reference import CnbFundedProject, CnbFunder
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteMatchedProject,
)
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteLifecycleOperation,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.persistence.concept_notes.lifecycle import ConceptNoteLifecycleRepository
from app.persistence.concept_notes.runs import ConceptNoteRunRepository
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceCopyResult,
)
from app.services.citycatalyst_client import CityCatalystClient
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
        ConceptNoteLifecycleOperation.__table__,
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


def _run(
    *,
    run_id: UUID,
    thread_id: UUID,
    city_id: UUID,
    name: str = "Heat resilience",
) -> ConceptNoteRun:
    return ConceptNoteRun(
        run_id=run_id,
        thread_id=thread_id,
        user_id="owner-1",
        name=name,
        city_id=str(city_id),
        status="active",
        lifecycle_state="active",
        workflow_step="editing_document",
        context_summary={
            "context_bundle": {
                "status": "ready",
                "build_id": str(uuid4()),
                "retryable": False,
            },
            "draft_document": {
                "status": "complete",
                "completed_chapters": 1,
                "total_chapters": 1,
            },
        },
        permission_summary={"stale": True},
        trace_id="do-not-copy",
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
    )


async def test_duplicate_renames_and_deletes_independent_ca_records() -> None:
    """Copy IDs/context/chat safely, sync the title, then retain only tombstone."""
    source_run_id = uuid4()
    source_thread_id = uuid4()
    source_upload_id = uuid4()
    city_id = uuid4()
    idempotency_key = uuid4()

    async with _ca_session() as session:
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
                    context={"access_token": "source-token"},
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
                                "key_excerpts": [
                                    {"text": "Cool roofs", "page": 2}
                                ],
                            }
                        ]
                    },
                ),
                ConceptNoteUpload(
                    upload_id=source_upload_id,
                    run_id=source_run_id,
                    uploaded_by_user_id="owner-1",
                    filename="plan.pdf",
                    source_label="City plan",
                    markdown_s3_key="shared/plan.md",
                    markdown_sha256="b" * 64,
                    page_count=3,
                    ingest_status="ready",
                ),
            ]
        )
        await session.commit()

        repository = ConceptNoteLifecycleRepository(session)
        operation = await repository.create_duplicate_operation(
            source=source,
            idempotency_key=idempotency_key,
            token="new-token",
        )
        await session.commit()

        assert operation.destination_run_id is not None
        destination = await session.get(ConceptNoteRun, operation.destination_run_id)
        assert destination is not None
        assert destination.name == "Heat resilience (copy)"
        assert destination.lifecycle_state == "copying"
        assert destination.duplicated_from_run_id == source_run_id
        assert destination.trace_id is None
        assert destination.permission_summary == {}
        assert destination.thread_id is not None
        assert destination.thread_id != source_thread_id

        destination_thread = await session.get(Thread, destination.thread_id)
        assert destination_thread is not None
        assert destination_thread.title == "Heat resilience (copy)"
        assert destination_thread.context["concept_note_run_id"] == str(
            destination.run_id
        )
        assert destination_thread.context["access_token"] == "new-token"

        destination_upload = await session.scalar(
            select(ConceptNoteUpload).where(
                ConceptNoteUpload.run_id == destination.run_id
            )
        )
        assert destination_upload is not None
        assert destination_upload.upload_id != source_upload_id
        assert destination_upload.markdown_s3_key == "shared/plan.md"
        copied_bundle = await session.get(ConceptNoteContextBundle, destination.run_id)
        assert copied_bundle is not None
        assert copied_bundle.context_bundle["selected_sources"][0]["upload_id"] == str(
            destination_upload.upload_id
        )

        visible_before_publish = await ConceptNoteRunRepository(
            session
        ).list_for_user_city(user_id="owner-1", city_id=str(city_id))
        assert [run.run_id for run in visible_before_publish] == [source_run_id]

        destination = await repository.finalize_duplicate(
            operation,
            WorkspaceCopyResult(completed_chapters=1, total_chapters=1),
        )
        await session.commit()
        assert destination.lifecycle_state == "active"
        assert destination.workflow_step == "editing_document"
        assert operation.phase == "completed"
        assert operation.operation_data == {}

        await repository.rename_run(run=destination, name="Cooling schools")
        await session.commit()
        destination_thread = await session.get(Thread, destination.thread_id)
        assert destination.name == "Cooling schools"
        assert destination_thread is not None
        assert destination_thread.title == "Cooling schools"

        shared = _run(
            run_id=uuid4(),
            thread_id=destination.thread_id,
            city_id=city_id,
            name="Legacy shared note",
        )
        session.add(shared)
        await session.commit()
        assert not await repository.thread_is_dedicated(destination)
        await session.delete(shared)
        await session.commit()

        delete_operation = await repository.create_delete_operation(
            source=destination,
            idempotency_key=uuid4(),
        )
        await session.commit()
        assert destination.lifecycle_state == "deleting"
        await repository.finalize_delete(delete_operation)
        await session.commit()

        assert await session.get(ConceptNoteRun, destination.run_id) is None
        assert await session.get(Thread, destination.thread_id) is None
        assert await session.get(ConceptNoteContextBundle, destination.run_id) is None
        assert (
            await session.scalar(
                select(ConceptNoteUpload).where(
                    ConceptNoteUpload.run_id == destination.run_id
                )
            )
            is None
        )
        tombstone = await session.get(
            ConceptNoteLifecycleOperation,
            delete_operation.operation_id,
        )
        assert tombstone is not None
        assert tombstone.phase == "completed"
        assert tombstone.operation_data == {}
async def test_workspace_copy_uses_latest_content_and_new_mutable_ids() -> None:
    """Copy current workspace state, excluding revision history and exports."""
    source_run_id = uuid4()
    destination_run_id = uuid4()
    source_chapter_id = uuid4()
    source_evidence_id = uuid4()
    source_match_id = uuid4()
    funder_id = uuid4()
    project_id = uuid4()

    async with _workspace_repository() as (repository, session_factory):
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    CnbFunder(funder_id=funder_id, name="Climate Fund"),
                    CnbFundedProject(
                        funded_project_id=project_id,
                        source_run_id="research-1",
                        source_record_ref="project-1",
                        funder_id=funder_id,
                        name="Cool schools",
                    ),
                    ConceptNoteChapter(
                        chapter_id=source_chapter_id,
                        run_id=source_run_id,
                        template_section_id="summary",
                        title="Summary",
                        position=0,
                        status="draft",
                        required=True,
                        user_locked=True,
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
                    ConceptNoteEvidenceLink(
                        evidence_link_id=source_evidence_id,
                        chapter_id=source_chapter_id,
                        selected_source_label="City plan",
                        source_location="page 2",
                        claim_ref="claim-1",
                        quote_or_summary="Cool roofs are prioritized",
                    ),
                    ConceptNoteGap(
                        run_id=source_run_id,
                        chapter_id=source_chapter_id,
                        severity="missing_information",
                        reason="Add cost estimate",
                        status="open",
                    ),
                    ConceptNoteMatchedProject(
                        match_id=source_match_id,
                        run_id=source_run_id,
                        funded_project_id=project_id,
                        decision="selected",
                        fit_rationale="Same hazard and intervention",
                        matched_tags=["heat"],
                        evidence=[{"source": "award"}],
                        caveats=["Different country"],
                    ),
                    ConceptNoteExport(
                        run_id=source_run_id,
                        file_type="pdf",
                        file_ref="exports/source.pdf",
                        status="ready",
                    ),
                ]
            )

        result = await repository.copy_working_copy(
            source_run_id=source_run_id,
            destination_run_id=destination_run_id,
        )
        assert result == WorkspaceCopyResult(completed_chapters=1, total_chapters=1)

        async with session_factory() as session:
            copied_chapter = await session.scalar(
                select(ConceptNoteChapter).where(
                    ConceptNoteChapter.run_id == destination_run_id
                )
            )
            assert copied_chapter is not None
            assert copied_chapter.chapter_id != source_chapter_id
            copied_revisions = list(
                (
                    await session.scalars(
                        select(ConceptNoteChapterRevision).where(
                            ConceptNoteChapterRevision.chapter_id
                            == copied_chapter.chapter_id
                        )
                    )
                ).all()
            )
            assert len(copied_revisions) == 1
            assert copied_revisions[0].revision_number == 1
            assert copied_revisions[0].body_markdown == "Current content"
            copied_evidence = await session.scalar(
                select(ConceptNoteEvidenceLink).where(
                    ConceptNoteEvidenceLink.chapter_id == copied_chapter.chapter_id
                )
            )
            copied_gap = await session.scalar(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.run_id == destination_run_id
                )
            )
            copied_match = await session.scalar(
                select(ConceptNoteMatchedProject).where(
                    ConceptNoteMatchedProject.run_id == destination_run_id
                )
            )
            copied_export = await session.scalar(
                select(ConceptNoteExport).where(
                    ConceptNoteExport.run_id == destination_run_id
                )
            )
            assert copied_evidence is not None
            assert copied_evidence.evidence_link_id != source_evidence_id
            assert copied_gap is not None
            assert copied_gap.chapter_id == copied_chapter.chapter_id
            assert copied_match is not None
            assert copied_match.match_id != source_match_id
            assert copied_match.funded_project_id == project_id
            assert copied_export is None

        await repository.delete_run(run_id=destination_run_id)
        async with session_factory() as session:
            assert (
                await session.scalar(
                    select(ConceptNoteChapter).where(
                        ConceptNoteChapter.run_id == destination_run_id
                    )
                )
                is None
            )
            assert await session.get(CnbFundedProject, project_id) is not None


@pytest.mark.parametrize(
    "value",
    ["", "   ", "x" * 121],
)
def test_rename_validation_rejects_invalid_names(value: str) -> None:
    with pytest.raises(ValidationError):
        ConceptNoteRenameRequest(name=value)


def test_rename_validation_trims_before_enforcing_length() -> None:
    payload = ConceptNoteRenameRequest(name=f"  {'x' * 120}  ")
    assert payload.name == "x" * 120


def _lifecycle_service() -> tuple[
    ConceptNoteLifecycleService,
    AsyncMock,
    AsyncMock,
    AsyncMock,
]:
    session = AsyncMock(spec=AsyncSession)
    client = AsyncMock(spec=CityCatalystClient)
    workspace = AsyncMock(spec=ConceptNoteWorkspaceRepository)
    service = ConceptNoteLifecycleService(session, cc_client=client, workspace=workspace)

    async def set_phase(operation: SimpleNamespace, phase: str) -> None:
        operation.phase = phase

    service.repository.set_phase = AsyncMock(side_effect=set_phase)
    return service, session, client, workspace


async def test_duplicate_resumes_each_durable_phase() -> None:
    upload_map = {str(uuid4()): str(uuid4())}
    operation = SimpleNamespace(
        phase="ca_copied",
        source_run_id=uuid4(),
        destination_run_id=uuid4(),
        operation_data={"upload_map": upload_map},
    )
    service, session, client, workspace = _lifecycle_service()
    destination = SimpleNamespace(run_id=operation.destination_run_id)
    workspace.copy_working_copy.return_value = WorkspaceCopyResult(1, 1)
    service.repository.finalize_duplicate = AsyncMock(return_value=destination)

    assert await service._resume_duplicate(operation, token="token") is destination
    client.post_internal_capability.assert_awaited_once()
    workspace.copy_working_copy.assert_awaited_once()
    assert session.commit.await_count == 2


async def test_delete_resumes_each_durable_phase() -> None:
    operation = SimpleNamespace(
        phase="marked_deleting",
        source_run_id=uuid4(),
        operation_data={"upload_ids": [str(uuid4())]},
    )
    service, session, client, workspace = _lifecycle_service()
    service.repository.finalize_delete = AsyncMock()

    await service._resume_delete(operation, token="token")
    workspace.delete_run.assert_awaited_once_with(run_id=operation.source_run_id)
    client.post_internal_capability.assert_awaited_once()
    service.repository.finalize_delete.assert_awaited_once_with(operation)
    assert session.commit.await_count == 3


@pytest.mark.parametrize("phase", ["ca_copied", "source_bindings_copied"])
async def test_duplicate_failure_keeps_last_durable_phase(phase: str) -> None:
    operation = SimpleNamespace(
        phase=phase,
        source_run_id=uuid4(),
        destination_run_id=uuid4(),
        operation_data={"upload_map": {str(uuid4()): str(uuid4())}},
    )
    service, session, client, workspace = _lifecycle_service()
    if phase == "ca_copied":
        client.post_internal_capability.side_effect = RuntimeError("injected failure")
    else:
        workspace.copy_working_copy.side_effect = RuntimeError("injected failure")

    with pytest.raises(RuntimeError, match="injected failure"):
        await service._resume_duplicate(operation, token="token")
    assert operation.phase == phase
    session.commit.assert_not_awaited()


@pytest.mark.parametrize("phase", ["marked_deleting", "workspace_deleted"])
async def test_delete_failure_keeps_last_durable_phase(phase: str) -> None:
    operation = SimpleNamespace(
        phase=phase,
        source_run_id=uuid4(),
        operation_data={"upload_ids": [str(uuid4())]},
    )
    service, session, client, workspace = _lifecycle_service()
    if phase == "marked_deleting":
        workspace.delete_run.side_effect = RuntimeError("injected failure")
    else:
        client.post_internal_capability.side_effect = RuntimeError("injected failure")

    with pytest.raises(RuntimeError, match="injected failure"):
        await service._resume_delete(operation, token="token")
    assert operation.phase == phase
    session.commit.assert_not_awaited()
