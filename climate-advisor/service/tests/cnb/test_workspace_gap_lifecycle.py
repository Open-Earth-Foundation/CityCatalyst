from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceConflictError,
)
from sqlalchemy import DefaultClause, select, text
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


async def test_answer_is_idempotent_versioned_and_requires_confirmation(
    workspace,
) -> None:
    """Move one chapter through processing, Draft, and explicit Ready."""
    key = uuid4()
    start = await workspace.prepare_gap_resolution(
        run_id=RUN_ID,
        gap_id=GAP_ID,
        action="answer",
        answer="Lincoln Park Neighborhood Council",
        expected_version=1,
        idempotency_key=key,
        user_id="owner",
    )
    replay = await workspace.prepare_gap_resolution(
        run_id=RUN_ID,
        gap_id=GAP_ID,
        action="answer",
        answer="Lincoln Park Neighborhood Council",
        expected_version=1,
        idempotency_key=key,
        user_id="owner",
    )
    assert start.should_regenerate is True
    assert replay.should_regenerate is False
    assert replay.resolution_id == start.resolution_id

    with pytest.raises(WorkspaceConflictError, match="idempotency key"):
        await workspace.prepare_gap_resolution(
            run_id=RUN_ID,
            gap_id=GAP_ID,
            action="answer",
            answer="A different organization",
            expected_version=1,
            idempotency_key=key,
            user_id="owner",
        )

    with pytest.raises(WorkspaceConflictError, match="stale"):
        await workspace.prepare_gap_resolution(
            run_id=RUN_ID,
            gap_id=GAP_ID,
            action="answer",
            answer="Different answer",
            expected_version=1,
            idempotency_key=uuid4(),
            user_id="owner",
        )

    completed = await workspace.complete_gap_regeneration(
        chapter_id=CHAPTER_ID,
        gap_id=GAP_ID,
        resolution_id=start.resolution_id,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nLincoln Park Neighborhood Council will lead delivery."
            ),
            missing_information=[],
        ),
    )
    assert completed is True
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.status == "draft"
    assert chapter.revision_number == 2
    assert chapter.gaps[0].state == "resolved"
    assert chapter.gaps[0].resolution is not None
    assert chapter.gaps[0].resolution.answer == "Lincoln Park Neighborhood Council"
    assert chapter.gaps[0].resolution.source_refs == ["implementation-plan.pdf"]

    await workspace.confirm_chapter(
        run_id=RUN_ID,
        chapter_id=CHAPTER_ID,
        expected_revision=2,
        idempotency_key=uuid4(),
        user_id="owner",
    )
    [ready] = await workspace.list_chapters(run_id=RUN_ID)
    assert ready.status == "ready"
    assert ready.confirmed_revision_number == 2
    assert ready.proposed_revision_number is None

    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=2,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nLincoln Park Neighborhood Council will lead "
                "delivery with a newly evidenced municipal steering group."
            ),
            missing_information=[],
        ),
        source_refs=["New implementation plan"],
    )
    assert changed is True
    [proposal] = await workspace.list_chapters(run_id=RUN_ID)
    assert proposal.status == "draft"
    assert (
        proposal.confirmed_body_markdown
        == "## Implementation\n\nLincoln Park Neighborhood Council will lead delivery."
    )
    assert proposal.confirmed_revision_number == 2
    assert proposal.proposed_revision_number == 3

    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=3,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nThe new evidence no longer identifies the "
                "accountable delivery partner."
            ),
            missing_information=[
                ConceptNoteDraftGapOutput(
                    field_key="lead_partner",
                    question="Which organization is now accountable for delivery?",
                    why_asking="New evidence conflicts with the confirmed lead.",
                    severity="critical",
                )
            ],
        ),
        source_refs=["Updated implementation plan"],
    )
    assert changed is True
    [blocked_proposal] = await workspace.list_chapters(run_id=RUN_ID)
    assert blocked_proposal.status == "needs_review"
    assert blocked_proposal.confirmed_revision_number == 2
    assert blocked_proposal.proposed_revision_number == 4
    assert blocked_proposal.gaps[0].state == "open"
    assert blocked_proposal.gaps[0].version == 3

    stale = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=3,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown="## Implementation\n\nStale source rewrite.",
        ),
        source_refs=["Stale source"],
    )
    assert stale is False
    [unchanged] = await workspace.list_chapters(run_id=RUN_ID)
    assert unchanged.revision_number == 4


async def test_critical_gap_cannot_be_deferred(workspace) -> None:
    """Keep critical information blocking until answered or dismissed."""
    with pytest.raises(WorkspaceConflictError, match="Critical gaps"):
        await workspace.prepare_gap_resolution(
            run_id=RUN_ID,
            gap_id=GAP_ID,
            action="defer_as_caveat",
            answer=None,
            expected_version=1,
            idempotency_key=uuid4(),
            user_id="owner",
        )


async def test_gap_impact_rewrite_appends_revision_and_answer_provenance(
    workspace,
) -> None:
    """Turn a reviewer-selected chapter into a proposal without overwriting it."""
    source_gap_id = uuid4()
    source_resolution_id = uuid4()
    started = await workspace.begin_gap_impact_regeneration(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
    )
    assert started is True

    changed = await workspace.save_gap_impact_regeneration(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nThe municipality confirmed it will lead delivery."
            ),
            missing_information=[],
        ),
        source_gap_id=source_gap_id,
        source_resolution_id=source_resolution_id,
        actor_user_id="owner",
        answer="The municipality will lead delivery.",
        source_refs=["project-plan.pdf"],
    )

    assert changed is True
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.revision_number == 2
    assert chapter.status == "draft"
    assert chapter.regeneration_status == "idle"
    assert chapter.gaps[0].state == "resolved"
    assert chapter.gaps[0].resolution is not None
    assert chapter.gaps[0].resolution.action == "answer"
    assert chapter.gaps[0].resolution.answer == "The municipality will lead delivery."
    assert chapter.gaps[0].resolution.actor_user_id == "owner"
    assert chapter.gaps[0].resolution.source_refs == ["project-plan.pdf"]


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


async def test_noncritical_gap_can_remain_visible_as_confirmed_caveat(
    workspace,
) -> None:
    """Allow an explicitly acknowledged non-critical caveat to remain visible."""
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        assert gap is not None
        gap.severity = "noncritical"

    start = await workspace.prepare_gap_resolution(
        run_id=RUN_ID,
        gap_id=GAP_ID,
        action="defer_as_caveat",
        answer=None,
        expected_version=1,
        idempotency_key=uuid4(),
        user_id="owner",
    )
    await workspace.complete_gap_regeneration(
        chapter_id=CHAPTER_ID,
        gap_id=GAP_ID,
        resolution_id=start.resolution_id,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nThe accountable lead partner remains to be "
                "confirmed and is retained as a review caveat."
            ),
            missing_information=[],
        ),
    )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.status == "draft"
    assert chapter.gaps[0].state == "caveat"

    await workspace.confirm_chapter(
        run_id=RUN_ID,
        chapter_id=CHAPTER_ID,
        expected_revision=2,
        idempotency_key=uuid4(),
        user_id="owner",
    )
    [ready] = await workspace.list_chapters(run_id=RUN_ID)
    assert ready.status == "ready"
    assert ready.gaps[0].state == "caveat"


async def test_failed_regeneration_retains_answer_and_can_append_retry(
    workspace,
) -> None:
    """Keep accepted input auditable and retry through a new correction event."""
    start = await workspace.prepare_gap_resolution(
        run_id=RUN_ID,
        gap_id=GAP_ID,
        action="answer",
        answer="Lincoln Park Neighborhood Council",
        expected_version=1,
        idempotency_key=uuid4(),
        user_id="owner",
    )

    await workspace.fail_gap_regeneration(
        chapter_id=CHAPTER_ID,
        gap_id=GAP_ID,
        resolution_id=start.resolution_id,
    )
    [failed] = await workspace.list_chapters(run_id=RUN_ID)
    assert failed.regeneration_status == "failed"
    assert failed.gaps[0].state == "processing"
    assert failed.gaps[0].resolution is not None
    assert failed.gaps[0].resolution.answer == "Lincoln Park Neighborhood Council"

    retry = await workspace.prepare_gap_resolution(
        run_id=RUN_ID,
        gap_id=GAP_ID,
        action="correction",
        answer="Lincoln Park Neighborhood Council",
        expected_version=2,
        idempotency_key=uuid4(),
        user_id="owner",
    )
    assert retry.should_regenerate is True

    async with workspace._session_factory() as session:
        resolutions = list(
            (
                await session.scalars(
                    select(ConceptNoteGapResolution).where(
                        ConceptNoteGapResolution.gap_id == GAP_ID
                    )
                )
            ).all()
        )
    assert len(resolutions) == 2
