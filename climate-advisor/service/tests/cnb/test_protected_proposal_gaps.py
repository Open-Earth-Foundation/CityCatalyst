"""Real edit transactions retain generated gaps only for accepted chapter changes."""

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.cnb.concept_note_draft import ConceptNoteChapterDraftOutput
from app.models.cnb.concept_note_edits import EditApplyRequest
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
)
from app.models.document_workspace.contracts import DocumentExportRequest
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
    to_response,
)
from app.persistence.concept_notes.proposal_gaps import GENERATED_GAPS_KEY
from app.persistence.concept_notes.workspace import WorkspaceConflictError
from app.services.cnb.chapter_drafting import _build_state_response
from app.services.document_workspace.jobs import claim_job, run_update_job
from tests.cnb.test_document_workspace import (
    add_chapters,
    answer,
    fake_draft_service,
)
from tests.cnb.test_document_workspace import (
    workspace as workspace,  # noqa: PLC0414
)


async def create_protected_proposals(workspace, *, unanswered=False):
    """Run the real outbox writer against protected chapters with controlled prose."""
    service, run, factory = workspace
    await service.load(run)
    await add_chapters(factory, protected=True)
    async with factory() as session, session.begin():
        for chapter in await session.scalars(select(ConceptNoteChapter)):
            latest = await session.scalar(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.chapter_id == chapter.chapter_id
                )
            )
            latest.body_markdown += (
                "\n\nLiteral user addition. [Information needed: Requested amount?]"
            )
            if unanswered:
                latest.body_markdown += (
                    "\n\n[Information needed: Confirm project owner?]"
                )
                session.add(
                    ConceptNoteGap(
                        run_id=run.run_id,
                        chapter_id=chapter.chapter_id,
                        field_key="project_owner",
                        question="Confirm project owner?",
                        why_asking="Application requirement",
                        severity="critical",
                        status="open",
                    )
                )
            for field, question, status in [
                ("requested_amount", "Requested amount?", "open"),
                ("award_date", "Award date?", "resolved"),
            ]:
                session.add(
                    ConceptNoteGap(
                        run_id=run.run_id,
                        chapter_id=chapter.chapter_id,
                        field_key=field,
                        question=question,
                        why_asking="Application requirement",
                        severity="critical",
                        status=status,
                    )
                )
    await answer(service, run, 420000)
    draft = fake_draft_service(factory)

    async def generate(payload):
        return ConceptNoteChapterDraftOutput(
            body_markdown=(
                f"## {payload['chapter']['title']}\n\nLiteral user addition. "
                "Requested amount: 420000. "
                "[Information needed: Confirm municipal cofinancing?]"
            ),
            missing_information=[
                {
                    "field_key": "municipal_cofinancing",
                    "question": "Confirm municipal cofinancing?",
                    "why_asking": "The confirmed grant does not specify the municipal contribution.",
                    "severity": "critical",
                }
            ],
        )

    draft._generate_chapter = generate
    claimed = await claim_job(service)
    assert claimed is not None
    await run_update_job(
        service, *claimed, draft_service=draft, ca_session_factory=factory
    )
    async with factory() as session:
        proposals = list(await session.scalars(select(ConceptNoteEditProposal)))
        assert len(proposals) == 2
        assert not list(
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.field_key == "municipal_cofinancing"
                )
            )
        )
    for proposal in proposals:
        assert GENERATED_GAPS_KEY in proposal.scope
        assert GENERATED_GAPS_KEY not in to_response(proposal).scope.model_dump()
    return proposals


async def apply_proposal(factory, run, proposal, selected=None):
    return await ConceptNoteEditRepository(factory).apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=EditApplyRequest(
            idempotency_key=uuid4(),
            expected_revisions={
                UUID(key): value for key, value in proposal.base_revisions.items()
            },
            selected_change_ids=selected,
        ),
    )


async def test_accepted_protected_update_materializes_gap_and_blocks_ready_final(
    workspace, monkeypatch
):
    service, run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    for proposal in proposals:
        await apply_proposal(factory, run, proposal)
    chapters = await fake_draft_service(factory)._workspace.list_chapters(
        run_id=run.run_id
    )
    for chapter in chapters:
        assert "Literal user addition." in chapter.body_markdown
        assert chapter.status == "needs_review"
        states = {gap.field_key: gap.state for gap in chapter.gaps}
        assert states == {
            "requested_amount": "resolved",
            "award_date": "resolved",
            "municipal_cofinancing": "open",
        }
        with pytest.raises(WorkspaceConflictError):
            await fake_draft_service(factory)._workspace.confirm_chapter(
                run_id=run.run_id,
                chapter_id=chapter.chapter_id,
                expected_revision=chapter.revision_number,
                idempotency_key=uuid4(),
                user_id="owner",
            )
    response = _build_state_response(run_id=run.run_id, progress={}, chapters=chapters)
    assert all(chapter.open_gap_count == 1 for chapter in response.chapters)
    view = await service.load(run)
    assert not view.export_eligibility.final
    with pytest.raises(HTTPException) as error:
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    assert error.value.status_code == 409


async def test_rejected_protected_update_has_no_gap_or_revision_effect(workspace):
    _service, run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    for proposal in proposals:
        await ConceptNoteEditRepository(factory).reject(
            run_id=run.run_id,
            user_id="owner",
            proposal_id=proposal.proposal_id,
        )
    async with factory() as session:
        assert not list(
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.field_key == "municipal_cofinancing"
                )
            )
        )
        assert all(
            revision.revision_number == 1
            for revision in await session.scalars(select(ConceptNoteChapterRevision))
        )
        assert all(
            gap.status == "resolved"
            for gap in await session.scalars(
                select(ConceptNoteGap).where(ConceptNoteGap.field_key == "award_date")
            )
        )


async def test_partial_multichapter_acceptance_only_materializes_accepted_chapter(
    workspace, monkeypatch
):
    _service, run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    # Combine the actual worker-created chapter changes into one review, with
    # independent consistency groups so the normal API permits partial decisions.
    async with factory() as session, session.begin():
        first = await session.get(ConceptNoteEditProposal, proposals[0].proposal_id)
        second = await session.get(ConceptNoteEditProposal, proposals[1].proposal_id)
        first.base_revisions = {**first.base_revisions, **second.base_revisions}
        first.changes = [
            dict(change, group_id=f"chapter-{index}")
            for index, change in enumerate([*first.changes, *second.changes])
        ]
        first.scope = {
            **first.scope,
            GENERATED_GAPS_KEY: {
                **first.scope[GENERATED_GAPS_KEY],
                **second.scope[GENERATED_GAPS_KEY],
            },
        }
        proposal = first
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    result = await apply_proposal(
        factory, run, proposal, [UUID(proposal.changes[0]["change_id"])]
    )
    assert result.status == "partially_applied"
    accepted_chapter = UUID(proposal.changes[0]["chapter_id"])
    async with factory() as session:
        new_gaps = list(
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.field_key == "municipal_cofinancing"
                )
            )
        )
        assert len(new_gaps) == 1 and new_gaps[0].chapter_id == accepted_chapter
        old = list(
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.field_key == "requested_amount"
                )
            )
        )
        assert {gap.chapter_id: gap.status for gap in old} == {
            UUID(change["chapter_id"]): "resolved"
            if UUID(change["chapter_id"]) == accepted_chapter
            else "open"
            for change in proposal.changes
        }


async def test_acceptance_preserves_existing_unanswered_marker_and_gap(
    workspace, monkeypatch
):
    _service, run, factory = workspace
    proposals = await create_protected_proposals(workspace, unanswered=True)
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    for proposal in proposals:
        await apply_proposal(factory, run, proposal)
    chapters = await fake_draft_service(factory)._workspace.list_chapters(
        run_id=run.run_id
    )
    for chapter in chapters:
        assert "[Information needed: Confirm project owner?]" in chapter.body_markdown
        assert {gap.field_key for gap in chapter.gaps if gap.state == "open"} == {
            "municipal_cofinancing",
            "project_owner",
        }


async def test_missing_accepted_chapter_metadata_rolls_back_gap_resolution_and_text(
    workspace, monkeypatch
):
    _service, run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    async with factory() as session, session.begin():
        proposal = await session.get(ConceptNoteEditProposal, proposals[0].proposal_id)
        proposal.scope = {**proposal.scope, GENERATED_GAPS_KEY: {}}
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    with pytest.raises(EditOperationError, match="generated information gaps"):
        await apply_proposal(factory, run, proposal)
    async with factory() as session:
        assert all(
            revision.revision_number == 1
            for revision in await session.scalars(select(ConceptNoteChapterRevision))
        )
        assert all(
            gap.status == "open"
            for gap in await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.field_key == "requested_amount"
                )
            )
        )
        assert not list(
            await session.scalars(
                select(ConceptNoteGap).where(
                    ConceptNoteGap.field_key == "municipal_cofinancing"
                )
            )
        )
