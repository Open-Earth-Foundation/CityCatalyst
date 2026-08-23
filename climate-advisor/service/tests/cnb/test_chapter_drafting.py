from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, Mock
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
    ConceptNoteChapterConfirmRequest,
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
    ConceptNoteDraftResponse,
    ConceptNoteGapResolveRequest,
    ConceptNoteGapSuggestion,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.routes.concept_note_runs import (
    confirm_concept_note_chapter,
    resolve_concept_note_gap,
    start_concept_note_drafting,
)
from app.services.cnb.chapter_drafting import (
    ChapterDraftingError,
    ChapterDraftingRunUnavailableError,
    ChapterDraftingTemplateError,
    ConceptNoteChapterDraftService,
    _sanitize_generated_output,
    _select_impacted_chapters,
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
        missing_information: list[ConceptNoteDraftGapOutput],
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
                gaps=[],
                revision_id=None,
                revision_number=None,
                confirmed_body_markdown=None,
                confirmed_revision_number=None,
                proposed_revision_number=None,
                regeneration_status="idle",
                regeneration_error=None,
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


def test_only_source_grounded_suggestions_survive_sanitization() -> None:
    """Drop unsupported suggestions while retaining the structured gap itself."""
    generated = ConceptNoteChapterDraftOutput(
        body_markdown="Draft",
        missing_information=[
            ConceptNoteDraftGapOutput(
                field_key="co_financing",
                question="What co-financing is committed?",
                why_asking="The programme requires a contribution.",
                severity="noncritical",
                suggestions=[
                    ConceptNoteGapSuggestion(
                        value="EUR 100,000",
                        source_refs=["budget.xlsx"],
                    ),
                    ConceptNoteGapSuggestion(
                        value="EUR 200,000",
                        source_refs=["unknown-source"],
                    ),
                ],
            )
        ],
    )

    sanitized = _sanitize_generated_output(
        generated,
        {
            "context_bundle": {
                "selected_sources": [
                    {"source_label": "budget.xlsx", "upload_id": "upload-1"}
                ]
            }
        },
    )

    assert [item.value for item in sanitized.missing_information[0].suggestions] == [
        "EUR 100,000"
    ]


def test_source_impact_scan_leaves_unrelated_ready_chapters_unchanged() -> None:
    """Select only a chapter whose durable text overlaps the new source."""
    chapters = [
        WorkspaceChapterSnapshot(
            chapter_id=uuid4(),
            chapter_ref="finance",
            title="Financing plan",
            position=0,
            status="ready",
            required=True,
            user_locked=False,
            body_markdown="The municipal budget provides co-financing.",
            gaps=[],
            revision_id=uuid4(),
            revision_number=2,
            confirmed_body_markdown="The municipal budget provides co-financing.",
            confirmed_revision_number=2,
            proposed_revision_number=None,
            regeneration_status="idle",
            regeneration_error=None,
        ),
        WorkspaceChapterSnapshot(
            chapter_id=uuid4(),
            chapter_ref="governance",
            title="Governance",
            position=1,
            status="ready",
            required=True,
            user_locked=False,
            body_markdown="A steering committee oversees delivery.",
            gaps=[],
            revision_id=uuid4(),
            revision_number=1,
            confirmed_body_markdown="A steering committee oversees delivery.",
            confirmed_revision_number=1,
            proposed_revision_number=None,
            regeneration_status="idle",
            regeneration_error=None,
        ),
    ]

    impacted = _select_impacted_chapters(
        chapters,
        run_context={
            "context_bundle": {
                "selected_sources": [
                    {
                        "upload_id": "upload-1",
                        "source_label": "budget.xlsx",
                        "summary": "The municipal budget confirms co-financing.",
                        "topics": ["finance"],
                        "key_excerpts": [],
                    }
                ]
            }
        },
        source_refs=["budget.xlsx"],
    )

    assert [chapter.chapter_ref for chapter in impacted] == ["finance"]


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


async def test_gap_resolution_authorizes_and_schedules_regeneration(
    monkeypatch,
) -> None:
    """Queue a chapter rewrite only after the owning run accepts the mutation."""
    gap_id = uuid4()
    chapter_id = uuid4()
    resolution_id = uuid4()
    run = SimpleNamespace(run_id=RUN_ID, user_id="user-1")
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        lambda _: SimpleNamespace(get_authorized_run=authorize),
    )
    schedule = Mock()
    monkeypatch.setattr(
        "app.routes.concept_note_runs.schedule_gap_regeneration",
        schedule,
    )
    draft = ConceptNoteDraftResponse(
        run_id=RUN_ID,
        status="complete",
        completed_chapters=1,
        total_chapters=1,
    )
    start = SimpleNamespace(
        chapter_id=chapter_id,
        resolution_id=resolution_id,
        should_regenerate=True,
    )
    draft_service = SimpleNamespace(resolve_gap=AsyncMock(return_value=(draft, start)))
    payload = ConceptNoteGapResolveRequest(
        action="answer",
        answer="The municipality will contribute EUR 100,000.",
        expected_version=1,
        idempotency_key=uuid4(),
    )

    result = await resolve_concept_note_gap(
        run_id=RUN_ID,
        gap_id=gap_id,
        payload=payload,
        draft_service=draft_service,  # type: ignore[arg-type]
        http_response=Response(status_code=202),
        user_id="user-1",
        authorization="Bearer token",
        session=AsyncMock(),
    )

    assert result == draft
    authorize.assert_awaited_once()
    draft_service.resolve_gap.assert_awaited_once_with(
        run=run,
        gap_id=gap_id,
        payload=payload,
    )
    schedule.assert_called_once_with(
        service=draft_service,
        run_id=RUN_ID,
        user_id="user-1",
        chapter_id=chapter_id,
        gap_id=gap_id,
        resolution_id=resolution_id,
    )


async def test_chapter_confirmation_uses_exact_revision_mutation(monkeypatch) -> None:
    """Forward the versioned review request only after run authorization."""
    chapter_id = uuid4()
    run = SimpleNamespace(run_id=RUN_ID, user_id="user-1")
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        lambda _: SimpleNamespace(get_authorized_run=authorize),
    )
    draft = ConceptNoteDraftResponse(
        run_id=RUN_ID,
        status="complete",
        completed_chapters=1,
        total_chapters=1,
    )
    draft_service = SimpleNamespace(confirm_chapter=AsyncMock(return_value=draft))
    payload = ConceptNoteChapterConfirmRequest(
        expected_revision=3,
        idempotency_key=uuid4(),
    )

    result = await confirm_concept_note_chapter(
        run_id=RUN_ID,
        chapter_id=chapter_id,
        payload=payload,
        draft_service=draft_service,  # type: ignore[arg-type]
        user_id="user-1",
        authorization="Bearer token",
        session=AsyncMock(),
    )

    assert result == draft
    authorize.assert_awaited_once()
    draft_service.confirm_chapter.assert_awaited_once_with(
        run=run,
        chapter_id=chapter_id,
        payload=payload,
    )


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
