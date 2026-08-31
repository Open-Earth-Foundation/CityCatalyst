from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from app.db import Base
from app.models.cnb.context_bundle import SelectedSource, SourceExcerpt
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.persistence.concept_notes.context_bundle import (
    ContextBundleBuildSnapshot,
    ContextBundlePersistenceError,
    begin_build,
    complete_build,
    fail_build,
    load_agent_context,
    load_query_source,
    recover_stale_builds,
)
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


async def database(tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'context-bundle.db').as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[
                    ConceptNoteRun.__table__,
                    ConceptNoteContextBundle.__table__,
                    ConceptNoteUpload.__table__,
                ],
            )
        )
    return engine, async_sessionmaker(engine, expire_on_commit=False)


def concept_note_run(
    run_id: UUID,
    *,
    context_summary: dict | None = None,
) -> ConceptNoteRun:
    return ConceptNoteRun(
        run_id=run_id,
        user_id="owner",
        name="Run",
        city_id=str(uuid4()),
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
        context_summary=context_summary or {},
        permission_summary={},
    )


def upload(
    *,
    run_id: UUID,
    upload_id: UUID,
    status: str,
    received_at: datetime,
) -> ConceptNoteUpload:
    ready = status == "ready"
    return ConceptNoteUpload(
        upload_id=upload_id,
        run_id=run_id,
        uploaded_by_user_id="owner",
        filename=f"{upload_id}.pdf",
        source_label=None,
        markdown_s3_key=f"{upload_id}.md" if ready else None,
        markdown_sha256=(str(upload_id.int).zfill(64)[-64:] if ready else None),
        page_count=1 if ready else None,
        ingest_status=status,
        received_at=received_at,
    )


def selected(upload_row: ConceptNoteUpload) -> SelectedSource:
    assert upload_row.markdown_sha256 is not None
    return SelectedSource(
        upload_id=upload_row.upload_id,
        source_label=upload_row.filename,
        filename=upload_row.filename,
        sha256=upload_row.markdown_sha256,
        page_count=1,
        summary="Document summary.",
        topics=["topic"],
        key_excerpts=[SourceExcerpt(text="Exact text", page=1)],
    )


async def commit_build(
    session_factory: async_sessionmaker,
    snapshot: ContextBundleBuildSnapshot,
    selected_sources: list[SelectedSource],
) -> bool:
    return await complete_build(
        session_factory=session_factory,
        user_id="owner",
        run_id=snapshot.run_id,
        build_id=snapshot.build_id,
        selected_sources=selected_sources,
        ghgi=None,
        hiap=None,
        optional_sources={"ghgi": "missing", "hiap": "missing"},
        warnings=[],
    )


@pytest.mark.asyncio
async def test_pdf_only_commit_uses_typed_empties_and_preserves_other_sections(
    tmp_path,
) -> None:
    engine, session_factory = await database(tmp_path)
    run_id = uuid4()
    ready_id = uuid4()
    queued_id = uuid4()
    now = datetime.now(timezone.utc)
    ready_upload = upload(
        run_id=run_id,
        upload_id=ready_id,
        status="ready",
        received_at=now,
    )
    try:
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    concept_note_run(
                        run_id,
                        context_summary={"unrelated": {"keep": True}},
                    ),
                    ConceptNoteContextBundle(
                        run_id=run_id,
                        context_bundle={
                            "cc_context": {"city": {"name": "Test City"}},
                            "funder_context": {"name": "Existing funder"},
                            "future_section": {"keep": True},
                        },
                    ),
                    ready_upload,
                    upload(
                        run_id=run_id,
                        upload_id=queued_id,
                        status="queued",
                        received_at=now + timedelta(seconds=1),
                    ),
                ]
            )

        snapshot = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert [item.upload_id for item in snapshot.uploads] == [ready_id]
        committed = await commit_build(
            session_factory,
            snapshot,
            [selected(ready_upload)],
        )
        assert committed is True

        async with session_factory() as session:
            bundle = await session.get(ConceptNoteContextBundle, run_id)
            run = await session.get(ConceptNoteRun, run_id)
        assert bundle is not None and run is not None
        assert bundle.context_bundle["cc_context"] == {
            "city": {"name": "Test City"},
            "project": None,
            "ghgi": None,
            "ccra": None,
            "hiap": None,
        }
        assert bundle.context_bundle["funder_context"] == {"name": "Existing funder"}
        assert bundle.context_bundle["similar_projects"] == []
        assert bundle.context_bundle["document_context"] is None
        assert bundle.context_bundle["future_section"] == {"keep": True}
        assert run.workflow_step == "interviewing"
        assert run.context_summary["unrelated"] == {"keep": True}
        progress = run.context_summary["context_bundle"]
        assert progress["status"] == "ready"
        assert progress["source_counts"] == {
            "ready": 1,
            "queued": 1,
            "processing": 0,
            "failed": 0,
        }
        assert progress["document_grounding"] == "uploaded_evidence"
        assert progress["available_context"] == {
            "city": True,
            "project": False,
            "ghgi": False,
            "ccra": False,
            "hiap": False,
            "uploaded_documents": True,
        }
        assert "context_mode" not in progress
        assert progress["missing_context"] == []
        assert progress["completion_event"] == "concept_note_context_bundle_ready"
        assert (
            await fail_build(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                build_id=snapshot.build_id,
                error_code="late_failure",
                warning="A late failure must not replace a ready bundle.",
            )
            is False
        )

        query_source = await load_query_source(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            source_label=ready_upload.filename,
            filename=ready_upload.filename,
        )
        assert query_source.source.upload_id == ready_id
        replacement = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
            force=True,
        )
        assert [source.upload_id for source in replacement.previous_sources] == [
            ready_id
        ]
        rebuilding_query_source = await load_query_source(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            source_label=ready_upload.filename,
            filename=ready_upload.filename,
        )
        assert rebuilding_query_source.source.upload_id == ready_id
        with pytest.raises(ContextBundlePersistenceError) as forbidden:
            await load_query_source(
                session_factory=session_factory,
                user_id="other-user",
                run_id=run_id,
                source_label=ready_upload.filename,
                filename=ready_upload.filename,
            )
        assert forbidden.value.code == "concept_note_run_forbidden"
        with pytest.raises(ContextBundlePersistenceError) as unavailable:
            await load_query_source(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                source_label=f"{queued_id}.pdf",
                filename=f"{queued_id}.pdf",
            )
        assert unavailable.value.code == "concept_note_source_not_selected"

        async with session_factory() as session, session.begin():
            stored_run = await session.get(ConceptNoteRun, run_id)
            assert stored_run is not None
            stored_run.workflow_step = "assembling_context"
        with pytest.raises(ContextBundlePersistenceError) as wrong_step:
            await load_query_source(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                source_label=ready_upload.filename,
                filename=ready_upload.filename,
            )
        assert wrong_step.value.code == "concept_note_source_query_not_allowed"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_agent_projection_removes_ids_but_keeps_backend_identity(
    tmp_path,
) -> None:
    engine, session_factory = await database(tmp_path)
    run_id = uuid4()
    source_upload = upload(
        run_id=run_id,
        upload_id=uuid4(),
        status="ready",
        received_at=datetime.now(timezone.utc),
    )
    source_upload.filename = "plan.pdf"
    source = selected(source_upload)
    try:
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    concept_note_run(run_id),
                    source_upload,
                    ConceptNoteContextBundle(
                        run_id=run_id,
                        context_bundle={
                            "cc_context": {
                                "city": {
                                    "cityId": "internal-city",
                                    "name": "Example City",
                                }
                            },
                            "funder_context": {
                                "funder_id": "internal-funder",
                                "name": "Example Fund",
                            },
                            "document_context": {
                                "revision_id": "internal-revision",
                                "title": "Proposal",
                            },
                        },
                    ),
                ]
            )
        snapshot = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert await commit_build(session_factory, snapshot, [source])
        context = await load_agent_context(
            session_factory=session_factory, user_id="owner", run_id=run_id
        )
        assert context is not None
        assert "concept_note_run_id" not in context
        assert "upload_id" not in context["selected_sources"][0]
        assert "page_count" not in context["selected_sources"][0]
        assert "block_count" not in context["selected_sources"][0]
        assert "build_id" not in context["context_bundle_status"]
        assert "source_fingerprint" not in context["context_bundle_status"]
        assert context["cc_context"]["city"] == {"name": "Example City"}
        assert context["funder_context"] == {"name": "Example Fund"}
        assert context["document_context"] == {"title": "Proposal"}
        async with session_factory() as session:
            bundle = await session.get(ConceptNoteContextBundle, run_id)
            run = await session.get(ConceptNoteRun, run_id)
            assert bundle.context_bundle["selected_sources"][0]["upload_id"] == str(
                source_upload.upload_id
            )
            assert (
                bundle.context_bundle["selected_sources"][0]["sha256"] == source.sha256
            )
            assert bundle.context_bundle["selected_sources"][0]["page_count"] == source.page_count
            assert bundle.context_bundle["selected_sources"][0]["block_count"] == source.block_count
            assert (
                bundle.context_bundle["cc_context"]["city"]["cityId"] == "internal-city"
            )
            assert run.context_summary["context_bundle"]["build_id"] == str(
                snapshot.build_id
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_source_name_lookup_rejects_ambiguous_documents(tmp_path) -> None:
    engine, session_factory = await database(tmp_path)
    run_id = uuid4()
    uploads = [
        upload(
            run_id=run_id,
            upload_id=uuid4(),
            status="ready",
            received_at=datetime.now(timezone.utc),
        )
        for _ in range(2)
    ]
    for source_upload in uploads:
        source_upload.filename = "plan.pdf"
    try:
        async with session_factory() as session, session.begin():
            session.add_all([concept_note_run(run_id), *uploads])
        snapshot = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert await commit_build(
            session_factory, snapshot, [selected(item) for item in uploads]
        )
        with pytest.raises(ContextBundlePersistenceError) as ambiguous:
            await load_query_source(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                source_label="plan.pdf",
                filename="plan.pdf",
            )
        assert ambiguous.value.code == "concept_note_source_ambiguous"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_no_upload_commit_advances_run_and_loads_agent_context(
    tmp_path,
) -> None:
    """Persist an interview-ready bundle even when no source is attached."""
    engine, session_factory = await database(tmp_path)
    run_id = uuid4()
    try:
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    concept_note_run(run_id),
                    ConceptNoteContextBundle(run_id=run_id, context_bundle={}),
                ]
            )

        snapshot = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert snapshot.uploads == []
        assert await complete_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=snapshot.build_id,
            selected_sources=[],
            ghgi=None,
            hiap=None,
            optional_sources={"ghgi": "missing", "hiap": "missing"},
            warnings=["No source document is attached."],
        )

        async with session_factory() as session:
            run = await session.get(ConceptNoteRun, run_id)
        assert run is not None
        assert run.workflow_step == "interviewing"
        progress = run.context_summary["context_bundle"]
        assert progress["status"] == "ready"
        assert progress["document_grounding"] == "none"
        assert progress["available_context"] == {
            "city": False,
            "project": False,
            "ghgi": False,
            "ccra": False,
            "hiap": False,
            "uploaded_documents": False,
        }
        assert "context_mode" not in progress
        assert progress["missing_context"] == ["source_documents"]
        assert progress["source_counts"]["ready"] == 0

        agent_context = await load_agent_context(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
        )
        assert agent_context is not None
        assert agent_context["selected_sources"] == []
        assert agent_context["context_bundle_status"]["document_grounding"] == "none"

        await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
            force=True,
        )
        rebuilding_context = await load_agent_context(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
        )
        assert rebuilding_context is not None
        assert rebuilding_context["context_bundle_status"]["status"] == "building"
        assert (
            rebuilding_context["context_bundle_status"]["document_grounding"] == "none"
        )
        assert rebuilding_context["context_bundle_status"]["available_context"] == {
            "city": False,
            "project": False,
            "ghgi": False,
            "ccra": False,
            "hiap": False,
            "uploaded_documents": False,
        }
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_stale_build_cannot_replace_newer_ready_upload_set(tmp_path) -> None:
    engine, session_factory = await database(tmp_path)
    run_id = uuid4()
    first = upload(
        run_id=run_id,
        upload_id=uuid4(),
        status="ready",
        received_at=datetime.now(timezone.utc),
    )
    second = upload(
        run_id=run_id,
        upload_id=uuid4(),
        status="ready",
        received_at=datetime.now(timezone.utc) + timedelta(seconds=1),
    )
    try:
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    concept_note_run(run_id),
                    ConceptNoteContextBundle(run_id=run_id, context_bundle={}),
                    first,
                ]
            )
        older = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        async with session_factory() as session, session.begin():
            session.add(second)
        assert await commit_build(session_factory, older, [selected(first)]) is False
        newer = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert await commit_build(
            session_factory,
            newer,
            [selected(first), selected(second)],
        )
        async with session_factory() as session:
            bundle = await session.get(ConceptNoteContextBundle, run_id)
        assert bundle is not None
        assert [
            row["upload_id"] for row in bundle.context_bundle["selected_sources"]
        ] == [str(first.upload_id), str(second.upload_id)]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_failed_build_is_retryable_and_keeps_bundle_unready(tmp_path) -> None:
    engine, session_factory = await database(tmp_path)
    run_id = uuid4()
    try:
        async with session_factory() as session, session.begin():
            session.add_all(
                [
                    concept_note_run(run_id),
                    ConceptNoteContextBundle(run_id=run_id, context_bundle={}),
                ]
            )
        snapshot = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert snapshot.uploads == []
        assert (
            await fail_build(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                build_id=snapshot.build_id,
                error_code="context_bundle_build_failed",
                warning="The context bundle could not be built.",
            )
            is True
        )
        async with session_factory() as session:
            run = await session.get(ConceptNoteRun, run_id)
        assert run is not None
        progress = run.context_summary["context_bundle"]
        assert run.status == "active"
        assert progress["status"] == "failed"
        assert progress["retryable"] is True
        assert progress["completion_event"] is None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_recovery_marks_only_stale_building_runs_retryable(tmp_path) -> None:
    engine, session_factory = await database(tmp_path)
    now = datetime.now(timezone.utc)
    old_building_id = uuid4()
    recent_building_id = uuid4()
    ready_id = uuid4()
    old_building = concept_note_run(
        old_building_id,
        context_summary={"context_bundle": {"status": "building"}},
    )
    recent_building = concept_note_run(
        recent_building_id,
        context_summary={"context_bundle": {"status": "building"}},
    )
    ready = concept_note_run(
        ready_id,
        context_summary={"context_bundle": {"status": "ready"}},
    )
    old_building.updated_at = now - timedelta(hours=2)
    recent_building.updated_at = now - timedelta(minutes=10)
    ready.updated_at = now - timedelta(hours=2)
    try:
        async with session_factory() as session, session.begin():
            session.add_all([old_building, recent_building, ready])

        recovered = await recover_stale_builds(
            session_factory=session_factory,
            stale_before=now - timedelta(hours=1),
        )

        async with session_factory() as session:
            stored_old = await session.get(ConceptNoteRun, old_building_id)
            stored_recent = await session.get(ConceptNoteRun, recent_building_id)
            stored_ready = await session.get(ConceptNoteRun, ready_id)
        assert recovered == 1
        assert stored_old is not None
        assert stored_recent is not None
        assert stored_ready is not None
        old_progress = stored_old.context_summary["context_bundle"]
        assert old_progress["status"] == "failed"
        assert old_progress["error_code"] == "context_bundle_build_interrupted"
        assert old_progress["retryable"] is True
        assert stored_recent.context_summary["context_bundle"]["status"] == "building"
        assert stored_ready.context_summary["context_bundle"]["status"] == "ready"
    finally:
        await engine.dispose()
