from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditChange,
    EditProposalRequest,
    EditScope,
)
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapterRevision,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
    replace_anchors,
)
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from sqlalchemy import select
from tests.cnb.edit_helpers import (
    BODY,
    CHAPTER_ID,
    RUN_ID,
    seed_chapter,
)
from tests.cnb.edit_helpers import (
    edit_database as edit_database,  # noqa: PLC0414
)


def wording_change(**overrides) -> EditChange:
    values = {
        "change_id": uuid4(),
        "chapter_id": CHAPTER_ID,
        "chapter_title": "Summary",
        "base_revision": 1,
        "start": BODY.index("builds parks"),
        "before": "builds parks",
        "after": "creates greener parks",
        "kind": "wording",
        "group_id": "clarity",
    }
    return EditChange(**{**values, **overrides})


async def proposed(repository: ConceptNoteEditRepository, **overrides):
    request = EditProposalRequest(
        instruction="Make the parks wording clearer",
        idempotency_key=uuid4(),
        scope=EditScope(focused_chapter_id=CHAPTER_ID),
    )
    started, created = await repository.start(
        run_id=RUN_ID, user_id="owner", request=request
    )
    assert created
    return await repository.finish(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=started.proposal_id,
        base_revisions={CHAPTER_ID: 1},
        changes=[wording_change(**overrides)],
    )


def acceptance() -> EditApplyRequest:
    return EditApplyRequest(idempotency_key=uuid4(), expected_revisions={CHAPTER_ID: 1})


async def test_single_chapter_apply_is_explicit_atomic_and_idempotent(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(repository)
    workspace = ConceptNoteWorkspaceRepository(edit_database)
    assert (await workspace.list_chapters(run_id=RUN_ID))[0].body_markdown == BODY
    request = acceptance()
    result = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=request,
    )
    replay = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=request,
    )
    assert replay == result
    assert result.status == "applied" and result.result.revisions == {CHAPTER_ID: 2}
    [chapter] = await workspace.list_chapters(run_id=RUN_ID)
    assert chapter.body_markdown == BODY.replace(
        "builds parks", "creates greener parks"
    )
    assert chapter.revision_number == 2
    with pytest.raises(EditOperationError, match="different acceptance"):
        await repository.apply(
            run_id=RUN_ID,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=request.model_copy(update={"expected_revisions": {CHAPTER_ID: 2}}),
        )


async def test_apply_marker_fill_resolves_matching_structured_gap(
    edit_database,
) -> None:
    marker = "[Information needed: Confirm the lead partner.]"
    replacement = "The lead partner is the City Transport Authority."
    await seed_chapter(edit_database, body=f"## Summary\n\n{marker}")
    gap_id = uuid4()
    async with edit_database() as session, session.begin():
        session.add(
            ConceptNoteGap(
                gap_id=gap_id,
                run_id=RUN_ID,
                chapter_id=CHAPTER_ID,
                field_key="lead_partner",
                severity="critical",
                question="Confirm the lead partner.",
                why_asking="Required for delivery accountability.",
                suggestions=[],
                source_refs=[],
                status="open",
            )
        )
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(
        repository,
        start=len("## Summary\n\n"),
        before=marker,
        after=replacement,
        kind="factual",
        source_refs=["investment-plan.pdf"],
    )

    result = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=acceptance(),
    )

    assert result.status == "applied"
    async with edit_database() as session:
        gap = await session.get(ConceptNoteGap, gap_id)
        resolution = await session.scalar(
            select(ConceptNoteGapResolution).where(
                ConceptNoteGapResolution.gap_id == gap_id
            )
        )
    assert gap is not None and gap.status == "resolved" and gap.version == 2
    assert resolution is not None
    assert resolution.answer == replacement
    assert resolution.source_refs == ["investment-plan.pdf"]


async def test_rejection_and_late_planner_result_never_write_draft(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(repository)
    rejected = await repository.reject(
        run_id=RUN_ID, user_id="owner", proposal_id=proposal.proposal_id
    )
    assert rejected == await repository.reject(
        run_id=RUN_ID, user_id="owner", proposal_id=proposal.proposal_id
    )
    late = await repository.finish(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        base_revisions={CHAPTER_ID: 1},
        changes=[wording_change()],
    )
    assert late.status == "rejected"
    with pytest.raises(EditOperationError, match="no longer awaiting"):
        await repository.apply(
            run_id=RUN_ID,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=acceptance(),
        )
    [chapter] = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert chapter.body_markdown == BODY and chapter.revision_number == 1


async def test_stale_base_is_durable_and_preserves_newer_text(edit_database) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(repository)
    async with edit_database() as session, session.begin():
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=CHAPTER_ID,
                revision_number=2,
                author_type="user",
                change_type="edit_text",
                body_markdown="Newer work",
                patch_summary={},
            )
        )
    with pytest.raises(EditOperationError) as error:
        await repository.apply(
            run_id=RUN_ID,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=acceptance(),
        )
    assert error.value.code == "stale_base"
    assert (
        await repository.get(
            run_id=RUN_ID, user_id="owner", proposal_id=proposal.proposal_id
        )
    ).status == "stale"
    [chapter] = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert chapter.body_markdown == "Newer work" and chapter.revision_number == 2


async def test_rejected_anchor_rolls_back_proposal_and_revision(edit_database) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(repository, before="not the actual base")
    with pytest.raises(EditOperationError) as error:
        await repository.apply(
            run_id=RUN_ID,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=acceptance(),
        )
    assert error.value.code == "invalid_anchor"
    assert (
        await repository.get(
            run_id=RUN_ID, user_id="owner", proposal_id=proposal.proposal_id
        )
    ).status == "proposed"
    async with edit_database() as session:
        assert (
            len((await session.scalars(select(ConceptNoteChapterRevision))).all()) == 1
        )


async def test_owner_and_run_binding_apply_to_read_list_and_reject(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(repository)
    assert await repository.list(run_id=RUN_ID, user_id="other-user") == []
    for run_id, user_id in [(uuid4(), "owner"), (RUN_ID, "other-user")]:
        with pytest.raises(EditOperationError) as error:
            await repository.get(
                run_id=run_id, user_id=user_id, proposal_id=proposal.proposal_id
            )
        assert error.value.status_code == 404
        with pytest.raises(EditOperationError):
            await repository.reject(
                run_id=run_id, user_id=user_id, proposal_id=proposal.proposal_id
            )


async def test_wording_acceptance_preserves_exact_ready_confirmation(
    edit_database,
) -> None:
    await seed_chapter(edit_database, ready=True)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(repository)
    await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=acceptance(),
    )
    [chapter] = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert chapter.status == "ready"
    assert chapter.confirmed_revision_number == 2
    assert chapter.proposed_revision_number is None


async def test_accepted_factual_edit_is_current_text_not_a_second_pending_proposal(
    edit_database,
) -> None:
    await seed_chapter(edit_database, ready=True)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await proposed(
        repository,
        start=BODY.index("EUR 10 million"),
        before="EUR 10 million",
        after="EUR 12 million",
        kind="factual",
        user_input_quote="The budget is EUR 12 million.",
    )
    await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=acceptance(),
    )
    [chapter] = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert (
        chapter.status == "draft"
    )  # Publication readiness is separate from saving an edit.
    assert chapter.confirmed_revision_number == 1
    assert chapter.revision_number == 2
    assert "EUR 12 million" in chapter.body_markdown
    assert chapter.proposed_revision_number is None


async def test_simultaneous_creation_replays_one_record_and_rejects_key_reuse(
    edit_database,
) -> None:
    repository = ConceptNoteEditRepository(edit_database)
    request = EditProposalRequest(
        instruction="Make wording clear", idempotency_key=uuid4()
    )
    results = await asyncio.gather(
        *(
            repository.start(run_id=RUN_ID, user_id="owner", request=request)
            for _ in range(2)
        )
    )
    assert sum(created for _, created in results) == 1
    assert results[0][0].proposal_id == results[1][0].proposal_id
    with pytest.raises(EditOperationError) as error:
        await repository.start(
            run_id=RUN_ID,
            user_id="owner",
            request=request.model_copy(update={"instruction": "Another request"}),
        )
    assert error.value.code == "idempotency_key_reused"


async def test_two_single_chapter_writers_cannot_overwrite_each_other(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    first, second = await proposed(repository), await proposed(repository)
    results = await asyncio.gather(
        *(
            repository.apply(
                run_id=RUN_ID,
                user_id="owner",
                proposal_id=p.proposal_id,
                request=acceptance(),
            )
            for p in [first, second]
        ),
        return_exceptions=True,
    )
    assert sum(isinstance(result, EditOperationError) for result in results) == 1
    states = await asyncio.gather(
        *(
            repository.get(run_id=RUN_ID, user_id="owner", proposal_id=p.proposal_id)
            for p in [first, second]
        )
    )
    assert sorted(state.status for state in states) == ["applied", "stale"]


def test_overlapping_anchors_and_empty_or_oversize_output_are_rejected() -> None:
    with pytest.raises(EditOperationError, match="passage"):
        replace_anchors(BODY, [wording_change(), wording_change()])
    with pytest.raises(EditOperationError, match="content limit"):
        replace_anchors("a", [wording_change(start=0, before="a", after="")])
    with pytest.raises(EditOperationError, match="content limit"):
        replace_anchors("ab", [wording_change(start=0, before="a", after="x" * 50_000)])


async def test_reload_does_not_hide_an_older_pending_proposal_behind_recent_history(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    pending = await proposed(repository)
    async with edit_database() as session, session.begin():
        row = await session.get(ConceptNoteEditProposal, pending.proposal_id)
        row.created_at = datetime.now(UTC) - timedelta(days=1)
        session.add_all(
            [
                ConceptNoteEditProposal(
                    proposal_id=uuid4(),
                    run_id=RUN_ID,
                    actor_user_id="owner",
                    idempotency_key=uuid4(),
                    request_fingerprint="a" * 64,
                    instruction="Completed question",
                    scope={"kind": "auto"},
                    status="rejected",
                )
                for _ in range(101)
            ]
        )
    restored = await repository.list(run_id=RUN_ID, user_id="owner")
    assert len(restored) == 101
    assert any(
        proposal.proposal_id == pending.proposal_id and proposal.status == "proposed"
        for proposal in restored
    )
