"""Persistence contracts for Concept Note chapter validation results."""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from app.db.cnb import CnbBase
from app.models.db.cnb_reference import CnbFundedProject, CnbFunder  # noqa: F401
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteGap,
)
from app.persistence.concept_notes import workspace as workspace_module
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceValidationInputChangedError,
)
from sqlalchemy import DefaultClause, event, select, text, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

TEMPLATE_FINGERPRINT = "template-v1"


@pytest.mark.asyncio
async def test_final_fingerprint_locks_target_gap_and_evidence_rows() -> None:
    """Prevent child-row updates from racing the final fingerprint write."""
    session = MagicMock()
    scalar_result = MagicMock()
    scalar_result.all.return_value = []
    session.scalars = AsyncMock(return_value=scalar_result)
    chapter_id = uuid4()

    await workspace_module._open_gaps_by_chapter(
        session,
        [chapter_id],
        lock=True,
    )
    await workspace_module._evidence_by_chapter(
        session,
        [chapter_id],
        lock=True,
    )

    statements = [call.args[0] for call in session.scalars.await_args_list]
    rendered = [
        str(statement.compile(dialect=postgresql.dialect())) for statement in statements
    ]
    assert len(rendered) == 2
    assert all("FOR UPDATE" in statement for statement in rendered)


@asynccontextmanager
async def _validation_repository():
    """Provide an isolated SQLite workspace with PostgreSQL JSON defaults adapted."""
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


async def _seed_document(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    run_id: UUID,
) -> tuple[UUID, UUID]:
    """Create two drafted chapters with target gaps and evidence."""
    target_id = uuid4()
    related_id = uuid4()
    async with session_factory() as session, session.begin():
        session.add_all(
            [
                ConceptNoteChapter(
                    chapter_id=target_id,
                    run_id=run_id,
                    template_section_id="summary",
                    title="Summary",
                    position=0,
                    status="draft",
                    required=True,
                ),
                ConceptNoteChapter(
                    chapter_id=related_id,
                    run_id=run_id,
                    template_section_id="budget",
                    title="Budget",
                    position=1,
                    status="draft",
                    required=True,
                ),
                ConceptNoteChapterRevision(
                    chapter_id=target_id,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown="Target body",
                ),
                ConceptNoteChapterRevision(
                    chapter_id=related_id,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown="Related body",
                ),
                ConceptNoteGap(
                    run_id=run_id,
                    chapter_id=target_id,
                    field_key="beneficiaries",
                    severity="missing_information",
                    reason="Beneficiary count is missing",
                    status="open",
                ),
                ConceptNoteEvidenceLink(
                    chapter_id=target_id,
                    selected_source_label="City plan",
                    source_location="page 4",
                    claim_ref="heat-risk",
                    quote_or_summary="Heat exposure is increasing.",
                ),
            ]
        )
    return target_id, related_id


async def test_validation_context_fingerprint_tracks_document_gap_and_evidence() -> (
    None
):
    """Any planned validation input change must produce a new fingerprint."""
    run_id = uuid4()
    async with _validation_repository() as (repository, sessions):
        target_id, _ = await _seed_document(sessions, run_id=run_id)

        initial = await repository.load_validation_context(
            run_id=run_id,
            chapter_id=target_id,
            template_fingerprint=TEMPLATE_FINGERPRINT,
        )
        async with sessions() as session, session.begin():
            session.add(
                ConceptNoteEvidenceLink(
                    chapter_id=target_id,
                    selected_source_label="Budget annex",
                    source_location="table 2",
                    claim_ref="cost",
                    quote_or_summary="Estimated cost is EUR 2 million.",
                )
            )
        evidence_changed = await repository.load_validation_context(
            run_id=run_id,
            chapter_id=target_id,
            template_fingerprint=TEMPLATE_FINGERPRINT,
        )
        assert evidence_changed.fingerprint != initial.fingerprint

        template_changed = await repository.load_validation_context(
            run_id=run_id,
            chapter_id=target_id,
            template_fingerprint="template-v2",
        )
        assert template_changed.fingerprint != evidence_changed.fingerprint


async def test_upsert_projects_staleness_and_rejects_an_old_fingerprint() -> None:
    """Persist atomically and expose a stale ready result as needs review."""
    run_id = uuid4()
    async with _validation_repository() as (repository, sessions):
        target_id, related_id = await _seed_document(sessions, run_id=run_id)
        context = await repository.load_validation_context(
            run_id=run_id,
            chapter_id=target_id,
            template_fingerprint=TEMPLATE_FINGERPRINT,
        )
        checks = [
            {
                "key": "required_content",
                "label": "Required content",
                "status": "pass",
            }
        ]
        stored = await repository.upsert_validation(
            run_id=run_id,
            chapter_id=target_id,
            template_fingerprint=TEMPLATE_FINGERPRINT,
            expected_fingerprint=context.fingerprint,
            status="ready",
            checks=checks,
            findings=[],
        )
        assert stored.status == "ready"
        assert stored.validated_revision_number == 1
        assert not stored.is_stale

        async with sessions() as session, session.begin():
            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=related_id,
                    revision_number=2,
                    author_type="user",
                    change_type="edit_text",
                    body_markdown="Conflicting related body",
                )
            )

        stale_chapter = next(
            chapter
            for chapter in await repository.list_chapters(
                run_id=run_id,
                template_fingerprint=TEMPLATE_FINGERPRINT,
            )
            if chapter.chapter_id == target_id
        )
        assert stale_chapter.status == "needs_review"
        assert stale_chapter.validation is not None
        assert stale_chapter.validation.status == "ready"
        assert stale_chapter.validation.is_stale

        with pytest.raises(WorkspaceValidationInputChangedError):
            await repository.upsert_validation(
                run_id=run_id,
                chapter_id=target_id,
                template_fingerprint=TEMPLATE_FINGERPRINT,
                expected_fingerprint=context.fingerprint,
                status="ready",
                checks=checks,
                findings=[],
            )

async def test_copy_omits_validation_and_delete_removes_source_result() -> None:
    """A duplicate drops validation-derived states and dependent result rows."""
    source_run_id = uuid4()
    destination_run_id = uuid4()
    async with _validation_repository() as (repository, sessions):
        target_id, _ = await _seed_document(sessions, run_id=source_run_id)
        async with sessions() as session, session.begin():
            await session.execute(
                update(ConceptNoteGap)
                .where(ConceptNoteGap.run_id == source_run_id)
                .values(status="resolved")
            )
        context = await repository.load_validation_context(
            run_id=source_run_id,
            chapter_id=target_id,
            template_fingerprint=TEMPLATE_FINGERPRINT,
        )
        stored = await repository.upsert_validation(
            run_id=source_run_id,
            chapter_id=target_id,
            template_fingerprint=TEMPLATE_FINGERPRINT,
            expected_fingerprint=context.fingerprint,
            status="ready",
            checks=[],
            findings=[],
        )

        await repository.copy_working_copy(
            source_run_id=source_run_id,
            destination_run_id=destination_run_id,
        )
        destination = await repository.list_chapters(run_id=destination_run_id)
        copied_target = next(
            chapter for chapter in destination if chapter.position == 0
        )
        assert copied_target.status == "draft"
        assert copied_target.validation is None

        async with sessions() as session:
            all_validations = list(
                (await session.scalars(select(ConceptNoteChapterValidation))).all()
            )
        assert [validation.validation_id for validation in all_validations] == [
            stored.validation_id
        ]

        await repository.delete_run(run_id=source_run_id)
        async with sessions() as session:
            assert (
                await session.get(
                    ConceptNoteChapterValidation,
                    stored.validation_id,
                )
                is None
            )
