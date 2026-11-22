from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
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
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
    ConceptNoteGapResolution,
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
from app.persistence.concept_notes.workspace import WorkspaceConflictError
from app.services.cnb.edit_planner import bind_semantic_review
from app.services.cnb.edit_validation import bind_answer_gap, validate_edit_plan
from app.utils.cnb_gap_edit import gap_answer_digest
from sqlalchemy import delete, select, update
from tests.test_concept_note_lifecycle import _workspace_repository

RUN_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
CHAPTER_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
GAP_ID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")


@pytest.fixture
async def workspace():
    """Seed one chapter, its first revision and one open gap in an isolated workspace."""
    async with _workspace_repository() as (repository, session_factory):
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
        yield repository


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


LEAD_QUESTION = "Confirm the lead partner."
LEAD_MARKER = f"[Information needed: {LEAD_QUESTION}]"
LEAD_ANSWER = "Lincoln Park Neighborhood Council will lead delivery."
BUDGET_QUESTION = "Confirm the delivery budget."
BUDGET_MARKER = f"[Information needed: {BUDGET_QUESTION}]"
SIGNATORY_QUESTION = "Who signs the grant agreement?"
UNRECORDED = f"[Information needed: {SIGNATORY_QUESTION}]"
VOLUNTEER_MARKER = "[Information needed: Confirm the volunteer count.]"
ESTIMATE = "The City estimates 120 volunteers, pending confirmation."
CONFIRMED = "The City confirmed 150 volunteers."


def gap_change(
    body: str,
    before: str,
    after: str,
    *,
    bindings: list[GapEditBinding] = (),
    quote: str | None = None,
    group: str = "lead_partner",
    base_revision: int = 1,
    kind: str = "factual",
    **fields,
) -> EditChange:
    """A reviewed change of the first ``before`` in ``body``; the quote defaults to ``after``."""
    return EditChange(
        chapter_id=CHAPTER_ID,
        chapter_title="Implementation",
        change_id=uuid4(),
        base_revision=base_revision,
        start=body.index(before),
        before=before,
        after=after,
        kind=kind,
        group_id=group,
        user_input_quote=after if quote is None else quote,
        gap_bindings=list(bindings),
        **fields,
    )


def gap_row(
    question: str,
    *,
    field_key: str,
    gap_id: UUID | None = None,
    chapter_id: UUID = CHAPTER_ID,
    severity: str = "critical",
    status: str = "open",
) -> ConceptNoteGap:
    return ConceptNoteGap(
        gap_id=gap_id or uuid4(),
        run_id=RUN_ID,
        chapter_id=chapter_id,
        field_key=field_key,
        severity=severity,
        question=question,
        why_asking="Needed for the chapter.",
        suggestions=[],
        source_refs=[],
        status=status,
    )


async def add_rows(workspace, *rows) -> None:
    async with workspace._session_factory() as session, session.begin():
        session.add_all(rows)


async def update_fixture_gap(workspace, *, body: str | None = None, **values) -> None:
    """Change the seeded gap's columns and, optionally, its first revision's body."""
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID)
        for name, value in values.items():
            setattr(gap, name, value)
        if body is not None:
            revision = await session.scalar(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.chapter_id == CHAPTER_ID,
                    ConceptNoteChapterRevision.revision_number == 1,
                )
            )
            revision.body_markdown = body


async def resolve(workspace, *, before: str, after: str, changes: list[EditChange]):
    """Run only the gap transitions of an acceptance, without a new revision."""
    async with workspace._session_factory() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        await resolve_filled_information_gaps(
            session,
            chapter=chapter,
            before=before,
            after=after,
            changes=changes,
            user_id="owner",
            idempotency_key=uuid4(),
        )


async def accept(workspace, *, before: str, after: str, changes: list[EditChange]):
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


async def stale_gap_error(workspace, **acceptance) -> str:
    """Run a gap transition that must fail and return its error code."""
    with pytest.raises(EditOperationError) as error:
        await resolve(workspace, **acceptance)
    return error.value.code


async def save_answers(
    workspace,
    answer: str,
    expected_previous: str | None = None,
    *,
    version: int = 1,
    run_id: UUID = RUN_ID,
    user_id: str = "owner",
) -> bool:
    async with workspace._session_factory() as session, session.begin():
        return await save_partial_answer(
            session,
            run_id=run_id,
            gap_id=GAP_ID,
            gap_version=version,
            answer=answer,
            expected_previous=expected_previous,
            user_id=user_id,
        )


async def resolution_answers(workspace, gap_id: UUID = GAP_ID) -> list[str]:
    async with workspace._session_factory() as session:
        answers = await session.scalars(
            select(ConceptNoteGapResolution.answer).where(
                ConceptNoteGapResolution.gap_id == gap_id
            )
        )
        return sorted(answers)


async def fixture_chapter(workspace):
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    return chapter


@pytest.mark.parametrize(
    ("transition", "answer_complete"),
    [
        ("fill", False),
        ("narrow", True),
    ],
)
async def test_form_completeness_hint_never_controls_a_reviewed_transition(
    workspace, transition: str, answer_complete: bool
) -> None:
    """The form's completeness hint never decides a transition; the reviewed shape does."""
    chapters = await workspace.list_chapters(run_id=RUN_ID)
    if transition == "fill":
        after, coverage = LEAD_ANSWER, "complete"
    else:
        after, coverage = f"{LEAD_ANSWER} {BUDGET_MARKER}", "partial"
    change = PlannedTextChange(
        chapter_id=CHAPTER_ID,
        start=chapters[0].body_markdown.index(LEAD_MARKER),
        before=LEAD_MARKER,
        after=after,
        kind="factual",
        group_id="lead_partner",
        user_input_quote=LEAD_ANSWER,
    )
    decision = EditSemanticDecision(
        change_index=0,
        support="user",
        gap_coverage=coverage,
        explanation="The user supplied the lead partner.",
    )
    reviewed = bind_semantic_review([change], ChapterEditReview(decisions=[decision]))
    request = EditProposalRequest(
        instruction=LEAD_ANSWER,
        scope=bound_scope(answer_complete=answer_complete),
        idempotency_key=uuid4(),
    )
    [accepted] = validate_edit_plan(
        request, chapters, EditPlanOutput(intent="edit", changes=reviewed)
    )
    assert [binding.mode for binding in accepted.gap_bindings] == [transition]
    assert accepted.gap_bindings[0].gap_id == GAP_ID


async def test_accepting_partial_then_full_uses_same_gap_and_exact_remaining_marker(
    workspace,
) -> None:
    """One gap moves v1 -> v2 (narrowed) -> v3 (filled) with no orphan marker."""
    saved = "Lincoln Park Neighborhood Council"
    assert await save_answers(workspace, saved)
    body = (await fixture_chapter(workspace)).body_markdown
    narrowing = f"{LEAD_ANSWER} {BUDGET_MARKER}"
    await accept(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, narrowing),
        changes=[
            gap_change(
                body,
                LEAD_MARKER,
                narrowing,
                bindings=[gap_binding(version=1, mode="narrow", saved=saved)],
            )
        ],
    )
    narrowed = await fixture_chapter(workspace)
    [gap] = narrowed.gaps
    assert (gap.state, gap.version, gap.question) == ("open", 2, BUDGET_QUESTION)
    assert gap.original_question == LEAD_QUESTION
    assert gap.accepted_passages == (LEAD_ANSWER,)
    assert gap.answered_so_far == saved
    assert gap.resolution is None
    assert narrowed.body_markdown.count("[Information needed:") == 1

    body = narrowed.body_markdown
    await accept(
        workspace,
        before=body,
        after=body.replace(BUDGET_MARKER, "EUR 10 million"),
        changes=[
            gap_change(
                body,
                BUDGET_MARKER,
                "EUR 10 million",
                group="budget",
                base_revision=2,
                bindings=[gap_binding(version=2, saved=saved)],
            )
        ],
    )
    final = await fixture_chapter(workspace)
    [gap] = final.gaps
    assert (gap.state, gap.version) == ("resolved", 3)
    assert gap.resolution.answer == "EUR 10 million"
    assert "[Information needed:" not in final.body_markdown
    assert final.body_markdown.endswith("EUR 10 million")


async def test_apply_rejects_a_stale_gap_or_saved_answer_atomically(workspace) -> None:
    """A stale binding or saved answer raises stale_gap and writes neither prose nor progress."""
    saved = "Lincoln Park Neighborhood Council"
    assert await save_answers(workspace, saved)
    before = await fixture_chapter(workspace)
    body = before.body_markdown
    narrowing = f"{LEAD_ANSWER} {BUDGET_MARKER}"
    stale_bindings = {
        "saved answer changed": gap_binding(version=1, mode="narrow", saved="Other"),
        "gap version superseded": gap_binding(version=2, mode="narrow", saved=saved),
    }
    for label, binding in stale_bindings.items():
        code = await stale_gap_error(
            workspace,
            before=body,
            after=body.replace(LEAD_MARKER, narrowing),
            changes=[gap_change(body, LEAD_MARKER, narrowing, bindings=[binding])],
        )
        assert code == "stale_gap", label
    after = await fixture_chapter(workspace)
    [gap] = after.gaps
    assert (gap.state, gap.version, gap.question) == ("open", 1, LEAD_QUESTION)
    assert gap.accepted_passages == ()
    assert after.revision_number == 1
    assert after.body_markdown == body


async def test_accepting_one_change_in_multigap_review_leaves_the_other_gap_unchanged(
    workspace,
) -> None:
    """Accepting the lead-partner change never touches the other open signatory gap."""
    await add_rows(workspace, gap_row(SIGNATORY_QUESTION, field_key="signatory"))
    body = f"{(await fixture_chapter(workspace)).body_markdown}\n\n{UNRECORDED}"
    await accept(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, LEAD_ANSWER),
        changes=[
            gap_change(
                body, LEAD_MARKER, LEAD_ANSWER, bindings=[gap_binding(version=1)]
            )
        ],
    )
    after = await fixture_chapter(workspace)
    states = {gap.question: (gap.state, gap.version) for gap in after.gaps}
    assert states == {
        LEAD_QUESTION: ("resolved", 2),
        SIGNATORY_QUESTION: ("open", 1),
    }
    assert after.body_markdown.count(UNRECORDED) == 1


async def test_repeated_marker_occurrences_apply_as_one_gap_transition(
    workspace,
) -> None:
    """Every occurrence of a repeated question fills together and the gap moves once."""
    body = (
        f"{(await fixture_chapter(workspace)).body_markdown}\n\nRepeated: {LEAD_MARKER}"
    )
    first = gap_change(
        body, LEAD_MARKER, LEAD_ANSWER, bindings=[gap_binding(version=1)]
    )
    second = first.model_copy(
        update={"change_id": uuid4(), "start": body.rindex(LEAD_MARKER)}
    )
    await accept(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, LEAD_ANSWER),
        changes=[first, second],
    )
    after = await fixture_chapter(workspace)
    [gap] = after.gaps
    assert (gap.state, gap.version) == ("resolved", 2)
    assert "[Information needed:" not in after.body_markdown
    assert await resolution_answers(workspace) == [LEAD_ANSWER]


async def test_old_pending_marker_edits_require_a_fresh_review(workspace) -> None:
    """A proposal from before gap bindings cannot move a marker; it must be regenerated."""
    body = (await fixture_chapter(workspace)).body_markdown
    code = await stale_gap_error(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, LEAD_ANSWER),
        changes=[gap_change(body, LEAD_MARKER, LEAD_ANSWER, bindings=[])],
    )
    assert code == "stale_gap"
    assert (await fixture_chapter(workspace)).gaps[0].state == "open"


async def test_a_bound_answer_to_a_superseded_gap_version_is_rejected(
    workspace,
) -> None:
    """The form binding only checks the gap version; a superseded version is rejected."""
    chapters = await workspace.list_chapters(run_id=RUN_ID)
    request = EditProposalRequest(
        instruction="Lead partner: Lincoln Park Neighborhood Council.",
        scope=bound_scope(gap_version=2),
        idempotency_key=uuid4(),
    )
    with pytest.raises(EditOperationError) as error:
        bind_answer_gap(request, chapters)
    assert error.value.code == "gap_changed"


def test_a_bound_answer_names_its_chapter_and_version() -> None:
    with pytest.raises(ValueError, match="gap_id requires"):
        EditScope(gap_id=GAP_ID, gap_version=1)


async def test_saved_answers_show_only_for_their_open_gap_version(workspace) -> None:
    """Answers saved from the form stay on the gap until it changes or closes."""
    saved = "1. Lead partner?\nLincoln Park Neighborhood Council\n\n2. Funding?\nNot decided yet"
    # A stale form or another run's gap cannot attach answers.
    assert not await save_answers(workspace, saved, version=2)
    assert not await save_answers(workspace, saved, run_id=uuid4())
    assert await save_answers(workspace, f" {saved} ", user_id="teammate")
    chapter = await fixture_chapter(workspace)
    [gap] = chapter.gaps
    # Saving changes neither the draft nor the gap version a form is bound to.
    assert (gap.state, gap.version, gap.answered_so_far) == ("open", 1, saved)
    assert chapter.revision_number == 1

    # Once the gap is answered and resolved, the saved answers no longer show.
    body = chapter.body_markdown
    await resolve(
        workspace,
        before=body,
        after=body.replace(LEAD_MARKER, LEAD_ANSWER),
        changes=[
            gap_change(
                body,
                LEAD_MARKER,
                LEAD_ANSWER,
                bindings=[gap_binding(version=1, saved=saved)],
            )
        ],
    )
    [after] = (await fixture_chapter(workspace)).gaps
    assert (after.state, after.answered_so_far) == ("resolved", None)


async def test_two_open_forms_cannot_overwrite_or_clear_newer_saved_answers(
    workspace,
) -> None:
    """Two forms opened on the same empty gap cannot overwrite each other."""
    assert (await fixture_chapter(workspace)).gaps[0].answered_so_far is None

    assert await save_answers(workspace, "First form's answer")
    # The second form still expects nothing saved, so both its save and clear fail.
    assert not await save_answers(workspace, "Second form's answer")
    assert not await save_answers(workspace, "")

    async with workspace._session_factory() as session:
        events = await session.scalars(
            select(ConceptNoteGapResolution).where(
                ConceptNoteGapResolution.gap_id == GAP_ID,
                ConceptNoteGapResolution.action == "partial_answer",
            )
        )
        assert [event.answer for event in events] == ["First form's answer"]
    chapter = await fixture_chapter(workspace)
    assert (chapter.revision_number, chapter.gaps[0].version) == (1, 1)
    assert chapter.gaps[0].answered_so_far == "First form's answer"

    # A form that reloaded the newer text can save and then clear it.
    assert await save_answers(workspace, "Second form's answer", "First form's answer")
    assert await save_answers(workspace, "", "Second form's answer")
    chapter = await fixture_chapter(workspace)
    assert (chapter.revision_number, chapter.gaps[0].version) == (1, 1)
    assert chapter.gaps[0].answered_so_far is None


async def seed_volunteer_gap(workspace) -> str:
    """Make the seeded gap a numeric volunteer-count gap; return the new body."""
    body = f"## Implementation\n\n{VOLUNTEER_MARKER}"
    await update_fixture_gap(
        workspace,
        body=body,
        field_key="volunteer_count",
        question="Confirm the volunteer count.",
    )
    return body


async def accept_estimate(workspace, estimate: str, *, after: str | None = None):
    """Fill the volunteer marker with a labelled estimate; return the body and change."""
    body = await seed_volunteer_gap(workspace)
    change = gap_change(
        body,
        VOLUNTEER_MARKER,
        after or estimate,
        quote="roughly 120 volunteers, not confirmed",
        group="volunteer_count",
        estimate=True,
        bindings=[gap_binding(version=1)],
    )
    estimated = body.replace(VOLUNTEER_MARKER, change.after)
    await resolve(workspace, before=body, after=estimated, changes=[change])
    return estimated, change


def confirmation(
    change: EditChange, body: str, before: str, after: str, bindings
) -> EditChange:
    """A non-estimate follow-up to ``change`` that replaces ``before`` in ``body``."""
    return change.model_copy(
        update={
            "change_id": uuid4(),
            "start": body.index(before),
            "before": before,
            "after": after,
            "user_input_quote": after,
            "estimate": False,
            "gap_bindings": bindings,
        }
    )


async def test_an_accepted_estimate_keeps_its_gap_visible_until_confirmed(
    workspace,
) -> None:
    """CC-1239: a labelled estimate fills the marker but leaves a caveat gap.

    A later complete answer bound to that caveat gap replaces the estimate
    text (no marker is left) and resolves it.
    """
    estimated, change = await accept_estimate(workspace, ESTIMATE)
    [gap] = (await fixture_chapter(workspace)).gaps
    assert (gap.state, gap.version, gap.resolution.answer) == ("caveat", 2, ESTIMATE)

    def confirm(version: int) -> dict:
        binding = gap_binding(version=version, mode="confirm_estimate")
        return {
            "before": estimated,
            "after": estimated.replace(ESTIMATE, CONFIRMED),
            "changes": [
                confirmation(change, estimated, ESTIMATE, CONFIRMED, [binding])
            ],
        }

    # A confirmation bound to the superseded version is stale and changes nothing.
    assert await stale_gap_error(workspace, **confirm(1)) == "stale_gap"
    assert (await fixture_chapter(workspace)).gaps[0].state == "caveat"

    await resolve(workspace, **confirm(2))
    [gap] = (await fixture_chapter(workspace)).gaps
    assert (gap.state, gap.version) == ("resolved", 3)
    assert await resolution_answers(workspace) == sorted([ESTIMATE, CONFIRMED])


async def test_saving_answers_for_an_estimate_preserves_its_accepted_resolution(
    workspace,
) -> None:
    """CC-1239: answers saved to confirm an estimate never replace the estimate.

    The accepted estimate stays the gap's resolution while answers are saved
    and cleared at the caveat version; a complete confirmation then resolves it
    and clears the saved text.
    """
    estimated, change = await accept_estimate(workspace, ESTIMATE)
    draft = (await fixture_chapter(workspace)).body_markdown
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
        assert await save_answers(workspace, answer, expected_previous, version=2)
        chapter = await fixture_chapter(workspace)
        [gap] = chapter.gaps
        assert (gap.state, gap.version) == ("caveat", 2)
        assert gap.resolution.answer == ESTIMATE
        assert gap.answered_so_far == (answer or None)
        assert chapter.body_markdown == draft

    # Save the answers again so the complete confirmation starts with them saved.
    assert await save_answers(workspace, saved, version=2)
    binding = gap_binding(version=2, mode="confirm_estimate", saved=saved)
    await resolve(
        workspace,
        before=estimated,
        after=estimated.replace(ESTIMATE, CONFIRMED),
        changes=[confirmation(change, estimated, ESTIMATE, CONFIRMED, [binding])],
    )
    [gap] = (await fixture_chapter(workspace)).gaps
    assert (gap.state, gap.version) == ("resolved", 3)
    assert gap.resolution.answer == CONFIRMED
    assert gap.answered_so_far is None


async def caveat_with_estimate(workspace, copies: int) -> str:
    """Make the seeded gap a caveat whose estimate appears ``copies`` times; return the body."""
    body = "## Implementation\n\n" + "\n\n".join(
        f"Delivery relies on {ESTIMATE}" for _ in range(copies)
    )
    await update_fixture_gap(
        workspace,
        body=body,
        field_key="volunteer_count",
        question="Confirm the volunteer count.",
        status="caveat",
        version=2,
    )
    await add_rows(
        workspace,
        ConceptNoteGapResolution(
            gap_id=GAP_ID,
            action="answer",
            answer=ESTIMATE,
            gap_version=2,
            actor_user_id="owner",
            source_refs=[],
            idempotency_key=uuid4(),
        ),
    )
    return body


async def test_confirming_estimate_and_narrowing_related_marker_commits_both(
    workspace,
) -> None:
    """CC-1239: one acceptance confirms a caveat and narrows a related marker.

    The confirmed amount replaces the hedged estimate, and the open marker that
    asks to confirm the same amount keeps only its unanswered source question.
    An unrelated open marker is left as it was.
    """
    related_question = "Confirm the volunteer count and its source."
    related_marker = f"[Information needed: {related_question}]"
    source_question = "Confirm the source of the volunteer count."
    body = await caveat_with_estimate(workspace, copies=1)
    body += f"\n\n{related_marker}\n\n{BUDGET_MARKER}"
    await update_fixture_gap(workspace, body=body)
    related_gap, unrelated_gap = uuid4(), uuid4()
    await add_rows(
        workspace,
        gap_row(related_question, gap_id=related_gap, field_key="volunteer_source"),
        gap_row(BUDGET_QUESTION, gap_id=unrelated_gap, field_key="budget"),
    )
    confirmed = "150 volunteers"
    narrowed = (
        f"The City confirmed {confirmed}. [Information needed: {source_question}]"
    )
    changes = [
        gap_change(
            body,
            ESTIMATE,
            confirmed,
            group="volunteer_count",
            bindings=[gap_binding(version=2, mode="confirm_estimate")],
        ),
        gap_change(
            body,
            related_marker,
            narrowed,
            quote=confirmed,
            group="volunteer_source",
            bindings=[gap_binding(version=1, mode="narrow", gap_id=related_gap)],
        ),
    ]
    after_body = body.replace(ESTIMATE, confirmed).replace(related_marker, narrowed)
    await accept(workspace, before=body, after=after_body, changes=changes)

    after = await fixture_chapter(workspace)
    gaps = {gap.gap_id: gap for gap in after.gaps}
    assert (gaps[GAP_ID].state, gaps[GAP_ID].version) == ("resolved", 3)
    assert await resolution_answers(workspace) == sorted([confirmed, ESTIMATE])
    assert (gaps[related_gap].state, gaps[related_gap].version) == ("open", 2)
    assert gaps[related_gap].question == source_question
    assert (gaps[unrelated_gap].state, gaps[unrelated_gap].version) == ("open", 1)
    assert BUDGET_MARKER in after.body_markdown
    assert ESTIMATE not in after.body_markdown
    assert confirmed in after.body_markdown


def test_an_estimate_is_always_a_factual_change() -> None:
    with pytest.raises(ValueError, match="an estimate is a factual change"):
        gap_change(
            "old",
            "old",
            "about 2 million",
            kind="wording",
            group="amount",
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
    estimate = "an estimated 120 volunteers, the City's unconfirmed figure"
    estimated, change = await accept_estimate(
        workspace, estimate, after=f"Delivery relies on {estimate}."
    )
    # Saved answers on the duplicate never stand in for its accepted estimate.
    reply = "Only a partial reply, not the estimate."
    assert await save_answers(workspace, reply, version=2)
    confirmed = "150 volunteers, confirmed by the City"
    for old, new, state, bindings in (
        ("## Implementation", "## Delivery", "caveat", []),
        (
            estimate,
            confirmed,
            "resolved",
            [gap_binding(version=2, mode="confirm_estimate", saved=reply)],
        ),
    ):
        await resolve(
            workspace,
            before=estimated,
            after=estimated.replace(old, new),
            changes=[confirmation(change, estimated, old, new, bindings)],
        )
        assert (await fixture_chapter(workspace)).gaps[0].state == state


async def estimate_state(workspace) -> tuple:
    """Snapshot the revisions, gap version and status, and resolution events for the gap."""
    async with workspace._session_factory() as session:
        revisions = await session.scalars(
            select(ConceptNoteChapterRevision.revision_number).where(
                ConceptNoteChapterRevision.chapter_id == CHAPTER_ID
            )
        )
        resolutions = await session.scalars(
            select(ConceptNoteGapResolution.resolution_id).where(
                ConceptNoteGapResolution.gap_id == GAP_ID
            )
        )
        gap = await session.get(ConceptNoteGap, GAP_ID)
        return sorted(revisions), len(resolutions.all()), gap.version, gap.status


@pytest.mark.parametrize("copies", [3, 2])
async def test_estimate_confirmation_rejects_unbound_duplicate_occurrence_atomically(
    workspace, copies
) -> None:
    """CC-1239: an unbound edit cannot change one copy of a repeated estimate.

    The r1 and r2 transcripts repeated the estimate three and two times. Each
    copy is ambiguous, so the apply must fail with no revision, gap or
    resolution written.
    """
    body = await caveat_with_estimate(workspace, copies)
    state_before = await estimate_state(workspace)
    change = gap_change(
        body,
        ESTIMATE,
        "The City now estimates 130 volunteers, pending confirmation.",
        quote="130 volunteers",
        group="volunteers",
    )
    after_body = (
        body[: change.start] + change.after + body[change.start + len(ESTIMATE) :]
    )
    with pytest.raises(EditOperationError) as error:
        await accept(workspace, before=body, after=after_body, changes=[change])
    assert error.value.code == "stale_gap"
    assert await estimate_state(workspace) == state_before


def test_accepted_passages_strip_markers_and_keep_the_original_scope() -> None:
    """Progress keeps the first scope, marker-free passages and no duplicates."""
    gap = ConceptNoteGap(question="Who leads and when?", answer_progress=None)
    for previous_question, passage in (
        (
            "Who leads and when?",
            "Lincoln Park leads. [Information needed: When does it start?]",
        ),
        ("When does it start?", "Lincoln Park leads."),
        ("When does it start?", "The budget is set."),
    ):
        record_accepted_narrowing(
            gap, previous_question=previous_question, passage=passage
        )
    assert gap.answer_progress == {
        "original_question": "Who leads and when?",
        "accepted_passages": ["Lincoln Park leads.", "The budget is set."],
    }


async def test_narrowing_carries_saved_answers_to_the_new_version_without_creating_a_resolution(
    workspace,
) -> None:
    """An accepted narrowing moves saved answers to the new version, not a resolution."""
    assert await save_answers(workspace, LEAD_ANSWER)
    async with workspace._session_factory() as session, session.begin():
        gap = await session.get(ConceptNoteGap, GAP_ID, with_for_update=True)
        previous_question = gap.question
        gap.version = 2
        gap.question = BUDGET_QUESTION
        record_accepted_narrowing(
            gap, previous_question=previous_question, passage=LEAD_ANSWER
        )
        assert await carry_forward_saved_answer(session, gap=gap, previous_version=1)
    [narrowed] = (await fixture_chapter(workspace)).gaps
    assert (narrowed.gap_id, narrowed.state, narrowed.version) == (GAP_ID, "open", 2)
    assert narrowed.question == BUDGET_QUESTION
    assert narrowed.answered_so_far == LEAD_ANSWER
    assert narrowed.resolution is None
    assert narrowed.original_question == LEAD_QUESTION
    assert narrowed.accepted_passages == (LEAD_ANSWER,)

    async with workspace._session_factory() as session:
        non_partial = await session.scalar(
            select(ConceptNoteGapResolution.resolution_id).where(
                ConceptNoteGapResolution.gap_id == GAP_ID,
                ConceptNoteGapResolution.action != "partial_answer",
            )
        )
    assert non_partial is None
    # The stale form still holds no saved text, so its save is refused.
    assert not await save_answers(workspace, "A newer answer", version=2)


def test_redraft_resets_progress_only_when_gap_scope_changes_or_reopens() -> None:
    """A changed normalized question or a reopen starts a new specification."""
    progress = {
        "original_question": LEAD_QUESTION,
        "accepted_passages": ["Lincoln Park leads."],
    }

    def gap_with_progress(status: str = "open") -> ConceptNoteGap:
        gap = gap_row(
            LEAD_QUESTION, field_key="lead_partner", gap_id=GAP_ID, status=status
        )
        gap.version = 2
        gap.answer_progress = dict(progress)
        return gap

    def output(question: str, why_asking: str = "Needed for the chapter."):
        return ConceptNoteDraftGapOutput(
            field_key="lead_partner",
            question=question,
            why_asking=why_asking,
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
    _update_gap_from_output(new_scope, output(BUDGET_QUESTION))
    assert new_scope.answer_progress is None

    # Reopening a resolved row resets it; an open row keeps its lineage.
    session = MagicMock()
    reopened = gap_with_progress(status="resolved")
    _reconcile_evidence_gaps(
        session, None, [reopened], [output(LEAD_QUESTION)], [], set()
    )
    assert (reopened.status, reopened.answer_progress) == ("open", None)
    still_open = gap_with_progress()
    _reconcile_evidence_gaps(
        session, None, [still_open], [output(LEAD_QUESTION)], [], set()
    )
    assert still_open.answer_progress == progress


async def test_working_copy_keeps_gap_answer_progress_with_independent_identity(
    workspace,
) -> None:
    """A working copy carries gap progress as an independent copy, not a link."""
    progress = {"original_question": LEAD_QUESTION, "accepted_passages": [LEAD_ANSWER]}
    [source_before] = (await fixture_chapter(workspace)).gaps
    assert (source_before.original_question, source_before.accepted_passages) == (
        None,
        (),
    )
    await update_fixture_gap(workspace, answer_progress=progress)

    destination_id = uuid4()
    await workspace.copy_working_copy(
        source_run_id=RUN_ID, destination_run_id=destination_id
    )
    [source] = (await fixture_chapter(workspace)).gaps
    [copied] = (await workspace.list_chapters(run_id=destination_id))[0].gaps
    expected = (LEAD_QUESTION, (LEAD_ANSWER,))
    assert copied.gap_id != source.gap_id
    assert (copied.original_question, copied.accepted_passages) == expected
    assert (source.original_question, source.accepted_passages) == expected

    # Clearing the copy's progress does not change the source gap.
    async with workspace._session_factory() as session, session.begin():
        copied_row = await session.get(ConceptNoteGap, copied.gap_id)
        copied_row.answer_progress = None
    [source_after] = (await fixture_chapter(workspace)).gaps
    assert source_after.accepted_passages == expected[1]
