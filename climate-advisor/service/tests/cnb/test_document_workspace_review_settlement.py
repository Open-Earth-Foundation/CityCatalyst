"""Proposal decisions settle point freshness before their first workspace read."""

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text

from app.models.cnb.concept_note_edits import EditApplyRequest
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.document_workspace import (
    DocumentDependency,
    DocumentUpdateJob,
    DocumentWorkspaceState,
)
from app.models.document_workspace.contracts import DocumentSetupRequest
from app.persistence.concept_notes.edits import ConceptNoteEditRepository
from app.services.document_workspace.jobs import refresh_reviews
from app.services.document_workspace.service import DocumentWorkspaceService
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414
from tests.cnb.test_document_workspace_source_sync import create_source_tables
from tests.cnb.test_protected_proposal_gaps import (
    apply_proposal,
    create_protected_proposals,
)


async def test_normal_apply_then_immediate_sync_needs_no_reload_or_poll(
    workspace, monkeypatch
):
    _service, run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    await create_source_tables(factory)
    service = DocumentWorkspaceService(factory, workflow_session_factory=factory)
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await apply_proposal(factory, run, proposals[0])
    async with factory() as session:
        assert (
            await session.scalar(select(DocumentUpdateJob))
        ).status == "pending_review"
        assert any(
            row.applied_version == 0
            for row in await session.scalars(select(DocumentDependency))
        )
    last_request = EditApplyRequest(
        idempotency_key=uuid4(),
        expected_revisions={
            UUID(key): value for key, value in proposals[1].base_revisions.items()
        },
    )
    repository = ConceptNoteEditRepository(factory)
    await repository.apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposals[1].proposal_id,
        request=last_request,
    )
    async with factory() as session:
        assert (await session.scalar(select(DocumentUpdateJob))).status == "complete"
    first_workspace = await service.load(run)
    assert first_workspace.points[0].freshness == "current"
    synced = await service.save_setup(
        run,
        DocumentSetupRequest(
            expected_revision=first_workspace.revision,
            idempotency_key=str(uuid4()),
        ),
    )
    assert synced.revision == first_workspace.revision
    # Exact replay and background recovery cannot advance an already settled view.
    await repository.apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposals[1].proposal_id,
        request=last_request,
    )
    await refresh_reviews(service)
    assert (await service.load(run)).revision == first_workspace.revision


async def test_rejection_settles_failure_once_without_marking_dependencies_current(
    workspace,
):
    service, run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    repository = ConceptNoteEditRepository(factory)
    for _ in range(2):
        await repository.reject(
            run_id=run.run_id, user_id="owner", proposal_id=proposals[0].proposal_id
        )
        async with factory() as session:
            job = await session.scalar(select(DocumentUpdateJob))
            assert (
                job.status == "failed"
                and job.error_code == "point_update_review_unavailable"
            )
            assert all(
                row.applied_version == 0
                for row in await session.scalars(select(DocumentDependency))
            )
            revision = (await session.get(DocumentWorkspaceState, run.run_id)).revision
        if _ == 0:
            first_revision = revision
        else:
            assert revision == first_revision
    first_workspace = await service.load(run)
    assert first_workspace.points[0].freshness == "failed"
    await refresh_reviews(service)
    assert (await service.load(run)).revision == first_workspace.revision


@pytest.mark.parametrize(
    "terminal", ["partially_applied", "stale", "failed", "missing", "changed_vector"]
)
async def test_recovery_settlement_preserves_terminal_proposal_and_vector_fences(
    workspace, terminal
):
    service, _run, factory = workspace
    proposals = await create_protected_proposals(workspace)
    async with factory() as session, session.begin():
        for proposal in proposals:
            row = await session.get(ConceptNoteEditProposal, proposal.proposal_id)
            row.status = "applied"
        first = await session.get(ConceptNoteEditProposal, proposals[0].proposal_id)
        if terminal == "missing":
            await session.delete(first)
        elif terminal == "changed_vector":
            job = await session.scalar(select(DocumentUpdateJob))
            job.payload = {**job.payload, "point_versions": {"requested_amount": 999}}
        else:
            first.status = terminal
    await refresh_reviews(service)
    async with factory() as session:
        job = await session.scalar(select(DocumentUpdateJob))
        assert job.status == (
            "superseded" if terminal == "changed_vector" else "failed"
        )
        assert all(
            row.applied_version == 0
            for row in await session.scalars(select(DocumentDependency))
        )


async def test_workspace_fingerprint_is_stable_when_database_chapter_order_changes(
    workspace,
):
    service, run, factory = workspace
    await create_protected_proposals(workspace)
    before = await service.load(run)
    # Reverse SQLite's unspecified unordered SELECT order. Explicit chapter
    # ordering must keep an identical draft vector from advancing the CAS.
    async with factory() as session:
        await session.execute(text("PRAGMA reverse_unordered_selects = ON"))
    assert (await service.load(run)).revision == before.revision
