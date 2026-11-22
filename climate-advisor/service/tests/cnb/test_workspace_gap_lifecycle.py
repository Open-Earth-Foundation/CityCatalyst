from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.cnb.concept_note_edits import (
    ChapterEditReview,
    EditChange,
    EditPlanOutput,
    EditProposalRequest,
    EditScope,
    EditSemanticDecision,
    GapEditBinding,
    PlannedTextChange,
)
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_reference import CnbFundedProject, CnbFunder
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteGapResolution,
    ConceptNoteMatchedProject,
)
from app.persistence.concept_notes.edits import (
    EditOperationError,
    append_revision,
    resolve_filled_information_gaps,
)
from app.persistence.concept_notes.gaps import (
    _reconcile_evidence_gaps,
    _update_gap_from_output,
    carry_forward_saved_answer,
    record_accepted_narrowing,
    save_partial_answer,
)
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceConflictError,
)
from app.services.cnb.edit_planner import bind_semantic_review
from app.services.cnb.edit_validation import bind_answer_gap, validate_edit_plan
from app.utils.cnb_gap_edit import gap_answer_digest
from sqlalchemy import DefaultClause, delete, select, text, update
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
        ConceptNoteEditProposal.__table__,
        ConceptNoteEditApplication.__table__,
        ConceptNoteExport.__table__,
        CnbFunder.__table__,
        CnbFundedProject.__table__,
        ConceptNoteMatchedProject.__table__,
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
        gap_bindings=[gap_binding(version=1)],
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


async def test_source_revalidation_proposes_revisions_and_preserves_confirmed_text(
    workspace,
) -> None:
    """New evidence closes and reopens gaps without replacing confirmed text."""
    answered_body = (
        "## Implementation\n\nLincoln Park Neighborhood Council will lead delivery."
    )
    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(body_markdown=answered_body),
        source_refs=["implementation-plan.pdf"],
        answered_gap_ids={GAP_ID},
    )
    assert changed is True
    [filled] = await workspace.list_chapters(run_id=RUN_ID)
    assert filled.status == "draft"
    assert filled.revision_number == 2
    assert filled.gaps[0].state == "resolved"
    assert filled.gaps[0].resolution is not None
    assert filled.gaps[0].resolution.action == "evidence_update"
    assert filled.gaps[0].resolution.actor_user_id == "system"

    await workspace.confirm_chapter(
        run_id=RUN_ID,
        chapter_id=CHAPTER_ID,
        expected_revision=2,
        idempotency_key=uuid4(),
        user_id="owner",
    )
    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=2,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nLincoln Park Neighborhood Council will lead "
                "delivery with a newly evidenced municipal steering group."
            ),
        ),
        source_refs=["New implementation plan"],
        answered_gap_ids=set(),
    )
    assert changed is True
    [proposal] = await workspace.list_chapters(run_id=RUN_ID)
    assert proposal.status == "draft"
    assert proposal.revision_number == 3
    assert proposal.confirmed_revision_number == 2
    assert proposal.confirmed_body_markdown == answered_body

    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=3,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\n[Information needed: Which organization is "
                "now accountable for delivery?]"
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
        answered_gap_ids=set(),
    )
    assert changed is True
    [reopened] = await workspace.list_chapters(run_id=RUN_ID)
    assert reopened.status == "needs_review"
    assert reopened.confirmed_revision_number == 2
    assert reopened.gaps[0].state == "open"
    assert reopened.gaps[0].version == 3

    stale = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=3,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown="## Implementation\n\nStale source rewrite.",
        ),
        source_refs=["Stale source"],
        answered_gap_ids=set(),
    )
    assert stale is False
    [unchanged] = await workspace.list_chapters(run_id=RUN_ID)
    assert unchanged.revision_number == 4


async def test_source_revalidation_restores_a_dropped_unanswered_gap(
    workspace,
) -> None:
    """A failed or capped evidence query must not silently resolve its gap.

    The redraft is kept, and the dropped question is put back as its marker.
    """
    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown="## Implementation\n\nA partner will lead delivery."
        ),
        source_refs=["implementation-plan.pdf"],
        answered_gap_ids=set(),
    )

    assert changed is True
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.revision_number == 2
    assert chapter.body_markdown == (
        "## Implementation\n\nA partner will lead delivery.\n\n"
        "[Information needed: Confirm the lead partner.]"
    )
    assert chapter.status == "needs_review"
    [gap] = chapter.gaps
    assert gap.gap_id == GAP_ID
    assert gap.state == "open"
    assert gap.resolution is None
    assert gap.suggestions[0]["value"] == "Lincoln Park Neighborhood Council"


async def test_source_revalidation_closes_only_the_answered_gap(workspace) -> None:
    """With a cited answer for one gap, only that gap closes; the other returns."""
    other_gap = uuid4()
    async with workspace._session_factory() as session, session.begin():
        session.add(
            ConceptNoteGap(
                gap_id=other_gap,
                run_id=RUN_ID,
                chapter_id=CHAPTER_ID,
                field_key="delivery_budget",
                severity="noncritical",
                question="Confirm the delivery budget.",
                why_asking="The funder needs the delivery cost.",
                suggestions=[],
                source_refs=[],
                status="open",
            )
        )

    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nLincoln Park Neighborhood Council will lead."
            )
        ),
        source_refs=["implementation-plan.pdf"],
        answered_gap_ids={GAP_ID},
    )

    assert changed is True
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.body_markdown.endswith(
        "[Information needed: Confirm the delivery budget.]"
    )
    states = {gap.gap_id: gap.state for gap in chapter.gaps}
    assert states == {GAP_ID: "resolved", other_gap: "open"}


async def test_source_revalidation_keeps_deferred_caveat_gaps(workspace) -> None:
    """Caveats have no marker by design, so their absence is not an answer."""
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        assert gap is not None
        gap.status = "caveat"

    changed = await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=(
                "## Implementation\n\nThe lead partner is not yet confirmed and "
                "remains a delivery limitation."
            )
        ),
        source_refs=["implementation-plan.pdf"],
        answered_gap_ids=set(),
    )

    assert changed is True
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.revision_number == 2
    assert chapter.gaps[0].state == "caveat"
    assert chapter.gaps[0].resolution is None


async def test_source_revalidation_rejects_a_restored_marker_it_cannot_match(
    workspace,
) -> None:
    """A "]" in a dropped question truncates its marker, so the redraft is refused."""
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        assert gap is not None
        gap.question = "Cost [approx] in EUR?"

    with pytest.raises(WorkspaceConflictError, match="markers must match"):
        await workspace.save_revalidated_chapter(
            chapter_id=CHAPTER_ID,
            expected_revision_number=1,
            generated=ConceptNoteChapterDraftOutput(
                body_markdown="## Implementation\n\nA partner will lead delivery."
            ),
            source_refs=["implementation-plan.pdf"],
            answered_gap_ids=set(),
        )

    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.revision_number == 1


async def test_source_revalidation_rejects_a_restore_over_the_gap_limit(
    workspace,
) -> None:
    """Restoring a dropped gap must still respect the 30-gap output limit."""
    questions = [f"Confirm figure {index}." for index in range(30)]
    with pytest.raises(WorkspaceConflictError, match="could not be restored"):
        await workspace.save_revalidated_chapter(
            chapter_id=CHAPTER_ID,
            expected_revision_number=1,
            generated=ConceptNoteChapterDraftOutput(
                body_markdown="\n\n".join(
                    f"[Information needed: {question}]" for question in questions
                ),
                missing_information=[
                    ConceptNoteDraftGapOutput(
                        field_key=f"figure_{index}",
                        question=question,
                        why_asking="The funder needs the figure.",
                        severity="noncritical",
                    )
                    for index, question in enumerate(questions)
                ],
            ),
            source_refs=["implementation-plan.pdf"],
            answered_gap_ids=set(),
        )

    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.revision_number == 1


async def test_source_revalidation_rejects_marker_gap_mismatch(workspace) -> None:
    """Every Information-needed marker must have a matching structured gap."""
    with pytest.raises(WorkspaceConflictError, match="markers must match"):
        await workspace.save_revalidated_chapter(
            chapter_id=CHAPTER_ID,
            expected_revision_number=1,
            generated=ConceptNoteChapterDraftOutput(
                body_markdown=(
                    "## Implementation\n\n[Information needed: Confirm the lead "
                    "partner.]"
                ),
            ),
            source_refs=["implementation-plan.pdf"],
            answered_gap_ids=set(),
        )

    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.revision_number == 1


def gap_binding(
    *,
    version: int,
    mode: str = "fill",
    gap_id: UUID = GAP_ID,
    saved: str | None = None,
) -> GapEditBinding:
    """The identity a reviewed change carries for one gap version and its saved answers."""
    return GapEditBinding(
        gap_id=gap_id,
        gap_version=version,
        mode=mode,
        saved_answers_digest=gap_answer_digest(saved),
    )


def bound_scope(**overrides) -> EditScope:
    """A gap-form answer to the fixture gap's first version."""
    values = {
        "focused_chapter_id": CHAPTER_ID,
        "gap_id": GAP_ID,
        "gap_version": 1,
        "answer_complete": True,
    }
    return EditScope(**{**values, **overrides})


LEAD_MARKER = "[Information needed: Confirm the lead partner.]"
LEAD_ANSWER = "Lincoln Park Neighborhood Council will lead delivery."
BUDGET_QUESTION = "Confirm the delivery budget."
BUDGET_MARKER = f"[Information needed: {BUDGET_QUESTION}]"


async def _accept(workspace, *, before: str, after: str, changes: list[EditChange]):
    """Accept reviewed changes as the apply path does: gap transitions, then one revision."""
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .where(ConceptNoteChapterRevision.chapter_id == CHAPTER_ID)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=before,
            after=after,
            changes=changes,
            user_id="owner",
            idempotency_key=uuid4(),
        )
        await append_revision(
            session,
            chapter,
            latest,
            body=after,
            user_id="owner",
            idempotency_key=uuid4(),
            preserve_ready=False,
            patch_summary={"operation": "apply"},
        )


def _lead_change(
    body: str, *, before: str, after: str, bindings: list[GapEditBinding], **fields
) -> EditChange:
    return EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=body.index(before),
        before=before,
        after=after,
        kind="factual",
        group_id="lead_partner",
        user_input_quote=after,
        gap_bindings=bindings,
        **fields,
    )


@pytest.mark.parametrize("answer_complete", [False, True])
@pytest.mark.parametrize(
    ("transition", "mode"),
    [
        ("fill", "fill"),
        ("narrow", "narrow"),
    ],
)
async def test_form_completeness_hint_never_controls_a_reviewed_transition(
    workspace, answer_complete: bool, transition: str, mode: str
) -> None:
    """The form's completeness hint never decides a transition; the reviewed shape does."""
    chapters = await workspace.list_chapters(run_id=RUN_ID)
    if transition == "fill":
        after = LEAD_ANSWER
        coverage = "complete"
    else:
        after = f"{LEAD_ANSWER} {BUDGET_MARKER}"
        coverage = "partial"
    change = PlannedTextChange(
        chapter_id=CHAPTER_ID,
        start=chapters[0].body_markdown.index(LEAD_MARKER),
        before=LEAD_MARKER,
        after=after,
        kind="factual",
        group_id="lead_partner",
        user_input_quote=LEAD_ANSWER,
    )
    reviewed = bind_semantic_review(
        [change],
        ChapterEditReview(
            decisions=[
                EditSemanticDecision(
                    change_index=0,
                    support="user",
                    gap_coverage=coverage,
                    explanation="The user supplied the lead partner.",
                )
            ]
        ),
    )
    request = EditProposalRequest(
        instruction=LEAD_ANSWER,
        scope=bound_scope(answer_complete=answer_complete),
        idempotency_key=uuid4(),
    )
    [accepted] = validate_edit_plan(
        request, chapters, EditPlanOutput(intent="edit", changes=reviewed)
    )
    assert [binding.mode for binding in accepted.gap_bindings] == [mode]
    assert accepted.gap_bindings[0].gap_id == GAP_ID


async def test_accepting_partial_then_full_uses_same_gap_and_exact_remaining_marker(
    workspace,
) -> None:
    """One gap moves v1 -> v2 (narrowed) -> v3 (filled) with no orphan marker."""
    saved = "Lincoln Park Neighborhood Council"
    async with workspace._session_factory() as session, session.begin():
        assert await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=1,
            answer=saved,
            expected_previous=None,
            user_id="owner",
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    narrowed_body = chapter.body_markdown.replace(
        LEAD_MARKER, f"{LEAD_ANSWER} {BUDGET_MARKER}"
    )
    await _accept(
        workspace,
        before=chapter.body_markdown,
        after=narrowed_body,
        changes=[
            _lead_change(
                chapter.body_markdown,
                before=LEAD_MARKER,
                after=f"{LEAD_ANSWER} {BUDGET_MARKER}",
                bindings=[gap_binding(version=1, mode="narrow", saved=saved)],
            )
        ],
    )
    [narrowed] = await workspace.list_chapters(run_id=RUN_ID)
    [gap] = narrowed.gaps
    assert (gap.state, gap.version, gap.question) == ("open", 2, BUDGET_QUESTION)
    assert gap.original_question == "Confirm the lead partner."
    assert gap.accepted_passages == (LEAD_ANSWER,)
    assert gap.answered_so_far == saved
    assert gap.resolution is None
    assert narrowed.body_markdown.count("[Information needed:") == 1

    filled_body = narrowed.body_markdown.replace(BUDGET_MARKER, "EUR 10 million")
    await _accept(
        workspace,
        before=narrowed.body_markdown,
        after=filled_body,
        changes=[
            EditChange(
                chapter_id=CHAPTER_ID,
                chapter_title="Implementation",
                change_id=uuid4(),
                base_revision=2,
                start=narrowed.body_markdown.index(BUDGET_MARKER),
                before=BUDGET_MARKER,
                after="EUR 10 million",
                kind="factual",
                group_id="budget",
                user_input_quote="EUR 10 million",
                gap_bindings=[gap_binding(version=2, mode="fill", saved=saved)],
            )
        ],
    )
    [final] = await workspace.list_chapters(run_id=RUN_ID)
    [gap] = final.gaps
    assert (gap.state, gap.version) == ("resolved", 3)
    assert gap.resolution.answer == "EUR 10 million"
    assert "[Information needed:" not in final.body_markdown
    assert final.body_markdown.endswith("EUR 10 million")


async def test_apply_rejects_a_stale_gap_or_saved_answer_atomically(workspace) -> None:
    """A stale binding or saved answer raises stale_gap and writes neither prose nor progress."""
    async with workspace._session_factory() as session, session.begin():
        assert await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=1,
            answer="Lincoln Park Neighborhood Council",
            expected_previous=None,
            user_id="owner",
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    narrowed_body = chapter.body_markdown.replace(
        LEAD_MARKER, f"{LEAD_ANSWER} {BUDGET_MARKER}"
    )
    stale_bindings = {
        "saved answer changed": [gap_binding(version=1, mode="narrow", saved="Other")],
        "gap version superseded": [
            gap_binding(
                version=2, mode="narrow", saved="Lincoln Park Neighborhood Council"
            )
        ],
    }
    for label, bindings in stale_bindings.items():
        async with workspace._session_factory() as session:
            with pytest.raises(EditOperationError) as error:
                async with session.begin():
                    chapter_row = await session.get(ConceptNoteChapter, CHAPTER_ID)
                    await resolve_filled_information_gaps(
                        session,
                        chapter=chapter_row,
                        before=chapter.body_markdown,
                        after=narrowed_body,
                        changes=[
                            _lead_change(
                                chapter.body_markdown,
                                before=LEAD_MARKER,
                                after=f"{LEAD_ANSWER} {BUDGET_MARKER}",
                                bindings=bindings,
                            )
                        ],
                        user_id="owner",
                        idempotency_key=uuid4(),
                    )
            assert error.value.code == "stale_gap", label
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    [gap] = after.gaps
    assert (gap.state, gap.version, gap.question) == (
        "open",
        1,
        "Confirm the lead partner.",
    )
    assert gap.accepted_passages == ()
    assert after.revision_number == 1
    assert after.body_markdown == chapter.body_markdown


async def test_accepting_one_change_in_multigap_review_leaves_the_other_gap_unchanged(
    workspace,
) -> None:
    """Accepting the lead-partner change never touches the other open signatory gap."""
    async with workspace._session_factory() as session, session.begin():
        session.add(
            ConceptNoteGap(
                gap_id=uuid4(),
                run_id=RUN_ID,
                chapter_id=CHAPTER_ID,
                field_key="signatory",
                severity="critical",
                question="Who signs the grant agreement?",
                why_asking="The grant needs a signatory.",
                suggestions=[],
                source_refs=[],
                status="open",
                version=1,
            )
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    other_marker = "[Information needed: Who signs the grant agreement?]"
    body = f"{chapter.body_markdown}\n\n{other_marker}"
    await _accept(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, LEAD_ANSWER),
        changes=[
            _lead_change(
                body,
                before=LEAD_MARKER,
                after=LEAD_ANSWER,
                bindings=[gap_binding(version=1)],
            )
        ],
    )
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    states = {gap.question: (gap.state, gap.version) for gap in after.gaps}
    assert states == {
        "Confirm the lead partner.": ("resolved", 2),
        "Who signs the grant agreement?": ("open", 1),
    }
    assert after.body_markdown.count(other_marker) == 1


async def test_repeated_marker_occurrences_apply_as_one_gap_transition(
    workspace,
) -> None:
    """Every occurrence of a repeated question fills together and the gap moves once."""
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    body = f"{chapter.body_markdown}\n\nRepeated: {LEAD_MARKER}"
    occurrences = [
        _lead_change(
            body,
            before=LEAD_MARKER,
            after=LEAD_ANSWER,
            bindings=[gap_binding(version=1)],
        ),
    ]
    second = occurrences[0].model_copy(
        update={"change_id": uuid4(), "start": body.rindex(LEAD_MARKER)}
    )
    await _accept(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, LEAD_ANSWER),
        changes=[*occurrences, second],
    )
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    [gap] = after.gaps
    assert (gap.state, gap.version) == ("resolved", 2)
    assert "[Information needed:" not in after.body_markdown
    async with workspace._session_factory() as session:
        answers = (
            await session.scalars(
                select(ConceptNoteGapResolution.answer).where(
                    ConceptNoteGapResolution.gap_id == GAP_ID
                )
            )
        ).all()
    assert list(answers) == [LEAD_ANSWER]


async def test_old_pending_marker_edits_require_a_fresh_review(workspace) -> None:
    """A proposal from before gap bindings cannot move a marker; it must be regenerated."""
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    async with workspace._session_factory() as session:
        with pytest.raises(EditOperationError) as error:
            async with session.begin():
                chapter_row = await session.get(ConceptNoteChapter, CHAPTER_ID)
                await resolve_filled_information_gaps(
                    session,
                    chapter=chapter_row,
                    before=chapter.body_markdown,
                    after=chapter.body_markdown.replace(LEAD_MARKER, LEAD_ANSWER),
                    changes=[
                        _lead_change(
                            chapter.body_markdown,
                            before=LEAD_MARKER,
                            after=LEAD_ANSWER,
                            bindings=[],
                        )
                    ],
                    user_id="owner",
                    idempotency_key=uuid4(),
                )
        assert error.value.code == "stale_gap"
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert after.gaps[0].state == "open"


async def test_a_bound_answer_names_its_gap_version_without_hiding_gaps(
    workspace,
) -> None:
    """The form binding only checks the gap version; every gap stays visible to planning."""
    chapters = await workspace.list_chapters(run_id=RUN_ID)

    def request(scope: EditScope) -> EditProposalRequest:
        return EditProposalRequest(
            instruction="Lead partner: Lincoln Park Neighborhood Council.",
            scope=scope,
            idempotency_key=uuid4(),
        )

    assert bind_answer_gap(request(EditScope()), chapters) is chapters
    assert bind_answer_gap(request(bound_scope()), chapters) is chapters
    assert (
        bind_answer_gap(request(bound_scope(answer_complete=False)), chapters)
        is chapters
    )
    with pytest.raises(EditOperationError) as error:
        bind_answer_gap(request(bound_scope(gap_version=2)), chapters)
    assert error.value.code == "gap_changed"


def test_a_bound_answer_names_its_chapter_and_version() -> None:
    with pytest.raises(ValueError, match="gap_id requires"):
        EditScope(gap_id=GAP_ID, gap_version=1)


UNRECORDED = "[Information needed: Who signs the grant agreement?]"


async def add_unrecorded_marker(workspace) -> None:
    """Revision 2 adds a marker that no gap record tracks (a legacy marker)."""
    async with workspace._session_factory() as session, session.begin():
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=CHAPTER_ID,
                revision_number=2,
                author_type="agent",
                change_type="draft",
                body_markdown="## Implementation\n\n[Information needed: Confirm the lead partner.]\n\n"
                f"Signatory: {UNRECORDED}",
                patch_summary={},
            )
        )


async def test_adopting_an_unrecorded_marker_creates_one_open_gap(workspace) -> None:
    """The record pairs with the marker, so the normal form can close it."""
    await add_unrecorded_marker(workspace)
    gap_id = await workspace.adopt_marker_gap(
        run_id=RUN_ID, chapter_id=CHAPTER_ID, marker=UNRECORDED
    )
    # A retry, even with other formatting, returns the same record.
    assert (
        await workspace.adopt_marker_gap(
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            marker="[Information needed: **who signs the grant agreement**]",
        )
        == gap_id
    )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    adopted = next(gap for gap in chapter.gaps if gap.gap_id == gap_id)
    assert len(chapter.gaps) == 2
    assert adopted.question == "Who signs the grant agreement?"
    assert adopted.state == "open" and adopted.severity == "critical"
    assert adopted.field_key.startswith("adopted_")
    # The stored sentinel is shown as a rationale specific to this marker.
    assert "Who signs the grant agreement?" in adopted.why_asking
    assert "Implementation" in adopted.why_asking
    assert chapter.status == "needs_review"
    assert chapter.body_markdown.endswith(UNRECORDED)

    # Answering it now closes the adopted gap like any other.
    answer = "Jordan Ellis, City Manager, signs the grant agreement."
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=2,
        start=chapter.body_markdown.index(UNRECORDED),
        before=UNRECORDED,
        after=answer,
        kind="factual",
        group_id="signatory",
        user_input_quote="Jordan Ellis, City Manager",
        gap_bindings=[gap_binding(version=1, gap_id=gap_id)],
    )
    async with workspace._session_factory() as session, session.begin():
        row = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=row,
            before=chapter.body_markdown,
            after=chapter.body_markdown.replace(UNRECORDED, answer),
            changes=[change],
            user_id="owner",
            idempotency_key=uuid4(),
        )
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert next(gap for gap in after.gaps if gap.gap_id == gap_id).state == "resolved"


async def test_adoption_keeps_existing_records_and_rejects_missing_markers(
    workspace,
) -> None:
    # A marker that already has an open record keeps it.
    assert (
        await workspace.adopt_marker_gap(
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            marker="[Information needed: Confirm the lead partner.]",
        )
        == GAP_ID
    )
    with pytest.raises(WorkspaceConflictError, match="no longer in the chapter"):
        await workspace.adopt_marker_gap(
            run_id=RUN_ID, chapter_id=CHAPTER_ID, marker=UNRECORDED
        )
    with pytest.raises(WorkspaceConflictError, match="unavailable"):
        await workspace.adopt_marker_gap(
            run_id=uuid4(),
            chapter_id=CHAPTER_ID,
            marker="[Information needed: Confirm the lead partner.]",
        )
    async with workspace._session_factory() as session, session.begin():
        (await session.get(ConceptNoteGap, GAP_ID)).status = "resolved"
    with pytest.raises(WorkspaceConflictError, match="already closed"):
        await workspace.adopt_marker_gap(
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            marker="[Information needed: Confirm the lead partner.]",
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert len(chapter.gaps) == 1


async def test_saved_answers_show_only_for_their_open_gap_version(workspace) -> None:
    """Answers saved from the form stay on the gap until it changes or closes."""
    saved = "1. Lead partner?\nLincoln Park Neighborhood Council\n\n2. Funding?\nNot decided yet"
    async with workspace._session_factory() as session, session.begin():
        # A stale form or another run's gap cannot attach answers.
        for run_id, version in ((RUN_ID, 2), (uuid4(), 1)):
            assert not await save_partial_answer(
                session,
                run_id=run_id,
                gap_id=GAP_ID,
                gap_version=version,
                answer=saved,
                expected_previous=None,
                user_id="owner",
            )
        assert await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=1,
            answer=f" {saved} ",
            expected_previous=None,
            user_id="teammate",
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    [gap] = chapter.gaps
    # Saving changes neither the draft nor the gap version a form is bound to.
    assert (gap.state, gap.version, gap.answered_so_far) == ("open", 1, saved)
    assert chapter.revision_number == 1

    # Once the gap is answered and resolved, the saved answers no longer show.
    marker = "[Information needed: Confirm the lead partner.]"
    answer = "Lincoln Park Neighborhood Council will lead delivery."
    async with workspace._session_factory() as session, session.begin():
        row = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=row,
            before=chapter.body_markdown,
            after=chapter.body_markdown.replace(marker, answer),
            changes=[
                EditChange(
                    chapter_id=CHAPTER_ID,
                    chapter_title="Implementation",
                    change_id=uuid4(),
                    base_revision=1,
                    start=chapter.body_markdown.index(marker),
                    before=marker,
                    after=answer,
                    kind="factual",
                    group_id="lead_partner",
                    user_input_quote=answer,
                    gap_bindings=[gap_binding(version=1, saved=saved)],
                )
            ],
            user_id="owner",
            idempotency_key=uuid4(),
        )
    [after] = (await workspace.list_chapters(run_id=RUN_ID))[0].gaps
    assert (after.state, after.answered_so_far) == ("resolved", None)


async def _save_answers(workspace, answer: str, expected_previous: str | None) -> bool:
    async with workspace._session_factory() as session, session.begin():
        return await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=1,
            answer=answer,
            expected_previous=expected_previous,
            user_id="owner",
        )


async def test_two_open_forms_cannot_overwrite_or_clear_newer_saved_answers(
    workspace,
) -> None:
    """Two forms opened on the same empty gap cannot overwrite each other."""
    [first_view] = await workspace.list_chapters(run_id=RUN_ID)
    [second_view] = await workspace.list_chapters(run_id=RUN_ID)
    assert first_view.gaps[0].answered_so_far is None
    assert second_view.gaps[0].answered_so_far is None

    assert await _save_answers(workspace, "First form's answer", None)
    # The second form still expects nothing saved, so both its save and clear fail.
    assert not await _save_answers(workspace, "Second form's answer", None)
    assert not await _save_answers(workspace, "", None)

    async with workspace._session_factory() as session:
        events = await session.scalars(
            select(ConceptNoteGapResolution).where(
                ConceptNoteGapResolution.gap_id == GAP_ID,
                ConceptNoteGapResolution.action == "partial_answer",
            )
        )
        assert [event.answer for event in events] == ["First form's answer"]
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert (chapter.revision_number, chapter.gaps[0].version) == (1, 1)
    assert chapter.gaps[0].answered_so_far == "First form's answer"

    # A form that reloaded the newer text can save and then clear it.
    assert await _save_answers(workspace, "Second form's answer", "First form's answer")
    assert await _save_answers(workspace, "", "Second form's answer")
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert (chapter.revision_number, chapter.gaps[0].version) == (1, 1)
    assert chapter.gaps[0].answered_so_far is None


VOLUNTEER_MARKER = "[Information needed: Confirm the volunteer count.]"


async def _seed_volunteer_gap(workspace) -> None:
    """Make the seeded gap a numeric volunteer-count gap for estimate tests.

    Only the estimate tests call this, so the shared fixture stays unchanged
    for the other tests.
    """
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        gap.field_key = "volunteer_count"
        gap.question = "Confirm the volunteer count."
        revision = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == CHAPTER_ID,
                ConceptNoteChapterRevision.revision_number == 1,
            )
        )
        revision.body_markdown = revision.body_markdown.replace(
            "[Information needed: Confirm the lead partner.]", VOLUNTEER_MARKER
        )


async def test_an_accepted_estimate_keeps_its_gap_visible_until_confirmed(
    workspace,
) -> None:
    """CC-1239: a labelled estimate fills the marker but leaves a caveat gap.

    A later complete answer bound to that caveat gap replaces the estimate
    text (no marker is left) and resolves it.
    """
    await _seed_volunteer_gap(workspace)
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    marker = VOLUNTEER_MARKER
    estimate = "The City estimates 120 volunteers, pending confirmation."
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=before.body_markdown.index(marker),
        before=marker,
        after=estimate,
        kind="factual",
        group_id="volunteer_count",
        user_input_quote="roughly 120 volunteers, not confirmed",
        estimate=True,
        gap_bindings=[gap_binding(version=1)],
    )
    estimated_body = before.body_markdown.replace(marker, estimate)
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=before.body_markdown,
            after=estimated_body,
            changes=[change],
            user_id="owner",
            idempotency_key=uuid4(),
        )
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert after.gaps[0].state == "caveat"
    assert after.gaps[0].version == 2
    assert after.gaps[0].resolution.answer == estimate

    # A confirmation bound to the superseded version is stale and changes nothing.
    confirmed = "The City confirmed 150 volunteers."
    confirm = change.model_copy(
        update={
            "change_id": uuid4(),
            "before": estimate,
            "after": confirmed,
            "user_input_quote": confirmed,
            "estimate": False,
            "gap_bindings": [gap_binding(version=1, mode="confirm_estimate")],
        }
    )
    async with workspace._session_factory() as session:
        with pytest.raises(EditOperationError) as error:
            async with session.begin():
                chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
                await resolve_filled_information_gaps(
                    session,
                    chapter=chapter,
                    before=estimated_body,
                    after=estimated_body.replace(estimate, confirmed),
                    changes=[confirm],
                    user_id="owner",
                    idempotency_key=uuid4(),
                )
        assert error.value.code == "stale_gap"
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert after.gaps[0].state == "caveat"

    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=estimated_body,
            after=estimated_body.replace(estimate, confirmed),
            changes=[
                confirm.model_copy(
                    update={
                        "gap_bindings": [
                            gap_binding(version=2, mode="confirm_estimate")
                        ]
                    }
                )
            ],
            user_id="owner",
            idempotency_key=uuid4(),
        )
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert after.gaps[0].state == "resolved"
    assert after.gaps[0].version == 3
    async with workspace._session_factory() as session:
        answers = (
            await session.scalars(
                select(ConceptNoteGapResolution.answer).where(
                    ConceptNoteGapResolution.gap_id == GAP_ID
                )
            )
        ).all()
    assert sorted(answers) == sorted([estimate, confirmed])


async def test_saving_answers_for_an_estimate_preserves_its_accepted_resolution(
    workspace,
) -> None:
    """CC-1239: answers saved to confirm an estimate never replace the estimate.

    The accepted estimate stays the gap's resolution while answers are saved
    and cleared at the caveat version; a complete confirmation then resolves it
    and clears the saved text.
    """
    await _seed_volunteer_gap(workspace)
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    marker = VOLUNTEER_MARKER
    estimate = "The City estimates 120 volunteers, pending confirmation."
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=before.body_markdown.index(marker),
        before=marker,
        after=estimate,
        kind="factual",
        group_id="volunteer_count",
        user_input_quote="roughly 120 volunteers, not confirmed",
        estimate=True,
        gap_bindings=[gap_binding(version=1)],
    )
    estimated_body = before.body_markdown.replace(marker, estimate)
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=before.body_markdown,
            after=estimated_body,
            changes=[change],
            user_id="owner",
            idempotency_key=uuid4(),
        )

    # SQLite's second-resolution now() would tie the estimate with the later
    # confirmation, so date the estimate event clearly earlier.
    async with workspace._session_factory() as session, session.begin():
        await session.execute(
            update(ConceptNoteGapResolution)
            .where(
                ConceptNoteGapResolution.gap_id == GAP_ID,
                ConceptNoteGapResolution.action == "answer",
            )
            .values(created_at=datetime(2020, 1, 1, tzinfo=UTC))
        )

    saved = "The confirmed figure is 150 volunteers."
    for answer, expected_previous in ((saved, None), ("", saved)):
        async with workspace._session_factory() as session, session.begin():
            assert await save_partial_answer(
                session,
                run_id=RUN_ID,
                gap_id=GAP_ID,
                gap_version=2,
                answer=answer,
                expected_previous=expected_previous,
                user_id="owner",
            )
        [chapter_view] = await workspace.list_chapters(run_id=RUN_ID)
        [gap] = chapter_view.gaps
        assert (gap.state, gap.version) == ("caveat", 2)
        assert gap.resolution.answer == estimate
        assert gap.answered_so_far == (answer or None)
        assert chapter_view.body_markdown == before.body_markdown

    # Save the answers again so the complete confirmation starts with them saved.
    async with workspace._session_factory() as session, session.begin():
        assert await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=2,
            answer=saved,
            expected_previous=None,
            user_id="owner",
        )
    confirmed = "The City confirmed 150 volunteers."
    confirm = change.model_copy(
        update={
            "change_id": uuid4(),
            "before": estimate,
            "after": confirmed,
            "user_input_quote": confirmed,
            "estimate": False,
            "gap_bindings": [
                gap_binding(version=2, mode="confirm_estimate", saved=saved)
            ],
        }
    )
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=estimated_body,
            after=estimated_body.replace(estimate, confirmed),
            changes=[confirm],
            user_id="owner",
            idempotency_key=uuid4(),
        )
    [after] = (await workspace.list_chapters(run_id=RUN_ID))[0].gaps
    assert (after.state, after.version) == ("resolved", 3)
    assert after.resolution.answer == confirmed
    assert after.answered_so_far is None


async def test_confirming_estimate_and_narrowing_related_marker_commits_both(
    workspace,
) -> None:
    """CC-1239: one acceptance confirms a caveat and narrows a related marker.

    The confirmed amount replaces the hedged estimate, and the open marker that
    asks to confirm the same amount keeps only its unanswered source question.
    An unrelated open marker is left as it was.
    """
    await _caveat_with_estimate(workspace, copies=1)
    related_marker = "[Information needed: Confirm the volunteer count and its source.]"
    source_question = "Confirm the source of the volunteer count."
    unrelated_marker = f"[Information needed: {BUDGET_QUESTION}]"
    related_gap, unrelated_gap = uuid4(), uuid4()
    async with workspace._session_factory() as session, session.begin():
        revision = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == CHAPTER_ID,
                ConceptNoteChapterRevision.revision_number == 1,
            )
        )
        revision.body_markdown += f"\n\n{related_marker}\n\n{unrelated_marker}"
        for gap_id, field_key, question in (
            (
                related_gap,
                "volunteer_source",
                "Confirm the volunteer count and its source.",
            ),
            (unrelated_gap, "budget", BUDGET_QUESTION),
        ):
            session.add(
                ConceptNoteGap(
                    gap_id=gap_id,
                    run_id=RUN_ID,
                    chapter_id=CHAPTER_ID,
                    field_key=field_key,
                    severity="critical",
                    question=question,
                    why_asking="The volunteer count must be sourced.",
                    status="open",
                )
            )
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    body = before.body_markdown
    confirmed = "150 volunteers"
    narrowed = (
        f"The City confirmed {confirmed}. [Information needed: {source_question}]"
    )
    caveat = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=body.index(ESTIMATE),
        before=ESTIMATE,
        after=confirmed,
        kind="factual",
        group_id="volunteer_count",
        user_input_quote=confirmed,
        estimate=False,
        gap_bindings=[gap_binding(version=2, mode="confirm_estimate")],
    )
    related = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=body.index(related_marker),
        before=related_marker,
        after=narrowed,
        kind="factual",
        group_id="volunteer_source",
        user_input_quote=confirmed,
        estimate=False,
        gap_bindings=[gap_binding(version=1, mode="narrow", gap_id=related_gap)],
    )
    after_body = body.replace(ESTIMATE, confirmed).replace(related_marker, narrowed)
    await _accept(workspace, before=body, after=after_body, changes=[caveat, related])
    [after] = await workspace.list_chapters(run_id=RUN_ID)
    gaps = {gap.gap_id: gap for gap in after.gaps}
    assert (gaps[GAP_ID].state, gaps[GAP_ID].version) == ("resolved", 3)
    async with workspace._session_factory() as session:
        answers = (
            await session.scalars(
                select(ConceptNoteGapResolution.answer).where(
                    ConceptNoteGapResolution.gap_id == GAP_ID
                )
            )
        ).all()
    assert confirmed in answers and ESTIMATE in answers
    assert (gaps[related_gap].state, gaps[related_gap].version) == ("open", 2)
    assert gaps[related_gap].question == source_question
    assert (gaps[unrelated_gap].state, gaps[unrelated_gap].version) == ("open", 1)
    assert unrelated_marker in after.body_markdown
    assert ESTIMATE not in after.body_markdown
    assert confirmed in after.body_markdown


def test_an_estimate_is_always_a_factual_change() -> None:
    with pytest.raises(ValueError, match="an estimate is a factual change"):
        EditChange(
            chapter_id=CHAPTER_ID,
            chapter_title="Implementation",
            change_id=uuid4(),
            base_revision=1,
            start=0,
            before="old",
            after="about 2 million",
            kind="wording",
            group_id="amount",
            user_input_quote="about 2 million",
            estimate=True,
        )


async def test_confirming_an_estimate_also_closes_its_duplicate_caveat(
    workspace,
) -> None:
    """CC-1239: the same estimate in another chapter closes with its confirmation.

    The fixture gap holds an estimate written for another chapter's gap. A
    complete answer to that other gap that replaces the estimate text here
    resolves it; a change outside the estimate text leaves it a caveat.
    """
    await _seed_volunteer_gap(workspace)
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    marker = VOLUNTEER_MARKER
    estimate = "an estimated 120 volunteers, the City's unconfirmed figure"
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=before.body_markdown.index(marker),
        before=marker,
        after=f"Delivery relies on {estimate}.",
        kind="factual",
        group_id="volunteers",
        user_input_quote="roughly 120 volunteers, not confirmed",
        estimate=True,
        gap_bindings=[gap_binding(version=1)],
    )
    estimated_body = before.body_markdown.replace(marker, change.after)
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=before.body_markdown,
            after=estimated_body,
            changes=[change],
            user_id="owner",
            idempotency_key=uuid4(),
        )
    # Saved answers on the duplicate never stand in for its accepted estimate.
    reply = "Only a partial reply, not the estimate."
    async with workspace._session_factory() as session, session.begin():
        assert await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=2,
            answer=reply,
            expected_previous=None,
            user_id="owner",
        )
    for old, new, state, bindings in (
        ("## Implementation", "## Delivery", "caveat", []),
        (
            estimate,
            "150 volunteers, confirmed by the City",
            "resolved",
            [gap_binding(version=2, mode="confirm_estimate", saved=reply)],
        ),
    ):
        confirm = change.model_copy(
            update={
                "change_id": uuid4(),
                "start": estimated_body.index(old),
                "before": old,
                "after": new,
                "user_input_quote": new,
                "estimate": False,
                "gap_bindings": bindings,
            }
        )
        async with workspace._session_factory() as session, session.begin():
            chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
            await resolve_filled_information_gaps(
                session,
                chapter=chapter,
                before=estimated_body,
                after=estimated_body.replace(old, new),
                changes=[confirm],
                user_id="owner",
                idempotency_key=uuid4(),
            )
        [after] = await workspace.list_chapters(run_id=RUN_ID)
        assert after.gaps[0].state == state


ESTIMATE = "The City estimates 120 volunteers, pending confirmation."


async def _caveat_with_estimate(workspace, copies: int) -> None:
    """Make the seeded gap a caveat whose estimate appears ``copies`` times in the chapter."""
    await _seed_volunteer_gap(workspace)
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        gap.status = "caveat"
        gap.version = 2
        session.add(
            ConceptNoteGapResolution(
                gap_id=GAP_ID,
                action="answer",
                answer=ESTIMATE,
                gap_version=2,
                actor_user_id="owner",
                source_refs=[],
                idempotency_key=uuid4(),
            )
        )
        revision = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == CHAPTER_ID,
                ConceptNoteChapterRevision.revision_number == 1,
            )
        )
        revision.body_markdown = "## Implementation\n\n" + "\n\n".join(
            f"Delivery relies on {ESTIMATE}" for _ in range(copies)
        )


async def _estimate_state(workspace) -> tuple:
    """Snapshot the revisions, gap version and status, and resolution events for the gap."""
    async with workspace._session_factory() as session:
        revisions = (
            await session.scalars(
                select(ConceptNoteChapterRevision.revision_number).where(
                    ConceptNoteChapterRevision.chapter_id == CHAPTER_ID
                )
            )
        ).all()
        resolutions = (
            await session.scalars(
                select(ConceptNoteGapResolution.resolution_id).where(
                    ConceptNoteGapResolution.gap_id == GAP_ID
                )
            )
        ).all()
        gap = await session.get(ConceptNoteGap, GAP_ID)
        return sorted(revisions), len(resolutions), gap.version, gap.status


@pytest.mark.parametrize("copies", [3, 2])
async def test_estimate_confirmation_rejects_unbound_duplicate_occurrence_atomically(
    workspace, copies
) -> None:
    """CC-1239: an unbound edit cannot change one copy of a repeated estimate.

    The r1 and r2 transcripts repeated the estimate three and two times. Each
    copy is ambiguous, so the apply must fail with no revision, gap or
    resolution written.
    """
    await _caveat_with_estimate(workspace, copies)
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    state_before = await _estimate_state(workspace)
    start = before.body_markdown.index(ESTIMATE)
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=start,
        before=ESTIMATE,
        after="The City now estimates 130 volunteers, pending confirmation.",
        kind="factual",
        group_id="volunteers",
        user_input_quote="130 volunteers",
    )
    after_body = (
        before.body_markdown[:start]
        + change.after
        + before.body_markdown[start + len(ESTIMATE) :]
    )
    with pytest.raises(EditOperationError) as error:
        await _accept(
            workspace, before=before.body_markdown, after=after_body, changes=[change]
        )
    assert error.value.code == "stale_gap"
    assert await _estimate_state(workspace) == state_before


async def test_confirmed_estimate_updates_prose_version_and_resolution_together(
    workspace,
) -> None:
    """CC-1239: a confirmation replaces the estimate, its prose and its resolution at once.

    The caveat gap resolves at its next version, the chapter gains one revision
    and the confirmed text replaces the estimate in the prose.
    """
    await _caveat_with_estimate(workspace, 1)
    [before] = await workspace.list_chapters(run_id=RUN_ID)
    confirmed = "The City confirmed 150 volunteers."
    start = before.body_markdown.index(ESTIMATE)
    change = EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=1,
        start=start,
        before=ESTIMATE,
        after=confirmed,
        kind="factual",
        group_id="volunteers",
        user_input_quote=confirmed,
        gap_bindings=[gap_binding(version=2, mode="confirm_estimate")],
    )
    after_body = before.body_markdown.replace(ESTIMATE, confirmed)
    await _accept(
        workspace, before=before.body_markdown, after=after_body, changes=[change]
    )

    [after] = await workspace.list_chapters(run_id=RUN_ID)
    assert after.body_markdown == after_body
    assert after.revision_number == before.revision_number + 1
    assert (after.gaps[0].state, after.gaps[0].version) == ("resolved", 3)
    async with workspace._session_factory() as session:
        answers = (
            await session.scalars(
                select(ConceptNoteGapResolution.answer).where(
                    ConceptNoteGapResolution.gap_id == GAP_ID
                )
            )
        ).all()
    assert sorted(answers) == sorted([ESTIMATE, confirmed])


SECOND_CHAPTER_ID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
DELETED_CHAPTER_ID = UUID("ffffffff-ffff-4fff-8fff-ffffffffffff")


async def _gap_and_chapter_rows(workspace) -> tuple[dict, dict]:
    """Snapshot every gap record and chapter row, including timestamps."""
    async with workspace._session_factory() as session:
        gaps = (await session.scalars(select(ConceptNoteGap))).all()
        chapters = (await session.scalars(select(ConceptNoteChapter))).all()
        return (
            {
                gap.gap_id: (
                    gap.chapter_id,
                    gap.field_key,
                    gap.severity,
                    gap.question,
                    gap.why_asking,
                    gap.status,
                    gap.created_at,
                    gap.updated_at,
                )
                for gap in gaps
            },
            {
                chapter.chapter_id: (chapter.status, chapter.updated_at)
                for chapter in chapters
            },
        )


async def test_batch_adopts_every_unrecorded_marker_once(workspace) -> None:
    """One run-level call gives each unrecorded marker one record per chapter.

    The concurrent-session part of this scenario belongs to the live harness.
    """
    long_question = "x" * 2_050
    body = (
        "## Implementation\n\n"
        "[Information needed: Confirm the lead partner.]\n\n"
        f"Signatory: {UNRECORDED}\n\n"
        "Again: [Information needed: **who signs the grant agreement**]\n\n"
        "Budget: [Information needed: Confirm the budget.]\n\n"
        f"Long: [Information needed: {long_question}]"
    )
    second_body = (
        "## Scope\n\nFunding: " f"{UNRECORDED}\n\nNote: [Information needed: ***]"
    )
    async with workspace._session_factory() as session, session.begin():
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=CHAPTER_ID,
                revision_number=2,
                author_type="agent",
                change_type="draft",
                body_markdown=body,
                patch_summary={},
            )
        )
        # A closed record keeps its marker closed, so no new record appears.
        session.add(
            ConceptNoteGap(
                gap_id=uuid4(),
                run_id=RUN_ID,
                chapter_id=CHAPTER_ID,
                field_key="budget",
                severity="noncritical",
                question="Confirm the budget.",
                why_asking="The budget must be stated.",
                status="resolved",
            )
        )
        session.add(
            ConceptNoteChapter(
                chapter_id=SECOND_CHAPTER_ID,
                run_id=RUN_ID,
                template_section_id="scope",
                title="Scope",
                position=1,
                status="draft",
                required=True,
            )
        )
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=SECOND_CHAPTER_ID,
                revision_number=1,
                author_type="agent",
                change_type="draft",
                body_markdown=second_body,
                patch_summary={},
            )
        )
        session.add(
            ConceptNoteChapter(
                chapter_id=DELETED_CHAPTER_ID,
                run_id=RUN_ID,
                template_section_id="old",
                title="Old",
                position=2,
                status="deleted",
                required=False,
            )
        )
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=DELETED_CHAPTER_ID,
                revision_number=1,
                author_type="agent",
                change_type="draft",
                body_markdown=f"Old {UNRECORDED}",
                patch_summary={},
            )
        )

    assert await workspace.adopt_legacy_marker_gaps(run_id=RUN_ID) == 3
    first_gaps, first_chapters = await _gap_and_chapter_rows(workspace)

    chapters = {
        chapter.chapter_id: chapter
        for chapter in await workspace.list_chapters(run_id=RUN_ID)
    }
    assert set(chapters) == {CHAPTER_ID, SECOND_CHAPTER_ID}
    first = chapters[CHAPTER_ID]
    adopted = [gap for gap in first.gaps if gap.field_key.startswith("adopted_")]
    assert sorted(gap.question for gap in adopted) == sorted(
        ["Who signs the grant agreement?", long_question]
    )
    assert all(gap.severity == "critical" and gap.state == "open" for gap in adopted)
    assert [gap.question for gap in first.gaps].count("Confirm the budget.") == 1
    assert "Confirm the lead partner." in [gap.question for gap in first.gaps]
    assert first.status == "needs_review"
    assert first.body_markdown == body

    second = chapters[SECOND_CHAPTER_ID]
    assert [gap.question for gap in second.gaps] == ["Who signs the grant agreement?"]
    assert second.gaps[0].severity == "critical" and second.gaps[0].state == "open"
    assert second.status == "needs_review"
    assert second.body_markdown == second_body

    # Open counts: the existing lead-partner gap plus the two adopted ones here.
    assert sum(gap.state == "open" for gap in first.gaps) == 3
    assert sum(gap.state == "open" for gap in second.gaps) == 1
    assert all(row[0] != DELETED_CHAPTER_ID for row in first_gaps.values())

    # Revisions are untouched, so the second chapter keeps its single revision.
    async with workspace._session_factory() as session:
        revisions = (await session.scalars(select(ConceptNoteChapterRevision))).all()
    assert sorted(
        (revision.chapter_id, revision.revision_number) for revision in revisions
    ) == sorted(
        [
            (CHAPTER_ID, 1),
            (CHAPTER_ID, 2),
            (SECOND_CHAPTER_ID, 1),
            (DELETED_CHAPTER_ID, 1),
        ]
    )

    # A repeat call adds nothing and rewrites no timestamp or identifier.
    assert await workspace.adopt_legacy_marker_gaps(run_id=RUN_ID) == 0
    assert await _gap_and_chapter_rows(workspace) == (first_gaps, first_chapters)


def test_accepted_passages_strip_markers_and_keep_the_original_scope() -> None:
    """Progress keeps the first scope, marker-free passages and no duplicates."""
    gap = ConceptNoteGap(question="Who leads and when?", answer_progress=None)
    record_accepted_narrowing(
        gap,
        previous_question="Who leads and when?",
        passage="Lincoln Park leads. [Information needed: When does it start?]",
    )
    record_accepted_narrowing(
        gap,
        previous_question="When does it start?",
        passage="Lincoln Park leads.",
    )
    record_accepted_narrowing(
        gap,
        previous_question="When does it start?",
        passage="The budget is set.",
    )
    assert gap.answer_progress == {
        "original_question": "Who leads and when?",
        "accepted_passages": ["Lincoln Park leads.", "The budget is set."],
    }


async def test_narrowing_carries_saved_answers_to_the_new_version_without_creating_a_resolution(
    workspace,
) -> None:
    """An accepted narrowing moves saved answers to the new version, not a resolution."""
    saved = "Lincoln Park Neighborhood Council will lead delivery."
    assert await _save_answers(workspace, saved, None)
    passage = "Lincoln Park Neighborhood Council will lead delivery."
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID, with_for_update=True)
        previous_question = gap.question
        gap.version = 2
        gap.question = "Confirm the delivery budget."
        record_accepted_narrowing(
            gap, previous_question=previous_question, passage=passage
        )
        assert await carry_forward_saved_answer(session, gap=gap, previous_version=1)
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    [narrowed] = chapter.gaps
    assert (narrowed.gap_id, narrowed.state, narrowed.version) == (GAP_ID, "open", 2)
    assert narrowed.question == "Confirm the delivery budget."
    assert narrowed.answered_so_far == saved
    assert narrowed.resolution is None
    assert narrowed.original_question == "Confirm the lead partner."
    assert narrowed.accepted_passages == (passage,)

    async with workspace._session_factory() as session, session.begin():
        non_partial = await session.scalar(
            select(ConceptNoteGapResolution.resolution_id).where(
                ConceptNoteGapResolution.gap_id == GAP_ID,
                ConceptNoteGapResolution.action != "partial_answer",
            )
        )
        # The stale form still holds no saved text, so its save is refused.
        stale = await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=2,
            answer="A newer answer",
            expected_previous=None,
            user_id="owner",
        )
    assert non_partial is None
    assert stale is False


async def test_carry_forward_leaves_a_clear_gap_clear(workspace) -> None:
    """With no saved answers at the previous version, nothing is carried forward."""
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        gap.version = 2
        assert not await carry_forward_saved_answer(
            session, gap=gap, previous_version=1
        )
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.gaps[0].answered_so_far is None


def test_redraft_resets_progress_only_when_gap_scope_changes_or_reopens() -> None:
    """A changed normalized question or a reopen starts a new specification."""
    progress = {
        "original_question": "Confirm the lead partner.",
        "accepted_passages": ["Lincoln Park leads."],
    }

    def gap_with_progress(status: str = "open") -> ConceptNoteGap:
        return ConceptNoteGap(
            gap_id=GAP_ID,
            run_id=RUN_ID,
            chapter_id=CHAPTER_ID,
            field_key="lead_partner",
            severity="critical",
            question="Confirm the lead partner.",
            why_asking="The delivery model must name an accountable partner.",
            suggestions=[],
            source_refs=[],
            status=status,
            version=2,
            answer_progress=dict(progress),
        )

    def output(
        question: str, why_asking: str | None = None
    ) -> ConceptNoteDraftGapOutput:
        return ConceptNoteDraftGapOutput(
            field_key="lead_partner",
            question=question,
            why_asking=why_asking
            or "The delivery model must name an accountable partner.",
            severity="critical",
            suggestions=[],
        )

    # Spelling and presentation of the same question keep the lineage.
    same_question = gap_with_progress()
    assert _update_gap_from_output(
        same_question, output("confirm the lead partner", "Name the partner.")
    )
    assert same_question.answer_progress == progress

    # A different normalized question is a new original for that scope.
    new_scope = gap_with_progress()
    _update_gap_from_output(new_scope, output("Confirm the delivery budget."))
    assert new_scope.answer_progress is None

    # Reopening a resolved row resets it; an open row keeps its lineage.
    session = MagicMock()
    reopened = gap_with_progress(status="resolved")
    _reconcile_evidence_gaps(
        session, None, [reopened], [output("Confirm the lead partner.")], [], set()
    )
    assert (reopened.status, reopened.answer_progress) == ("open", None)
    still_open = gap_with_progress()
    _reconcile_evidence_gaps(
        session, None, [still_open], [output("Confirm the lead partner.")], [], set()
    )
    assert still_open.answer_progress == progress


async def test_working_copy_keeps_gap_answer_progress_with_independent_identity(
    workspace,
) -> None:
    """A working copy carries gap progress as an independent copy, not a link."""
    progress = {
        "original_question": "Confirm the lead partner.",
        "accepted_passages": ["Lincoln Park Neighborhood Council will lead delivery."],
    }
    [source_before] = (await workspace.list_chapters(run_id=RUN_ID))[0].gaps
    assert (source_before.original_question, source_before.accepted_passages) == (
        None,
        (),
    )
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        gap.answer_progress = progress

    destination_id = uuid4()
    await workspace.copy_working_copy(
        source_run_id=RUN_ID, destination_run_id=destination_id
    )
    [source] = (await workspace.list_chapters(run_id=RUN_ID))[0].gaps
    [copied] = (await workspace.list_chapters(run_id=destination_id))[0].gaps
    expected = (progress["original_question"], tuple(progress["accepted_passages"]))
    assert copied.gap_id != source.gap_id
    assert (copied.original_question, copied.accepted_passages) == expected
    assert (source.original_question, source.accepted_passages) == expected

    # Clearing the copy's progress does not change the source gap.
    async with workspace._session_factory() as session, session.begin():
        copied_row = await session.get(ConceptNoteGap, copied.gap_id)
        copied_row.answer_progress = None
    [source_after] = (await workspace.list_chapters(run_id=RUN_ID))[0].gaps
    assert source_after.accepted_passages == expected[1]
