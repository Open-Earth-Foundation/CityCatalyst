from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from app.db.session import get_session
from app.models.db.concept_note import ConceptNoteRun
from app.routes import concept_note_edits, concept_note_runs
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditChange,
    EditProposalRequest,
    GapEditBinding,
)
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
    append_revision,
)
from app.persistence.concept_notes.gaps import save_partial_answer
from app.persistence.concept_notes.workspace import WorkspaceConflictError
from app.services.cnb.chapter_drafting import (
    ConceptNoteChapterDraftService,
    get_chapter_draft_service,
)
from app.services.concept_note_runs import ConceptNoteRunService
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
            # This single-connection SQLite fixture already serializes writes.
            raw = await (await session.connection()).get_raw_connection()
            await raw.driver_connection.create_function(
                "pg_advisory_xact_lock", 1, lambda _: None
            )
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
    before = await fixture_chapter(workspace)
    answer = "Lincoln Park Neighborhood Council will lead delivery."
    await apply_changes(
        workspace,
        gap_change(
            before.body_markdown, LEAD_MARKER, answer, bindings=[gap_binding(version=1)]
        ),
    )
    body = "## Implementation\n\nLincoln Park Neighborhood Council will lead delivery."
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
    bindings: tuple[GapEditBinding, ...] | list[GapEditBinding] = (),
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
) -> ConceptNoteGap:
    return ConceptNoteGap(
        gap_id=gap_id or uuid4(),
        run_id=RUN_ID,
        chapter_id=CHAPTER_ID,
        field_key=field_key,
        severity="critical",
        question=question,
        why_asking="Needed for the chapter.",
        suggestions=[],
        source_refs=[],
        status="open",
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


async def apply_changes(
    workspace, *changes: EditChange, selected: list[UUID] | None = None
):
    """Submit and accept a reviewed proposal through the repository used by the route."""
    repo = ConceptNoteEditRepository(workspace._session_factory)
    actor = {"run_id": RUN_ID, "user_id": "owner"}
    request = EditProposalRequest(
        instruction="Apply the reviewed edits.", idempotency_key=uuid4()
    )
    proposal, _ = await repo.start(**actor, request=request)
    revisions = {CHAPTER_ID: changes[0].base_revision}
    await repo.finish(
        **actor,
        proposal_id=proposal.proposal_id,
        base_revisions=revisions,
        changes=list(changes),
    )
    return await repo.apply(
        **actor,
        proposal_id=proposal.proposal_id,
        request=EditApplyRequest(
            idempotency_key=uuid4(),
            expected_revisions=revisions,
            selected_change_ids=selected,
        ),
    )


async def save_answers(
    workspace,
    answer: str,
    expected_previous: str | None = None,
    *,
    version: int = 1,
) -> bool:
    async with workspace._session_factory() as session, session.begin():
        return await save_partial_answer(
            session,
            run_id=RUN_ID,
            gap_id=GAP_ID,
            gap_version=version,
            answer=answer,
            expected_previous=expected_previous,
            user_id="owner",
        )


async def resolution_answers(workspace) -> list[str | None]:
    async with workspace._session_factory() as session:
        answers = await session.scalars(
            select(ConceptNoteGapResolution.answer)
            .where(ConceptNoteGapResolution.gap_id == GAP_ID)
            .order_by(ConceptNoteGapResolution.answer)
        )
        return list(answers)


async def fixture_chapter(workspace):
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    return chapter


async def test_accepting_partial_then_full_uses_same_gap_and_exact_remaining_marker(
    workspace,
) -> None:
    """One gap moves v1 -> v2 (narrowed) -> v3 (filled) with no orphan marker."""
    saved = "Lincoln Park Neighborhood Council"
    assert await save_answers(workspace, saved)
    body = (await fixture_chapter(workspace)).body_markdown
    narrowing = f"{LEAD_ANSWER} {BUDGET_MARKER}"
    await apply_changes(
        workspace,
        gap_change(
            body,
            LEAD_MARKER,
            narrowing,
            bindings=[gap_binding(version=1, mode="narrow", saved=saved)],
        ),
    )
    narrowed = await fixture_chapter(workspace)
    [gap] = narrowed.gaps
    assert (gap.gap_id, gap.state, gap.version, gap.question) == (
        GAP_ID,
        "open",
        2,
        BUDGET_QUESTION,
    )
    assert gap.original_question == LEAD_QUESTION
    assert gap.accepted_passages == (LEAD_ANSWER,)
    assert gap.answered_so_far == saved
    assert gap.resolution is None
    assert narrowed.body_markdown.count("[Information needed:") == 1

    body = narrowed.body_markdown
    await apply_changes(
        workspace,
        gap_change(
            body,
            BUDGET_MARKER,
            "EUR 10 million",
            base_revision=2,
            bindings=[gap_binding(version=2, saved=saved)],
        ),
    )
    final = await fixture_chapter(workspace)
    [gap] = final.gaps
    assert (gap.gap_id, gap.state, gap.version) == (GAP_ID, "resolved", 3)
    assert gap.answered_so_far is None
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
    for bindings in (
        [],  # Legacy proposals without a binding must be reviewed again.
        [gap_binding(version=1, mode="narrow", saved="Other")],
        [gap_binding(version=2, mode="narrow", saved=saved)],
    ):
        with pytest.raises(EditOperationError) as error:
            await apply_changes(
                workspace, gap_change(body, LEAD_MARKER, narrowing, bindings=bindings)
            )
        assert error.value.code == "stale_gap"
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
    other = gap_row(SIGNATORY_QUESTION, field_key="signatory")
    await add_rows(workspace, other)
    body = f"{(await fixture_chapter(workspace)).body_markdown}\n\n{UNRECORDED}"
    await update_fixture_gap(workspace, body=body)
    lead = gap_change(body, LEAD_MARKER, LEAD_ANSWER, bindings=[gap_binding(version=1)])
    signatory = gap_change(
        body,
        UNRECORDED,
        "The Mayor signs.",
        group="signatory",
        bindings=[gap_binding(version=1, gap_id=other.gap_id)],
    )
    result = await apply_changes(workspace, lead, signatory, selected=[lead.change_id])
    assert result.status == "partially_applied"
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
    await update_fixture_gap(workspace, body=body)
    await apply_changes(workspace, first, second)
    after = await fixture_chapter(workspace)
    [gap] = after.gaps
    assert (gap.state, gap.version) == ("resolved", 2)
    assert "[Information needed:" not in after.body_markdown
    assert await resolution_answers(workspace) == [LEAD_ANSWER]


async def test_gap_answers_endpoint_saves_for_teammates_and_rejects_stale_forms(
    workspace, monkeypatch
):
    app = FastAPI()
    app.include_router(concept_note_runs.router, prefix="/v1")
    app.dependency_overrides[get_session] = lambda: None
    authorize = AsyncMock(side_effect=HTTPException(status_code=403))
    monkeypatch.setattr(
        concept_note_runs.ConceptNoteRunService, "get_authorized_run", authorize
    )
    monkeypatch.setattr(
        concept_note_runs,
        "get_cnb_reference_session_factory",
        lambda: workspace._session_factory,
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:

        async def post(answer, previous=None, *, version=1, run_id=RUN_ID):
            return await client.post(
                f"/v1/concept-notes/{run_id}/gaps/{GAP_ID}/answers",
                params={"user_id": "teammate"},
                headers={"Authorization": "Bearer test"},
                json={
                    "gap_version": version,
                    "answers": answer,
                    "expected_previous": previous,
                },
            )

        assert (await post("Forbidden")).status_code == 403
        authorize.assert_awaited_once_with(
            run_id=RUN_ID, requested_user_id="teammate", authorization="Bearer test"
        )
        assert await resolution_answers(workspace) == []
        authorize.side_effect = None
        assert (await post("Foreign", run_id=uuid4())).status_code == 409
        assert (await post("Stale", version=2)).status_code == 409
        saved = await post(" Loan ")
        assert (saved.status_code, saved.content) == (204, b"")
        assert (await post("Grant")).status_code == 409
        assert (await post("")).status_code == 409
        chapter = await fixture_chapter(workspace)
        assert (
            chapter.revision_number,
            chapter.gaps[0].version,
            chapter.gaps[0].answered_so_far,
        ) == (1, 1, "Loan")
        assert await resolution_answers(workspace) == ["Loan"]
        assert (await post("Grant", " Loan ")).status_code == 204
        assert (await post("", "Grant")).status_code == 204
        assert (await fixture_chapter(workspace)).gaps[0].answered_so_far is None


async def test_collaborator_preview_shows_saved_answers_and_applied_proposals(
    workspace, monkeypatch
):
    """A city collaborator reads the owner's note without any write happening."""
    app = FastAPI()
    app.include_router(concept_note_edits.router, prefix="/v1")
    app.dependency_overrides[get_session] = lambda: None
    run = ConceptNoteRun(
        run_id=RUN_ID, user_id="owner", name="Lincoln Park", city_id=str(uuid4())
    )
    viewable = AsyncMock(return_value=run)
    monkeypatch.setattr(ConceptNoteRunService, "get_city_viewable_run", viewable)
    sessions = workspace._session_factory
    app.dependency_overrides[get_chapter_draft_service] = (
        lambda: ConceptNoteChapterDraftService(sessions, cnb_session_factory=sessions)
    )
    app.dependency_overrides[concept_note_edits.edit_service] = lambda: (
        SimpleNamespace(repository=ConceptNoteEditRepository(sessions))
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:

        async def preview():
            response = await client.get(
                f"/v1/concept-notes/{RUN_ID}/preview",
                params={"user_id": "teammate", "city_id": run.city_id},
                headers={"Authorization": "Bearer test"},
            )
            assert response.status_code == 200
            return response.json()

        assert await save_answers(workspace, "Loan")
        before = await preview()
        assert before["draft"]["chapters"][0]["gaps"][0]["answered_so_far"] == "Loan"
        assert before["proposals"] == []
        change = gap_change(
            (await fixture_chapter(workspace)).body_markdown,
            LEAD_MARKER,
            LEAD_ANSWER,
            bindings=[gap_binding(version=1, saved="Loan")],
        )
        await apply_changes(workspace, change)
        [proposal] = (await preview())["proposals"]
    assert viewable.await_args.kwargs == {
        "run_id": RUN_ID,
        "city_id": UUID(run.city_id),
        "requested_user_id": "teammate",
        "authorization": "Bearer test",
    }
    assert proposal["status"] == "applied"
    assert proposal["result"]["accepted_change_ids"] == [str(change.change_id)]
    assert (proposal["changes"][0]["before"], proposal["changes"][0]["after"]) == (
        LEAD_MARKER,
        LEAD_ANSWER,
    )


async def test_estimate_stays_visible_until_its_saved_confirmation_is_accepted(
    workspace,
):
    body = f"## Implementation\n\n{VOLUNTEER_MARKER}"
    await update_fixture_gap(
        workspace, body=body, question="Confirm the volunteer count."
    )
    await apply_changes(
        workspace,
        gap_change(
            body,
            VOLUNTEER_MARKER,
            ESTIMATE,
            estimate=True,
            bindings=[gap_binding(version=1)],
        ),
    )
    chapter = await fixture_chapter(workspace)
    assert chapter.body_markdown == f"## Implementation\n\n{ESTIMATE}"
    [gap] = chapter.gaps
    assert (gap.state, gap.version, gap.resolution.answer) == ("caveat", 2, ESTIMATE)
    # SQLite timestamps non-partial resolutions to the second. Give the earlier
    # estimate its own timestamp so the public projection orders it before confirmation.
    async with workspace._session_factory() as session, session.begin():
        await session.execute(
            update(ConceptNoteGapResolution)
            .where(ConceptNoteGapResolution.gap_id == GAP_ID)
            .values(created_at=datetime(2020, 1, 1, tzinfo=UTC))
        )
    saved = "150 volunteers."
    for answer, previous in [(saved, None), ("", saved), (saved, None)]:
        assert await save_answers(workspace, answer, previous, version=2)
        current = await fixture_chapter(workspace)
        assert current.body_markdown == chapter.body_markdown
        assert current.gaps[0].resolution.answer == ESTIMATE
        assert current.gaps[0].answered_so_far == (answer or None)

    def confirmation(version):
        return gap_change(
            chapter.body_markdown,
            ESTIMATE,
            CONFIRMED,
            base_revision=2,
            bindings=[
                gap_binding(version=version, mode="confirm_estimate", saved=saved)
            ],
        )

    with pytest.raises(EditOperationError) as error:
        await apply_changes(workspace, confirmation(1))
    assert error.value.code == "stale_gap"
    await apply_changes(workspace, confirmation(2))
    current = await fixture_chapter(workspace)
    [gap] = current.gaps
    assert current.body_markdown == f"## Implementation\n\n{CONFIRMED}"
    assert (gap.state, gap.version, gap.answered_so_far) == ("resolved", 3, None)
    assert gap.resolution.answer == CONFIRMED


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
    await apply_changes(workspace, *changes)

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


async def test_only_a_reviewed_edit_to_the_estimate_resolves_its_caveat(workspace):
    body = await caveat_with_estimate(workspace, copies=1)
    assert await save_answers(workspace, "Partial reply", version=2)
    await apply_changes(
        workspace, gap_change(body, "Implementation", "Delivery", kind="wording")
    )
    chapter = await fixture_chapter(workspace)
    [gap] = chapter.gaps
    assert chapter.body_markdown.startswith("## Delivery")
    assert (gap.state, gap.resolution.answer, gap.answered_so_far) == (
        "caveat",
        ESTIMATE,
        "Partial reply",
    )

    # Only part of the accepted estimate is the anchor. The saved reply is separate.
    binding = gap_binding(version=2, mode="confirm_estimate", saved="Partial reply")
    await apply_changes(
        workspace,
        gap_change(
            chapter.body_markdown,
            "estimates 120 volunteers, pending confirmation",
            "confirmed 150 volunteers",
            base_revision=2,
            bindings=[binding],
        ),
    )
    current = await fixture_chapter(workspace)
    assert current.gaps[0].state == "resolved"
    assert "150 volunteers" in current.body_markdown


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
    before = await fixture_chapter(workspace)
    answers = await resolution_answers(workspace)
    change = gap_change(
        body,
        ESTIMATE,
        "The City now estimates 130 volunteers, pending confirmation.",
        quote="130 volunteers",
        group="volunteers",
    )
    with pytest.raises(EditOperationError) as error:
        await apply_changes(workspace, change)
    assert error.value.code == "stale_gap"
    assert await fixture_chapter(workspace) == before
    assert await resolution_answers(workspace) == answers


@pytest.mark.parametrize(
    ("state", "question", "expected_passages"),
    [
        ("open", "confirm the lead partner", (LEAD_ANSWER,)),
        ("open", BUDGET_QUESTION, ()),
        ("resolved", LEAD_QUESTION, ()),
    ],
)
async def test_revalidation_keeps_progress_only_for_the_same_open_question(
    workspace, state, question, expected_passages
) -> None:
    await update_fixture_gap(
        workspace,
        status=state,
        answer_progress={
            "original_question": LEAD_QUESTION,
            "accepted_passages": [LEAD_ANSWER],
        },
    )
    await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=f"Implementation. [Information needed: {question}]",
            missing_information=[
                ConceptNoteDraftGapOutput(
                    field_key="lead_partner",
                    question=question,
                    why_asking="The funder needs confirmation.",
                    severity="critical",
                )
            ],
        ),
        source_refs=["Implementation plan"],
        answered_gap_ids=set(),
    )
    [gap] = (await fixture_chapter(workspace)).gaps
    assert (gap.gap_id, gap.state, gap.question) == (GAP_ID, "open", question)
    assert gap.accepted_passages == expected_passages
    assert gap.original_question == (LEAD_QUESTION if expected_passages else None)


@pytest.mark.parametrize(
    ("saves", "state", "question", "carried"),
    [
        # A new cited suggestion for the same question keeps the saved answers.
        (["Loan"], "open", "confirm the lead partner", "Loan"),
        (["Loan"], "open", BUDGET_QUESTION, None),
        (["Loan"], "resolved", LEAD_QUESTION, None),
        (["Loan", ""], "open", LEAD_QUESTION, None),
    ],
)
async def test_revalidation_carries_saved_answers_only_for_the_same_open_question(
    workspace, saves, state, question, carried
) -> None:
    previous = None
    for answer in saves:
        assert await save_answers(workspace, answer, previous)
        previous = answer
    await update_fixture_gap(workspace, status=state)
    await workspace.save_revalidated_chapter(
        chapter_id=CHAPTER_ID,
        expected_revision_number=1,
        generated=ConceptNoteChapterDraftOutput(
            body_markdown=f"Implementation. [Information needed: {question}]",
            missing_information=[
                ConceptNoteDraftGapOutput(
                    field_key="lead_partner",
                    question=question,
                    why_asking="The funder needs confirmation.",
                    severity="critical",
                    suggestions=[{"value": "Loan", "source_refs": ["memo.pdf"]}],
                )
            ],
        ),
        source_refs=["memo.pdf"],
        answered_gap_ids=set(),
    )
    [gap] = (await fixture_chapter(workspace)).gaps
    assert (gap.version, gap.answered_so_far) == (2, carried)
    # The open card from before the refresh still cannot overwrite the answers.
    assert not await save_answers(workspace, "Grant", previous, version=1)
    if carried:
        assert await save_answers(workspace, "Loan, Grant", carried, version=2)
        [gap] = (await fixture_chapter(workspace)).gaps
        assert gap.answered_so_far == "Loan, Grant"


async def test_working_copy_keeps_each_saved_answer_version(workspace) -> None:
    """A copy reads its own saved answers, and changing them leaves the source."""
    assert await save_answers(workspace, "Loan")
    destination_id = uuid4()
    await workspace.copy_working_copy(
        source_run_id=RUN_ID, destination_run_id=destination_id
    )
    [copied] = (await workspace.list_chapters(run_id=destination_id))[0].gaps
    assert copied.answered_so_far == "Loan"

    for answer, previous in (("Grant", "Loan"), ("", "Grant")):
        async with workspace._session_factory() as session, session.begin():
            assert await save_partial_answer(
                session,
                run_id=destination_id,
                gap_id=copied.gap_id,
                gap_version=copied.version,
                answer=answer,
                expected_previous=previous,
                user_id="owner",
            )
        [source] = (await fixture_chapter(workspace)).gaps
        assert source.answered_so_far == "Loan"
    [copied] = (await workspace.list_chapters(run_id=destination_id))[0].gaps
    assert copied.answered_so_far is None


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
