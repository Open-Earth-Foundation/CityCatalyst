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
    ContextBundlePersistenceError,
    begin_build,
    complete_build,
    fail_build,
    load_query_source,
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
            run = ConceptNoteRun(
                run_id=run_id,
                user_id="owner",
                name="Run",
                city_id=str(uuid4()),
                idempotency_key=uuid4(),
                request_fingerprint="a" * 64,
                context_summary={"unrelated": {"keep": True}},
                permission_summary={},
            )
            session.add_all(
                [
                    run,
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
        committed = await complete_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=snapshot.build_id,
            selected_sources=[selected(ready_upload)],
            ghgi=None,
            hiap=None,
            optional_sources={"ghgi": "missing", "hiap": "missing"},
            warnings=[],
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
        assert progress["completion_event"] == "concept_note_context_bundle_ready"

        query_source = await load_query_source(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            upload_id=ready_id,
        )
        assert query_source.source.upload_id == ready_id
        with pytest.raises(ContextBundlePersistenceError) as forbidden:
            await load_query_source(
                session_factory=session_factory,
                user_id="other-user",
                run_id=run_id,
                upload_id=ready_id,
            )
        assert forbidden.value.code == "concept_note_run_forbidden"
        with pytest.raises(ContextBundlePersistenceError) as unavailable:
            await load_query_source(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                upload_id=queued_id,
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
                upload_id=ready_id,
            )
        assert wrong_step.value.code == "concept_note_source_query_not_allowed"
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
                    ConceptNoteRun(
                        run_id=run_id,
                        user_id="owner",
                        name="Run",
                        city_id=str(uuid4()),
                        idempotency_key=uuid4(),
                        request_fingerprint="a" * 64,
                        context_summary={},
                        permission_summary={},
                    ),
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
        assert (
            await complete_build(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                build_id=older.build_id,
                selected_sources=[selected(first)],
                ghgi=None,
                hiap=None,
                optional_sources={"ghgi": "missing", "hiap": "missing"},
                warnings=[],
            )
            is False
        )
        newer = await begin_build(
            session_factory=session_factory,
            user_id="owner",
            run_id=run_id,
            build_id=uuid4(),
        )
        assert older.source_fingerprint != newer.source_fingerprint
        assert (
            await complete_build(
                session_factory=session_factory,
                user_id="owner",
                run_id=run_id,
                build_id=newer.build_id,
                selected_sources=[selected(first), selected(second)],
                ghgi=None,
                hiap=None,
                optional_sources={"ghgi": "missing", "hiap": "missing"},
                warnings=[],
            )
            is True
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
                    ConceptNoteRun(
                        run_id=run_id,
                        user_id="owner",
                        name="Run",
                        city_id=str(uuid4()),
                        idempotency_key=uuid4(),
                        request_fingerprint="a" * 64,
                        context_summary={},
                        permission_summary={},
                    ),
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
                error_code="no_ready_city_pdf",
                warning="A ready PDF is required.",
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
