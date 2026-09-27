from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from app.db import Base
from app.models.cnb.context_bundle import SelectedSource
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.persistence.concept_notes.context_bundle import (
    begin_build,
    complete_build,
)
from app.persistence.concept_notes.source_revalidation import (
    SOURCE_REVALIDATION_MAX_ATTEMPTS,
    claim_source_revalidation,
    finish_source_revalidation,
    list_pending_source_revalidations,
    queue_source_revalidation,
    recover_stale_source_revalidations,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import (
    ContextBundleService,
    resume_source_revalidations,
)
from app.services.cnb.source_analysis import SourcePage
from app.services.cnb.source_impact_review import RevalidationSource
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

DIGEST = "d" * 64


@pytest.fixture
async def session_factory(tmp_path):
    """Create the CA run, upload, and bundle tables in an isolated database."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'revalidation.db').as_posix()}"
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
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def add_run(
    session_factory: async_sessionmaker,
    *,
    context_summary: dict | None = None,
) -> UUID:
    run_id = uuid4()
    async with session_factory() as session, session.begin():
        session.add(
            ConceptNoteRun(
                run_id=run_id,
                user_id="owner",
                name="Run",
                city_id=str(uuid4()),
                idempotency_key=uuid4(),
                request_fingerprint="a" * 64,
                context_summary=context_summary or {},
                permission_summary={},
            )
        )
    return run_id


async def add_ready_upload(session_factory: async_sessionmaker, run_id: UUID) -> UUID:
    upload_id = uuid4()
    async with session_factory() as session, session.begin():
        session.add(
            ConceptNoteUpload(
                upload_id=upload_id,
                run_id=run_id,
                uploaded_by_user_id="owner",
                filename="plan.pdf",
                source_label=None,
                markdown_s3_key="plan.md",
                markdown_sha256=DIGEST,
                page_count=1,
                ingest_status="ready",
                received_at=datetime.now(timezone.utc),
            )
        )
    return upload_id


def selected(upload_id: UUID) -> SelectedSource:
    return SelectedSource(
        upload_id=upload_id,
        source_label="plan.pdf",
        filename="plan.pdf",
        sha256=DIGEST,
        page_count=1,
        summary="Plan summary.",
        topics=["plan"],
        key_excerpts=[],
    )


async def load_job(session_factory: async_sessionmaker, run_id: UUID) -> dict | None:
    async with session_factory() as session:
        run = await session.get(ConceptNoteRun, run_id)
    assert run is not None
    return run.context_summary.get("source_revalidation")


async def test_complete_build_queues_the_job_in_the_same_transaction(
    session_factory,
) -> None:
    """A committed bundle with new sources always carries its pending job."""
    run_id = await add_run(session_factory)
    upload_id = await add_ready_upload(session_factory, run_id)
    snapshot = await begin_build(
        session_factory=session_factory,
        user_id="owner",
        run_id=run_id,
        build_id=uuid4(),
    )

    assert await complete_build(
        session_factory=session_factory,
        user_id="owner",
        run_id=run_id,
        build_id=snapshot.build_id,
        selected_sources=[selected(upload_id)],
        ghgi=None,
        hiap=None,
        optional_sources={"ghgi": "missing", "hiap": "missing"},
        warnings=[],
        revalidation_upload_ids=[upload_id],
    )

    assert await load_job(session_factory, run_id) == {
        "status": "pending",
        "upload_ids": [str(upload_id)],
        "attempts": 0,
    }


async def test_failed_attempts_stay_retryable_until_the_budget_runs_out(
    session_factory,
) -> None:
    """Each failure re-queues the job; a new source restarts an exhausted one."""
    upload_id = uuid4()
    run_id = await add_run(
        session_factory,
        context_summary=queue_source_revalidation({}, [upload_id]),
    )

    for attempt in range(1, SOURCE_REVALIDATION_MAX_ATTEMPTS + 1):
        claim = await claim_source_revalidation(
            session_factory=session_factory, run_id=run_id
        )
        assert claim is not None
        assert claim.user_id == "owner"
        assert claim.upload_ids == [upload_id]
        # A leased job cannot be claimed twice.
        assert (
            await claim_source_revalidation(
                session_factory=session_factory, run_id=run_id
            )
            is None
        )
        await finish_source_revalidation(
            session_factory=session_factory,
            run_id=run_id,
            upload_ids=claim.upload_ids,
            succeeded=False,
        )
        job = await load_job(session_factory, run_id)
        assert job is not None
        assert job["attempts"] == attempt

    assert job["status"] == "failed"
    assert (
        await claim_source_revalidation(session_factory=session_factory, run_id=run_id)
        is None
    )

    # A later source re-queues everything with a fresh attempt budget.
    new_upload_id = uuid4()
    async with session_factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        run.context_summary = queue_source_revalidation(
            run.context_summary, [new_upload_id]
        )
    assert await load_job(session_factory, run_id) == {
        "status": "pending",
        "upload_ids": [str(upload_id), str(new_upload_id)],
        "attempts": 0,
    }


async def test_success_keeps_uploads_queued_while_the_job_ran(
    session_factory,
) -> None:
    """Only the processed uploads are cleared from a successful job."""
    first_id, second_id = uuid4(), uuid4()
    run_id = await add_run(
        session_factory,
        context_summary=queue_source_revalidation({}, [first_id]),
    )
    claim = await claim_source_revalidation(
        session_factory=session_factory, run_id=run_id
    )
    assert claim is not None
    async with session_factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        run.context_summary = queue_source_revalidation(
            run.context_summary, [second_id]
        )
    assert (await load_job(session_factory, run_id))["status"] == "running"

    await finish_source_revalidation(
        session_factory=session_factory,
        run_id=run_id,
        upload_ids=claim.upload_ids,
        succeeded=True,
    )
    assert await load_job(session_factory, run_id) == {
        "status": "pending",
        "upload_ids": [str(second_id)],
        "attempts": 0,
    }

    claim = await claim_source_revalidation(
        session_factory=session_factory, run_id=run_id
    )
    assert claim is not None
    await finish_source_revalidation(
        session_factory=session_factory,
        run_id=run_id,
        upload_ids=claim.upload_ids,
        succeeded=True,
    )
    assert await load_job(session_factory, run_id) is None


async def test_stale_running_jobs_become_pending_again(session_factory) -> None:
    """A lease abandoned by a crashed worker is released after its cutoff."""
    now = datetime.now(timezone.utc)

    def running(started_at: datetime) -> dict:
        return {
            "source_revalidation": {
                "status": "running",
                "upload_ids": [str(uuid4())],
                "attempts": 1,
                "started_at": started_at.isoformat(),
            }
        }

    stale_id = await add_run(
        session_factory, context_summary=running(now - timedelta(hours=2))
    )
    recent_id = await add_run(
        session_factory, context_summary=running(now - timedelta(minutes=5))
    )

    recovered = await recover_stale_source_revalidations(
        session_factory=session_factory,
        stale_before=now - timedelta(hours=1),
    )

    assert recovered == 1
    assert (await load_job(session_factory, stale_id))["status"] == "pending"
    assert (await load_job(session_factory, recent_id))["status"] == "running"
    assert await list_pending_source_revalidations(session_factory=session_factory) == [
        stale_id
    ]


def retry_client() -> SimpleNamespace:
    """Fake CityCatalyst client that mints a token and serves one artifact."""
    return SimpleNamespace(
        refresh_token=AsyncMock(return_value=("minted-token", 900)),
        get_concept_note_markdown=AsyncMock(
            return_value=ConceptNoteMarkdownArtifact(
                markdown="<!-- page: 1 -->\nSeven new tram stops.",
                markdown_s3_key="plan.md",
                sha256=DIGEST,
                source_format="pdf",
                page_count=1,
            )
        ),
        close=AsyncMock(),
    )


def verified_page(**_: object) -> list[SourcePage]:
    return [SourcePage(number=1, text="Seven new tram stops.")]


async def queue_bundle_with_pending_job(
    session_factory: async_sessionmaker,
) -> tuple[UUID, UUID]:
    run_id = await add_run(session_factory)
    upload_id = await add_ready_upload(session_factory, run_id)
    async with session_factory() as session, session.begin():
        session.add(
            ConceptNoteContextBundle(
                run_id=run_id,
                context_bundle={
                    "selected_sources": [selected(upload_id).model_dump(mode="json")]
                },
            )
        )
        run = await session.get(ConceptNoteRun, run_id)
        run.context_summary = queue_source_revalidation(
            run.context_summary, [upload_id]
        )
    return run_id, upload_id


async def test_retry_refetches_source_text_with_a_minted_token(
    session_factory,
) -> None:
    """A restarted job rebuilds verified text without the original request."""
    run_id, upload_id = await queue_bundle_with_pending_job(session_factory)
    client = retry_client()
    revalidate = AsyncMock(return_value=True)
    service = ContextBundleService(
        session_factory,
        verify_source_artifact_fn=verified_page,
        cc_client_factory=lambda: client,
        revalidate_fn=revalidate,
    )

    assert await service.run_source_revalidation(run_id=run_id) is True

    client.refresh_token.assert_awaited_once_with("owner")
    assert client.get_concept_note_markdown.await_args.kwargs["token"] == "minted-token"
    [source] = revalidate.await_args.kwargs["new_sources"]
    assert source.source.upload_id == upload_id
    assert source.units == verified_page()
    client.close.assert_awaited_once_with()
    assert await load_job(session_factory, run_id) is None


async def test_failed_revalidation_leaves_the_job_pending(session_factory) -> None:
    """A provider failure is retried by the reconciler instead of being lost."""
    run_id, upload_id = await queue_bundle_with_pending_job(session_factory)
    service = ContextBundleService(
        session_factory,
        cc_client_factory=retry_client,
        revalidate_fn=AsyncMock(side_effect=RuntimeError("provider down")),
    )

    assert (
        await service.run_source_revalidation(
            run_id=run_id,
            preloaded={
                upload_id: RevalidationSource(
                    source=selected(upload_id), units=verified_page()
                )
            },
        )
        is False
    )

    job = await load_job(session_factory, run_id)
    assert job == {
        "status": "pending",
        "upload_ids": [str(upload_id)],
        "attempts": 1,
    }


async def test_reconciler_schedules_every_pending_job(
    session_factory, monkeypatch
) -> None:
    """Pending jobs are resumed after a restart without any user request."""
    run_id, _ = await queue_bundle_with_pending_job(session_factory)
    revalidate = AsyncMock(return_value=True)
    service = ContextBundleService(
        session_factory,
        verify_source_artifact_fn=verified_page,
        cc_client_factory=retry_client,
        revalidate_fn=revalidate,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.get_context_bundle_service",
        lambda: service,
    )

    scheduled = await resume_source_revalidations(
        session_factory=session_factory,
        stale_before=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    for _ in range(20):
        if await load_job(session_factory, run_id) is None:
            break
        await asyncio.sleep(0.05)

    assert scheduled == 1
    revalidate.assert_awaited_once()
    assert await load_job(session_factory, run_id) is None
