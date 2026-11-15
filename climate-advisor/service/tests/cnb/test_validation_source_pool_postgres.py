"""Real bounded-pool CA/CNB concurrency; isolated schemas, no provider calls."""

import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import event, inspect, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from app.db.base import Base
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditChange,
    EditProposalRequest,
)
from app.models.db.cnb_workspace import ConceptNoteChapterRevision, ConceptNoteGap
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.document_workspace import DocumentDependency
from app.models.document_workspace.contracts import (
    DocumentExportRequest,
    DocumentPointCommand,
)
from app.persistence.concept_notes.edits import ConceptNoteEditRepository
from app.persistence.concept_notes.source_provenance import sources_provenance
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceConflictError,
)
from app.persistence.concept_notes.workspace_validation import (
    WorkspaceValidationInputChangedError,
)
from app.routes.document_workspace import _authorized_run
from app.services.citycatalyst_client import CityCatalystClient
from app.services.cnb.application_context import (
    calculate_application_template_fingerprint,
)
from app.services.cnb.edits import ConceptNoteEditService
from app.services.document_workspace.service import DocumentWorkspaceService
from tests.cnb.test_chapter_validation_persistence import _seed_document

pytestmark = pytest.mark.skipif(
    not os.getenv("CNB_SOURCE_POOL_TEST_DATABASE_URL"),
    reason="Requires disposable CNB_SOURCE_POOL_TEST_DATABASE_URL",
)


@pytest.fixture
async def bounded_stores():
    url = os.environ["CNB_SOURCE_POOL_TEST_DATABASE_URL"].replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    schemas = [f"source_ca_{uuid4().hex}", f"source_cnb_{uuid4().hex}"]
    admin = create_async_engine(url)
    engines = [
        create_async_engine(
            url,
            pool_size=2,
            max_overflow=0,
            pool_timeout=2,
            connect_args={"server_settings": {"search_path": schema}},
        )
        for schema in schemas
    ]
    ca_engine, cnb_engine = engines
    ca, cnb = [async_sessionmaker(engine, expire_on_commit=False) for engine in engines]
    peak = [0]

    @event.listens_for(ca_engine.sync_engine, "checkout")
    def observe_checkout(*_):
        peak[0] = max(peak[0], ca_engine.pool.checkedout())

    try:
        async with admin.begin() as connection:
            for schema in schemas:
                await connection.execute(CreateSchema(schema))
        async with ca_engine.begin() as connection:
            await connection.run_sync(
                lambda sync: Base.metadata.create_all(
                    sync,
                    tables=[
                        ConceptNoteRun.__table__,
                        ConceptNoteUpload.__table__,
                        ConceptNoteContextBundle.__table__,
                    ],
                )
            )
        async with cnb_engine.begin() as connection:
            tables = [
                table
                for name, table in CnbBase.metadata.tables.items()
                if name.startswith(("document_", "concept_note_"))
                and name != "concept_note_matched_projects"
            ]
            await connection.run_sync(
                lambda sync: CnbBase.metadata.create_all(sync, tables=tables)
            )
        template = ApplicationContextTemplate(
            id=uuid4(),
            name="Pool regression",
            chapter_schema=[
                {
                    "chapter_ref": ref,
                    "title": ref.title(),
                    "required": True,
                    "required_fields": [
                        {
                            "key": "amount",
                            "label": "Amount",
                            "answer_type": "number",
                            "unit": "USD",
                        }
                    ],
                }
                for ref in ["summary", "budget"]
            ],
        )
        fingerprint = calculate_application_template_fingerprint(template)
        repository = ConceptNoteWorkspaceRepository(cnb, workflow_session_factory=ca)
        edit_repository = ConceptNoteEditRepository(cnb)
        editor = ConceptNoteEditService(
            edit_repository, repository, None, workflow_sessions=ca
        )
        service = DocumentWorkspaceService(cnb, workflow_session_factory=ca)
        records = []
        for _ in range(2):
            run_id, upload_id = uuid4(), uuid4()
            identity = {"upload_id": str(upload_id), "sha256": "a" * 64}
            metadata = {
                "upload_id": str(upload_id),
                "filename": "source.md",
                "source_label": "Source",
                "source_format": "markdown",
            }
            run = ConceptNoteRun(
                run_id=run_id,
                user_id="owner",
                name="Pool regression",
                city_id=str(uuid4()),
                idempotency_key=uuid4(),
                request_fingerprint="f" * 64,
                workflow_step="editing_document",
                custom_template={
                    "id": str(template.id),
                    "template_name": template.name,
                    "chapter_schema": template.chapter_schema,
                    "required_fields": [],
                    "added_from": {"kind": "manual"},
                },
            )
            async with ca() as session, session.begin():
                session.add(run)
                await session.flush()
                session.add_all(
                    [
                        ConceptNoteUpload(
                            upload_id=upload_id,
                            run_id=run_id,
                            uploaded_by_user_id="owner",
                            filename="source.md",
                            ingest_status="ready",
                            markdown_sha256=identity["sha256"],
                        ),
                        ConceptNoteContextBundle(
                            run_id=run_id,
                            context_bundle={
                                "selected_sources": [
                                    {
                                        **metadata,
                                        "sha256": identity["sha256"],
                                        "summary": "Source facts",
                                        "topics": [],
                                        "key_excerpts": [],
                                        "block_count": 1,
                                    }
                                ],
                                "source_text": {
                                    "mode": "full_text",
                                    "token_count": 20,
                                    "max_tokens": 10000,
                                    "documents": [
                                        {**metadata, "text": "Verified source facts."}
                                    ],
                                },
                            },
                        ),
                    ]
                )
            target, other = await _seed_document(cnb, run_id=run_id)
            await service.load(run)
            await service.command(
                run,
                "amount",
                DocumentPointCommand(
                    command="answer",
                    value=400,
                    expected_version=1,
                    idempotency_key=str(uuid4()),
                ),
                user_id="owner",
            )
            async with cnb() as session, session.begin():
                for revision in await session.scalars(
                    select(ConceptNoteChapterRevision).where(
                        ConceptNoteChapterRevision.chapter_id.in_([target, other])
                    )
                ):
                    revision.patch_summary = {
                        "source_provenance": sources_provenance([identity])
                    }
                for gap in await session.scalars(
                    select(ConceptNoteGap).where(ConceptNoteGap.run_id == run_id)
                ):
                    gap.status = "resolved"
                for dependency in await session.scalars(select(DocumentDependency)):
                    dependency.applied_version = 2
            for chapter_id in [target, other]:
                context = await repository.load_validation_context(
                    run_id=run_id,
                    chapter_id=chapter_id,
                    template_fingerprint=fingerprint,
                )
                await repository.upsert_validation(
                    run_id=run_id,
                    chapter_id=chapter_id,
                    template_fingerprint=fingerprint,
                    expected_fingerprint=context.fingerprint,
                    status="ready",
                    findings=[],
                )
                await repository.confirm_chapter(
                    run_id=run_id,
                    chapter_id=chapter_id,
                    template_fingerprint=fingerprint,
                    expected_revision=1,
                    idempotency_key=uuid4(),
                    user_id="owner",
                )
            chapters = await repository.list_chapters(
                run_id=run_id, template_fingerprint=fingerprint
            )
            chapter = next(
                chapter for chapter in chapters if chapter.chapter_id == target
            )
            proposal, _ = await edit_repository.start(
                run_id=run_id,
                user_id="owner",
                request=EditProposalRequest(
                    instruction="Add my reviewed note", idempotency_key=uuid4()
                ),
            )
            proposal = await edit_repository.finish(
                run_id=run_id,
                user_id="owner",
                proposal_id=proposal.proposal_id,
                base_revisions={
                    chapter.chapter_id: chapter.revision_number for chapter in chapters
                },
                changes=[
                    EditChange(
                        change_id=uuid4(),
                        chapter_id=target,
                        chapter_title=chapter.title,
                        base_revision=1,
                        start=0,
                        before=chapter.body_markdown,
                        after=chapter.body_markdown + "\nReviewed addition.",
                        kind="wording",
                        group_id="wording",
                    )
                ],
                source_provenance=sources_provenance([identity]),
            )
            records.append(
                SimpleNamespace(
                    run=run,
                    upload_id=upload_id,
                    target=target,
                    other=other,
                    proposal=proposal,
                )
            )
        yield SimpleNamespace(
            ca=ca,
            cnb=cnb,
            ca_engine=ca_engine,
            cnb_engine=cnb_engine,
            repository=repository,
            editor=editor,
            service=service,
            fingerprint=fingerprint,
            records=records,
            peak=peak,
        )
        assert ca_engine.pool.checkedout() == cnb_engine.pool.checkedout() == 0
        assert peak[0] <= 2
    finally:
        for engine in engines:
            await engine.dispose()
        async with admin.begin() as connection:
            for schema in schemas:
                await connection.execute(
                    DropSchema(schema, cascade=True, if_exists=True)
                )
        await admin.dispose()


async def test_two_workflow_locks_borrow_existing_connections_while_polls_wait(
    bounded_stores,
):
    data = bounded_stores
    barrier = asyncio.Barrier(2)

    async def locked_read(record):
        async with data.editor.locked_context(record.run):
            await barrier.wait()
            assert data.ca_engine.pool.checkedout() == 2
            chapters = await data.repository.list_chapters(
                run_id=record.run.run_id, template_fingerprint=data.fingerprint
            )
            assert all(
                chapter.validation and not chapter.validation.is_stale
                for chapter in chapters
            )

    async def poll():
        for _ in range(6):
            await data.service.load(data.records[0].run)

    await asyncio.wait_for(
        asyncio.gather(*(locked_read(record) for record in data.records), poll()),
        timeout=10,
    )
    assert data.peak[0] == 2


async def test_concurrent_real_apply_confirm_and_workspace_projection_make_progress(
    bounded_stores,
):
    data = bounded_stores
    record = data.records[0]

    async def confirm():
        try:
            await data.repository.confirm_chapter(
                run_id=record.run.run_id,
                chapter_id=record.other,
                expected_revision=1,
                idempotency_key=uuid4(),
                user_id="owner",
                template_fingerprint=data.fingerprint,
            )
        except WorkspaceConflictError as exc:
            assert "validation is missing or stale" in str(exc)

    async def apply():
        result = await data.editor.apply(
            record.run,
            record.proposal.proposal_id,
            EditApplyRequest(
                idempotency_key=uuid4(),
                expected_revisions=record.proposal.base_revisions,
            ),
        )
        assert result.status == "applied"

    await asyncio.wait_for(
        asyncio.gather(
            apply(),
            confirm(),
            *(data.service.load(record.run) for _ in range(6)),
            *(
                data.repository.list_chapters(
                    run_id=record.run.run_id, template_fingerprint=data.fingerprint
                )
                for _ in range(4)
            ),
        ),
        timeout=10,
    )
    view = await data.service.load(record.run)
    assert not view.export_eligibility.final
    assert any(
        "validation is missing or stale" in blocker
        for blocker in view.export_eligibility.blockers
    )


async def test_export_callback_can_reenter_ca_with_two_connections(bounded_stores):
    data = bounded_stores

    async def export(record):
        view = await data.service.load(record.run)
        assert view.export_eligibility.final

        async def verify(identities):
            assert data.service._validation_sources.current is None
            # The real CC availability check can call CA to authorize a reused
            # upload. Exercise that resource edge with a real CA checkout.
            async with data.ca() as session:
                upload = await session.get(ConceptNoteUpload, record.upload_id)
                assert upload.markdown_sha256 == identities[0]["sha256"]

        return await data.service.export(
            record.run,
            DocumentExportRequest(mode="final", expected_revision=view.revision),
            source_validator=verify,
        )

    results = await asyncio.wait_for(
        asyncio.gather(*(export(record) for record in data.records)), timeout=10
    )
    assert all(result.mode == "final" for result in results)


async def test_borrowed_session_cache_cannot_hide_changed_authority(bounded_stores):
    data = bounded_stores
    record = data.records[0]
    original = await data.repository.load_validation_context(
        run_id=record.run.run_id,
        chapter_id=record.target,
        template_fingerprint=data.fingerprint,
    )
    async with data.ca() as borrowed:
        cached = await borrowed.get(ConceptNoteContextBundle, record.run.run_id)
        cached_upload = await borrowed.get(ConceptNoteUpload, record.upload_id)
        async with data.ca() as writer, writer.begin():
            upload = await writer.get(ConceptNoteUpload, record.upload_id)
            upload.markdown_sha256 = "b" * 64
        async with data.repository.using_workflow_session(borrowed):
            current = await data.repository.load_validation_context(
                run_id=record.run.run_id,
                chapter_id=record.target,
                template_fingerprint=data.fingerprint,
            )
            assert cached is not None
            assert cached_upload.markdown_sha256 == "a" * 64
            assert current.source_authority.status == "digest_mismatch"
            assert current.fingerprint != original.fingerprint
            with pytest.raises(WorkspaceValidationInputChangedError):
                await data.repository.upsert_validation(
                    run_id=record.run.run_id,
                    chapter_id=record.target,
                    template_fingerprint=data.fingerprint,
                    expected_fingerprint=original.fingerprint,
                    status="ready",
                    findings=[],
                )
            with pytest.raises(WorkspaceConflictError):
                await data.repository.confirm_chapter(
                    run_id=record.run.run_id,
                    chapter_id=record.target,
                    expected_revision=1,
                    idempotency_key=uuid4(),
                    user_id="owner",
                    template_fingerprint=data.fingerprint,
                )
            async with data.ca() as writer, writer.begin():
                upload = await writer.get(ConceptNoteUpload, record.upload_id)
                upload.markdown_sha256 = "a" * 64
                bundle = await writer.get(ConceptNoteContextBundle, record.run.run_id)
                payload = bundle.context_bundle
                bundle.context_bundle = {
                    **payload,
                    "source_text": {
                        **payload["source_text"],
                        "documents": [
                            {
                                **payload["source_text"]["documents"][0],
                                "text": "New verified source text.",
                            }
                        ],
                    },
                }
            text_changed = await data.repository.load_validation_context(
                run_id=record.run.run_id,
                chapter_id=record.target,
                template_fingerprint=data.fingerprint,
            )
            assert (
                cached.context_bundle["source_text"]["documents"][0]["text"]
                == "Verified source facts."
            )
            assert text_changed.source_authority.status == "full_text"
            assert text_changed.fingerprint != original.fingerprint
            with pytest.raises(WorkspaceValidationInputChangedError):
                await data.repository.upsert_validation(
                    run_id=record.run.run_id,
                    chapter_id=record.target,
                    template_fingerprint=data.fingerprint,
                    expected_fingerprint=original.fingerprint,
                    status="ready",
                    findings=[],
                )
        # The borrow scope never rolls back or closes its caller's transaction.
        assert borrowed.in_transaction()


async def test_two_authorization_reads_release_their_ca_connections_before_workspace(
    bounded_stores, monkeypatch
):
    data = bounded_stores
    barrier = asyncio.Barrier(2)

    async def city(**kwargs):
        assert kwargs["user_id"] == "owner"
        await barrier.wait()
        return {}

    monkeypatch.setattr(
        CityCatalystClient, "validate_user_identity", AsyncMock(return_value="owner")
    )
    monkeypatch.setattr(CityCatalystClient, "get_city", AsyncMock(side_effect=city))

    async def read(record):
        async with data.ca() as session:
            # Canonical run lookup/ownership/city authorization are real; only
            # the external identity/city transport is controlled in this test.
            run = await _authorized_run(
                session, record.run.run_id, "owner", "Bearer test-token"
            )
            assert inspect(run).detached and not session.in_transaction()
            return await data.service.load(run)

    views = await asyncio.wait_for(
        asyncio.gather(*(read(record) for record in data.records)), timeout=10
    )
    assert all(view.export_eligibility.final for view in views)
