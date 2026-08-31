from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from app.db import Base
from app.models.cnb.concept_note_application_context import (
    ApplicationContextFunder,
    ApplicationContextIncludedSources,
    ApplicationContextOpportunity,
    ApplicationContextTemplate,
    ConceptNoteApplicationContextResponse,
)
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftResponse,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.routes.concept_note_runs import start_concept_note_drafting
from app.services.cnb.chapter_drafting import (
    ChapterDraftingError,
    ChapterDraftingRunUnavailableError,
    ChapterDraftingTemplateError,
    ConceptNoteChapterDraftService,
    recover_stale_drafts,
    run_chapter_drafting_reconciler,
)
from fastapi import HTTPException, Response
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

RUN_ID = UUID("10000000-0000-4000-8000-000000000001")
BUILD_ID = UUID("20000000-0000-4000-8000-000000000001")


class FakeWorkspace:
    """Small mutable workspace used to exercise the real sequential loop."""

    def __init__(self, chapters: list[WorkspaceChapterSnapshot]) -> None:
        self.chapters = chapters

    async def list_chapters(self, *, run_id: UUID) -> list[WorkspaceChapterSnapshot]:
        assert run_id == RUN_ID
        return list(self.chapters)

    async def save_generated_chapter(
        self,
        *,
        chapter_id: UUID,
        body_markdown: str,
        missing_information: list[str],
    ) -> bool:
        assert missing_information == []
        index = next(
            position
            for position, chapter in enumerate(self.chapters)
            if chapter.chapter_id == chapter_id
        )
        self.chapters[index] = replace(
            self.chapters[index],
            status="draft",
            body_markdown=body_markdown,
            revision_number=1,
        )
        return True


async def test_drafts_in_order_and_passes_every_previous_chapter() -> None:
    chapter_ids = [
        UUID("30000000-0000-4000-8000-000000000001"),
        UUID("30000000-0000-4000-8000-000000000002"),
    ]
    workspace = FakeWorkspace(
        [
            WorkspaceChapterSnapshot(
                chapter_id=chapter_id,
                chapter_ref=f"chapter-{index + 1}",
                title=f"Chapter {index + 1}",
                position=index,
                status="empty",
                required=True,
                user_locked=False,
                body_markdown=None,
                missing_information=[],
                revision_number=None,
            )
            for index, chapter_id in enumerate(chapter_ids)
        ]
    )
    application_context = ConceptNoteApplicationContextResponse(
        run_id=RUN_ID,
        city_id=UUID("40000000-0000-4000-8000-000000000001"),
        funder=ApplicationContextFunder(
            id=UUID("50000000-0000-4000-8000-000000000001"),
            name="Funder",
        ),
        opportunity=ApplicationContextOpportunity(
            id=UUID("60000000-0000-4000-8000-000000000001"),
            name="Programme",
        ),
        template=ApplicationContextTemplate(
            id=UUID("70000000-0000-4000-8000-000000000001"),
            name="Template",
            chapter_schema=[
                {"chapter_ref": "chapter-1", "title": "Chapter 1"},
                {"chapter_ref": "chapter-2", "title": "Chapter 2"},
            ],
        ),
        included_sources=ApplicationContextIncludedSources(ghgi=True),
    )
    payloads: list[dict[str, Any]] = []

    async def generate(payload: dict[str, Any]) -> ConceptNoteChapterDraftOutput:
        payloads.append(payload)
        return ConceptNoteChapterDraftOutput(
            body_markdown=f"Draft for {payload['chapter']['title']}"
        )

    service = cast(
        ConceptNoteChapterDraftService,
        object.__new__(ConceptNoteChapterDraftService),
    )
    service._workspace = workspace
    service._application_context = SimpleNamespace(
        load_for_run=AsyncMock(return_value=application_context)
    )
    service._generate_chapter_override = generate
    service._load_owned_run = AsyncMock(
        return_value=cast(
            ConceptNoteRun,
            SimpleNamespace(run_id=RUN_ID, user_id="user-1"),
        )
    )
    included_sources = ApplicationContextIncludedSources(ghgi=True)
    service._load_run_context = AsyncMock(
        return_value=({"context_bundle": {}}, included_sources)
    )
    service._lease_is_active = AsyncMock(return_value=True)
    service._mark_current_chapter = AsyncMock(return_value=True)
    service._record_completed_count = AsyncMock(return_value=True)
    service._complete_draft = AsyncMock()
    service._fail_draft = AsyncMock()

    await service.draft_all(
        run_id=RUN_ID,
        user_id="user-1",
        build_id=BUILD_ID,
    )

    assert [payload["chapter"]["title"] for payload in payloads] == [
        "Chapter 1",
        "Chapter 2",
    ]
    assert payloads[0]["previous_chapters"] == []
    assert payloads[0]["application_context"]["included_sources"]["ghgi"] is True
    assert payloads[1]["previous_chapters"] == [
        {
            "chapter_ref": "chapter-1",
            "title": "Chapter 1",
            "body_markdown": "Draft for Chapter 1",
        }
    ]
    assert [chapter.body_markdown for chapter in workspace.chapters] == [
        "Draft for Chapter 1",
        "Draft for Chapter 2",
    ]
    service._complete_draft.assert_awaited_once()
    service._fail_draft.assert_not_awaited()
    service._application_context.load_for_run.assert_awaited_once_with(
        service._load_owned_run.return_value,
        included_sources=included_sources,
    )


async def test_recovery_marks_only_stale_running_drafts_retryable(tmp_path) -> None:
    """Recover an interrupted lease without disturbing recent or complete drafts."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'chapter-drafts.db').as_posix()}"
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[ConceptNoteRun.__table__],
            )
        )

    now = datetime.now(UTC)

    def run(status: str, updated_at: datetime) -> ConceptNoteRun:
        return ConceptNoteRun(
            run_id=uuid4(),
            user_id="owner",
            name="Run",
            city_id=str(uuid4()),
            idempotency_key=uuid4(),
            request_fingerprint="a" * 64,
            context_summary={"draft_document": {"status": status}},
            permission_summary={},
            updated_at=updated_at,
        )

    stale = run("running", now - timedelta(hours=2))
    recent = run("running", now - timedelta(minutes=10))
    complete = run("complete", now - timedelta(hours=2))
    try:
        async with session_factory() as session, session.begin():
            session.add_all([stale, recent, complete])

        recovered = await recover_stale_drafts(
            session_factory=session_factory,
            stale_before=now - timedelta(hours=1),
        )

        async with session_factory() as session:
            stored_stale = await session.get(ConceptNoteRun, stale.run_id)
            stored_recent = await session.get(ConceptNoteRun, recent.run_id)
            stored_complete = await session.get(ConceptNoteRun, complete.run_id)
        assert recovered == 1
        assert stored_stale is not None
        assert stored_recent is not None
        assert stored_complete is not None
        stale_progress = stored_stale.context_summary["draft_document"]
        assert stale_progress["status"] == "failed"
        assert stale_progress["error_code"] == "chapter_drafting_interrupted"
        assert stale_progress["retryable"] is True
        assert stored_recent.context_summary["draft_document"]["status"] == "running"
        assert stored_complete.context_summary["draft_document"]["status"] == "complete"
    finally:
        await engine.dispose()


async def test_chapter_drafting_reconciler_runs_until_cancelled(monkeypatch) -> None:
    """Run the drafting recovery on the same periodic pattern as bundle recovery."""
    sleep = AsyncMock(side_effect=[None, asyncio.CancelledError()])
    recover = AsyncMock(return_value=1)
    session_factory = object()
    monkeypatch.setattr("app.services.cnb.chapter_drafting.asyncio.sleep", sleep)
    monkeypatch.setattr(
        "app.services.cnb.chapter_drafting.get_session_factory",
        lambda: session_factory,
    )
    monkeypatch.setattr(
        "app.services.cnb.chapter_drafting.recover_stale_drafts",
        recover,
    )

    with pytest.raises(asyncio.CancelledError):
        await run_chapter_drafting_reconciler(
            interval_seconds=1,
            stale_after=timedelta(hours=1),
        )

    recover.assert_awaited_once()
    assert recover.await_args.kwargs["session_factory"] is session_factory


async def test_completed_draft_start_returns_200(monkeypatch) -> None:
    """Return 200 when the idempotent start does not schedule background work."""
    run = SimpleNamespace(run_id=RUN_ID, user_id="user-1")
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        lambda _: SimpleNamespace(get_authorized_run=authorize),
    )
    schedule = AsyncMock()
    monkeypatch.setattr(
        "app.routes.concept_note_runs.schedule_chapter_drafting",
        schedule,
    )
    draft = ConceptNoteDraftResponse(
        run_id=RUN_ID,
        status="complete",
        completed_chapters=1,
        total_chapters=1,
    )
    draft_service = SimpleNamespace(start=AsyncMock(return_value=(draft, None)))
    http_response = Response(status_code=202)

    result = await start_concept_note_drafting(
        run_id=RUN_ID,
        draft_service=draft_service,  # type: ignore[arg-type]
        http_response=http_response,
        user_id="user-1",
        authorization="Bearer token",
        session=AsyncMock(),
    )

    assert result == draft
    assert http_response.status_code == 200
    schedule.assert_not_awaited()


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (ChapterDraftingTemplateError("Template required"), 422),
        (ChapterDraftingRunUnavailableError("Run unavailable"), 404),
        (ChapterDraftingError("Lease conflict"), 409),
    ],
)
async def test_drafting_errors_keep_their_http_status(
    monkeypatch,
    error: ChapterDraftingError,
    expected_status: int,
) -> None:
    """Map each typed drafting failure to its declared HTTP status."""
    run = SimpleNamespace(run_id=RUN_ID, user_id="user-1")
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        lambda _: SimpleNamespace(get_authorized_run=authorize),
    )
    draft_service = SimpleNamespace(start=AsyncMock(side_effect=error))

    with pytest.raises(HTTPException) as exc_info:
        await start_concept_note_drafting(
            run_id=RUN_ID,
            draft_service=draft_service,  # type: ignore[arg-type]
            http_response=Response(status_code=202),
            user_id="user-1",
            authorization="Bearer token",
            session=AsyncMock(),
        )

    assert exc_info.value.status_code == expected_status
