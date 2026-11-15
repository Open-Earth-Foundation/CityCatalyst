"""Explicit Sync restores lost question metadata without inventing source facts."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.cnb.concept_note_edits import (
    DraftReplacement,
    EditApplyRequest,
    EditChange,
    EditProposalRequest,
)
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
)
from app.models.document_workspace.contracts import (
    DocumentExportRequest,
    DocumentSetupRequest,
)
from app.persistence.concept_notes.edits import ConceptNoteEditRepository
from app.persistence.concept_notes.source_provenance import revision_provenance
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.cnb.edit_session import DraftEditSession
from app.services.document_workspace.service import DocumentWorkspaceService
from tests.cnb.test_document_workspace import add_chapters
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414
from tests.cnb.test_document_workspace_source_sync import create_source_tables

QUESTION = "Confirm the municipal co-financing amount in the revised 16 November 2026 financing decision for the Cool Corridors demonstration."
MARKER = f"[Information needed: {QUESTION}]"


async def prepare_orphan(workspace, *, existing_status=None, marker=True):
    """Use the real setup, chapter and source stores with a historical orphan body."""
    _service, run, factory = workspace
    await create_source_tables(factory)
    service = DocumentWorkspaceService(factory, workflow_session_factory=factory)
    await service.load(run)
    await add_chapters(factory)
    async with factory() as session, session.begin():
        chapter = await session.scalar(
            select(ConceptNoteChapter).where(
                ConceptNoteChapter.template_section_id == "finance"
            )
        )
        revision = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == chapter.chapter_id
            )
        )
        revision.body_markdown += "\n\nLiteral user addition."
        if marker:
            # Repeated occurrences represent one question, not duplicate gaps.
            revision.body_markdown += f"\n\n{MARKER}\n\n{MARKER}"
        session.add(
            ConceptNoteGap(
                run_id=run.run_id,
                chapter_id=chapter.chapter_id,
                field_key="award_date",
                question="Confirm procurement award date.",
                why_asking="Delivery timing",
                severity="critical",
                status="resolved",
                version=2,
            )
        )
        if existing_status:
            session.add(
                ConceptNoteGap(
                    run_id=run.run_id,
                    chapter_id=chapter.chapter_id,
                    field_key="existing_question",
                    question=QUESTION,
                    why_asking="Existing question",
                    severity="critical",
                    status=existing_status,
                )
            )
        chapter_id, body, proof = (
            chapter.chapter_id,
            revision.body_markdown,
            revision_provenance(revision),
        )
    return service, run, factory, chapter_id, body, proof


async def sync(service, run):
    view = await service.load(run)
    return await service.save_setup(
        run,
        DocumentSetupRequest(
            expected_revision=view.revision,
            idempotency_key=str(uuid4()),
        ),
    )


async def test_sync_recovers_orphan_once_with_exact_question_and_retains_history(
    workspace,
):
    service, run, factory, chapter_id, body, proof = await prepare_orphan(workspace)
    before = await service.load(run)
    async with factory() as session:
        assert len(list(await session.scalars(select(ConceptNoteGap)))) == 1
    request = DocumentSetupRequest(
        expected_revision=before.revision, idempotency_key=str(uuid4())
    )
    after = await service.save_setup(run, request)
    assert after.revision > before.revision
    assert await service.save_setup(run, request) == after
    assert (await sync(service, run)).revision == after.revision
    async with factory() as session:
        gaps = list(await session.scalars(select(ConceptNoteGap)))
        recovered = next(gap for gap in gaps if gap.status == "open")
        assert len(gaps) == 2 and recovered.question == QUESTION
        assert recovered.field_key.startswith("recovered_marker.")
        assert recovered.field_key not in {point.key for point in after.points}
        assert (
            recovered.severity == "critical"
            and recovered.source_refs == []
            and recovered.suggestions == []
        )
        assert "mapping is unknown" in recovered.why_asking
        historical = next(gap for gap in gaps if gap.field_key == "award_date")
        assert historical.status == "resolved" and historical.version == 2
        revisions = list(
            await session.scalars(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.chapter_id == chapter_id
                )
            )
        )
        assert len(revisions) == 1 and revisions[0].body_markdown == body
        assert revision_provenance(revisions[0]) == proof


@pytest.mark.parametrize("status", ["open", "processing", "caveat"])
async def test_sync_does_not_duplicate_existing_active_question(workspace, status):
    service, run, factory, *_ = await prepare_orphan(workspace, existing_status=status)
    before = await service.load(run)
    assert (await sync(service, run)).revision == before.revision
    async with factory() as session:
        assert len(list(await session.scalars(select(ConceptNoteGap)))) == 2


async def test_sync_without_markers_creates_no_questions_or_facts(workspace):
    service, run, factory, *_ = await prepare_orphan(workspace, marker=False)
    before = await service.load(run)
    after = await sync(service, run)
    assert after.revision == before.revision and after.points == before.points
    async with factory() as session:
        assert len(list(await session.scalars(select(ConceptNoteGap)))) == 1


async def test_recovery_preserves_resolved_same_question_and_prior_recovery_history(
    workspace,
):
    service, run, factory, *_ = await prepare_orphan(
        workspace, existing_status="resolved"
    )
    await sync(service, run)
    async with factory() as session, session.begin():
        recovered = await session.scalar(
            select(ConceptNoteGap).where(ConceptNoteGap.status == "open")
        )
        prior_id, prior_key = recovered.gap_id, recovered.field_key
        recovered.status = "resolved"
    await sync(service, run)
    async with factory() as session:
        gaps = list(await session.scalars(select(ConceptNoteGap)))
        active = [gap for gap in gaps if gap.status == "open"]
        assert len(active) == 1 and active[0].field_key == prior_key + ".2"
        assert next(gap for gap in gaps if gap.gap_id == prior_id).status == "resolved"
        assert (
            next(gap for gap in gaps if gap.field_key == "existing_question").status
            == "resolved"
        )


async def test_normal_answer_proposal_applies_to_recovered_gap(workspace, monkeypatch):
    service, run, factory, chapter_id, body, _proof = await prepare_orphan(workspace)
    answer = "Municipal co-financing is USD 180,000, explicitly confirmed by the user."
    request = EditProposalRequest(instruction=answer, idempotency_key=uuid4())
    chapters = await ConceptNoteWorkspaceRepository(factory).list_chapters(
        run_id=run.run_id
    )
    blocked = DraftEditSession(request, chapters, {}, [], max_searches=5)
    match = blocked.search_draft(MARKER)
    assert (
        blocked.propose_edits(
            [
                DraftReplacement(
                    search_id=match["search_id"],
                    replacement=answer,
                    replace_all=True,
                    kind="factual",
                    group_id="municipal_answer",
                    user_input_quote=answer,
                )
            ]
        )["ok"]
        is False
    )
    recovered_view = await sync(service, run)
    assert any(
        "Unresolved information markers" in blocker
        for blocker in recovered_view.export_eligibility.blockers
    )
    with pytest.raises(HTTPException) as error:
        await service.export(
            run,
            DocumentExportRequest(
                mode="final", expected_revision=recovered_view.revision
            ),
        )
    assert error.value.status_code == 409
    chapters = await ConceptNoteWorkspaceRepository(factory).list_chapters(
        run_id=run.run_id
    )
    edits = DraftEditSession(request, chapters, {}, [], max_searches=5)
    match = edits.search_draft(MARKER)
    assert (
        edits.propose_edits(
            [
                DraftReplacement(
                    search_id=match["search_id"],
                    replacement=answer,
                    replace_all=True,
                    kind="factual",
                    group_id="municipal_answer",
                    user_input_quote=answer,
                )
            ]
        )["ok"]
        is True
    )
    changes = [
        EditChange(
            **change.model_dump(),
            change_id=uuid4(),
            chapter_title="Finance",
            base_revision=1,
        )
        for change in edits.plan.changes
    ]
    proposal_id = uuid4()
    async with factory() as session, session.begin():
        session.add(
            ConceptNoteEditProposal(
                proposal_id=proposal_id,
                run_id=run.run_id,
                actor_user_id="owner",
                idempotency_key=uuid4(),
                request_fingerprint="a" * 64,
                instruction=f"Answer {QUESTION}: {answer}",
                scope={"kind": "auto", "focused_chapter_id": str(chapter_id)},
                base_revisions={str(chapter_id): 1},
                changes=[change.model_dump(mode="json") for change in changes],
                notices=[],
                status="proposed",
            )
        )
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await ConceptNoteEditRepository(factory).apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposal_id,
        request=EditApplyRequest(
            idempotency_key=uuid4(), expected_revisions={chapter_id: 1}
        ),
    )
    async with factory() as session:
        gaps = list(await session.scalars(select(ConceptNoteGap)))
        assert all(gap.status == "resolved" for gap in gaps)
        latest = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == chapter_id,
                ConceptNoteChapterRevision.revision_number == 2,
            )
        )
        assert latest.body_markdown == body.replace(MARKER, answer)
        assert "Literal user addition." in latest.body_markdown
    after = await service.load(run)
    assert not any(
        "Unresolved information markers" in blocker
        for blocker in after.export_eligibility.blockers
    )
