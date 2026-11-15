"""Explicit Sync retries exhausted extraction without resetting accepted facts."""

from uuid import uuid4

from app.models.cnb.context_bundle import SelectedSource
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.document_workspace.contracts import DocumentSetupRequest
from app.persistence.concept_notes.source_revalidation import claim_source_revalidation
from app.services.document_workspace.service import DocumentWorkspaceService
from tests.cnb.test_document_workspace import answer
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414 - pytest fixture


async def create_source_tables(factory):
    async with factory.kw["bind"].begin() as connection:
        for table in (ConceptNoteContextBundle.__table__, ConceptNoteUpload.__table__):
            await connection.run_sync(
                lambda sync, table=table: table.create(sync, checkfirst=True)
            )


async def test_unchanged_setup_sync_requeues_exhausted_ready_sources_and_preserves_answers(
    workspace, monkeypatch
):
    _service, run, factory = workspace
    service = DocumentWorkspaceService(factory, workflow_session_factory=factory)
    await create_source_tables(factory)
    await answer(service, run)
    ready_id, queued_id, changed_id = uuid4(), uuid4(), uuid4()
    selected = [
        SelectedSource(
            upload_id=upload_id,
            source_label="Budget",
            filename="budget.pdf",
            sha256="a" * 64,
            page_count=1,
            summary="Budget source",
            topics=["budget"],
            key_excerpts=[],
        ).model_dump(mode="json")
        for upload_id in (ready_id, queued_id, changed_id)
    ]
    async with factory() as session, session.begin():
        row = await session.get(ConceptNoteRun, run.run_id)
        row.context_summary = {
            "source_revalidation": {
                "status": "failed",
                "attempts": 5,
                "upload_ids": [str(ready_id)],
            }
        }
        session.add(
            ConceptNoteContextBundle(
                run_id=run.run_id, context_bundle={"selected_sources": selected}
            )
        )
        for upload_id, status, digest in (
            (ready_id, "ready", "a" * 64),
            (queued_id, "queued", "a" * 64),
            (changed_id, "ready", "b" * 64),
        ):
            session.add(
                ConceptNoteUpload(
                    upload_id=upload_id,
                    run_id=run.run_id,
                    uploaded_by_user_id=run.user_id,
                    filename="budget.pdf",
                    ingest_status=status,
                    markdown_s3_key=f"sources/{upload_id}.md",
                    markdown_sha256=digest,
                    page_count=1,
                )
            )
    scheduled = []
    monkeypatch.setattr(
        "app.services.document_workspace.service.schedule_source_sync", scheduled.append
    )
    before = await service.load(run)
    request = DocumentSetupRequest(
        expected_revision=before.revision, idempotency_key=str(uuid4())
    )
    after = await service.save_setup(run, request)
    assert after.setup == before.setup
    assert after.points[0].value == before.points[0].value == 125000
    assert scheduled == [run.run_id]
    async with factory() as session:
        summary = (await session.get(ConceptNoteRun, run.run_id)).context_summary
    assert summary["source_revalidation"] == {
        "status": "pending",
        "attempts": 0,
        "upload_ids": [str(ready_id)],
    }
    claim = await claim_source_revalidation(session_factory=factory, run_id=run.run_id)
    assert claim is not None and claim.upload_ids == [ready_id]
    # Exact API replay stays stable and can repair a failed cross-store queue.
    assert await service.save_setup(run, request) == after


async def test_sync_without_ready_sources_does_not_schedule_a_worker(
    workspace, monkeypatch
):
    _service, run, factory = workspace
    await create_source_tables(factory)
    service = DocumentWorkspaceService(factory, workflow_session_factory=factory)
    scheduled = []
    monkeypatch.setattr(
        "app.services.document_workspace.service.schedule_source_sync", scheduled.append
    )
    before = await service.load(run)
    await service.save_setup(
        run,
        DocumentSetupRequest(
            expected_revision=before.revision, idempotency_key=str(uuid4())
        ),
    )
    assert not scheduled
