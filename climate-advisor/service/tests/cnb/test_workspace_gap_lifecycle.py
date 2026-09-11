from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
from app.models.cnb.concept_note_edits import EditChange
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.edits import (
    append_revision,
    resolve_filled_information_gaps,
)
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceConflictError,
)
from sqlalchemy import DefaultClause, delete, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

RUN_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
CHAPTER_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
GAP_ID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")


@pytest.fixture
async def workspace(tmp_path):
    """Create an isolated managed-workspace schema for lifecycle tests."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'workspace.db').as_posix()}"
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    tables = [
        ConceptNoteChapter.__table__,
        ConceptNoteChapterRevision.__table__,
        ConceptNoteGap.__table__,
        ConceptNoteGapResolution.__table__,
        ConceptNoteChapterReview.__table__,
        ConceptNoteChapterValidation.__table__,
        ConceptNoteEvidenceLink.__table__,
    ]
    postgres_defaults = []
    for table in tables:
        for column in table.columns:
            if column.server_default is None or "::jsonb" not in str(
                column.server_default.arg
            ):
                continue
            postgres_defaults.append((column, column.server_default))
            fallback = "'{}'" if column.name == "patch_summary" else "'[]'"
            column.server_default = DefaultClause(text(fallback))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda sync_connection: CnbBase.metadata.create_all(
                    sync_connection,
                    tables=tables,
                )
            )
    finally:
        for column, server_default in postgres_defaults:
            column.server_default = server_default
    try:
        async with session_factory() as session, session.begin():
            session.add(
                ConceptNoteChapter(
                    chapter_id=CHAPTER_ID,
                    run_id=RUN_ID,
                    template_section_id="implementation",
                    title="Implementation",
                    position=0,
                    status="needs_review",
                    required=True,
                )
            )
            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=CHAPTER_ID,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown="## Implementation\n\n[Information needed: Confirm the lead partner.]",
                    patch_summary={},
                )
            )
            session.add(
                ConceptNoteGap(
                    gap_id=GAP_ID,
                    run_id=RUN_ID,
                    chapter_id=CHAPTER_ID,
                    field_key="lead_partner",
                    severity="critical",
                    question="Confirm the lead partner.",
                    why_asking="The delivery model must name an accountable partner.",
                    suggestions=[
                        {
                            "value": "Lincoln Park Neighborhood Council",
                            "source_refs": ["implementation-plan.pdf"],
                        }
                    ],
                    source_refs=["implementation-plan.pdf"],
                    status="open",
                )
            )
        yield ConceptNoteWorkspaceRepository(session_factory)
    finally:
        await engine.dispose()


async def test_accepted_chat_edit_resolves_gap_and_can_be_confirmed(workspace) -> None:
    """Chat acceptance persists the supplied fact without an interview or worker."""
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    marker = "[Information needed: Confirm the lead partner.]"
    answer = "Lincoln Park Neighborhood Council will lead delivery."
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=before.body_markdown.index(marker),
        before=marker,
        after=answer,
        kind="factual",
        group_id="lead_partner",
        user_input_quote=answer,
    )
    body = before.body_markdown.replace(marker, answer)
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        latest = await session.scalar(select(ConceptNoteChapterRevision))
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=before.body_markdown,
            after=body,
            changes=[change],
            user_id="owner",
            idempotency_key=uuid4(),
        )
        await append_revision(
            session,
            chapter,
            latest,
            body=body,
            user_id="owner",
            idempotency_key=uuid4(),
            preserve_ready=False,
            patch_summary={"operation": "apply"},
        )
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert after.body_markdown == body
    assert after.revision_number == 2
    assert after.status == "draft"
    assert not any(gap.state == "open" for gap in after.gaps)
    assert after.gaps[0].state == "resolved"
    assert after.gaps[0].resolution.answer == answer

    key = uuid4()
    for _ in range(2):
        await workspace.confirm_chapter(
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            expected_revision=2,
            idempotency_key=key,
            user_id="owner",
        )
    [confirmed] = await workspace.list_chapters(run_id=RUN_ID)
    assert confirmed.status == "ready"
    assert confirmed.confirmed_revision_number == 2
    async with workspace._session_factory() as session:
        assert len(list(await session.scalars(select(ConceptNoteChapterReview)))) == 1


async def test_open_gap_still_blocks_confirmation(workspace) -> None:
    with pytest.raises(WorkspaceConflictError, match="Open gaps"):
        await workspace.confirm_chapter(
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            expected_revision=1,
            idempotency_key=uuid4(),
            user_id="owner",
        )


async def test_untracked_marker_blocks_confirmation(workspace) -> None:
    async with workspace._session_factory() as session, session.begin():
        await session.execute(delete(ConceptNoteGap))
    with pytest.raises(WorkspaceConflictError, match="markers must be resolved"):
        await workspace.confirm_chapter(
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            expected_revision=1,
            idempotency_key=uuid4(),
            user_id="owner",
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.confirmed_revision_number is None


@pytest.mark.parametrize("untracked_marker", [True, False])
async def test_generated_marker_gap_mismatch_is_not_saved(
    workspace, untracked_marker
) -> None:
    async with workspace._session_factory() as session, session.begin():
        await session.execute(delete(ConceptNoteGap))
        await session.execute(delete(ConceptNoteChapterRevision))
    gap = ConceptNoteDraftGapOutput(
        field_key="budget",
        question="Confirm the budget.",
        why_asking="The budget is required.",
        severity="critical",
    )
    with pytest.raises(WorkspaceConflictError, match="must match the generated gaps"):
        await workspace.save_generated_chapter(
            chapter_id=CHAPTER_ID,
            body_markdown="[Information needed: Confirm the budget.]"
            if untracked_marker
            else "Complete text.",
            missing_information=[] if untracked_marker else [gap],
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.body_markdown is None
    assert chapter.gaps == []


async def test_generated_matching_marker_can_be_saved(workspace) -> None:
    async with workspace._session_factory() as session, session.begin():
        await session.execute(delete(ConceptNoteGap))
        await session.execute(delete(ConceptNoteChapterRevision))
    assert await workspace.save_generated_chapter(
        chapter_id=CHAPTER_ID,
        body_markdown="[Information needed: Confirm the budget.]",
        missing_information=[
            ConceptNoteDraftGapOutput(
                field_key="budget",
                question="Confirm the budget.",
                why_asking="The budget is required.",
                severity="critical",
            )
        ],
    )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.status == "needs_review"
    assert len(chapter.gaps) == 1


async def test_wording_edit_does_not_preserve_ready_with_an_untracked_marker(
    workspace,
) -> None:
    async with workspace._session_factory() as session, session.begin():
        await session.execute(delete(ConceptNoteGap))
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        latest = await session.scalar(select(ConceptNoteChapterRevision))
        chapter.status = "ready"
        chapter.confirmed_revision_id = latest.revision_id
        await append_revision(
            session,
            chapter,
            latest,
            body=latest.body_markdown + "\n\nUpdated wording.",
            user_id="owner",
            idempotency_key=uuid4(),
            preserve_ready=True,
            patch_summary={},
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.status != "ready"
    assert chapter.confirmed_revision_number != chapter.revision_number


async def test_legacy_gap_rationale_is_specific_to_the_missing_fact(
    workspace,
) -> None:
    """Replace the old migration sentinel without changing model rationales."""
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        assert gap is not None
        gap.why_asking = "This information is required to complete the chapter."

    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    rationale = chapter.gaps[0].why_asking

    assert "Confirm the lead partner" in rationale
    assert "Implementation chapter" in rationale
    assert "grounded evidence" in rationale
    assert rationale != "This information is required to complete the chapter."
