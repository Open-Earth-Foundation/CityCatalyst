from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID

from app.models.concept_note_application_context import (
    ApplicationContextFunder,
    ApplicationContextOpportunity,
    ApplicationContextTemplate,
    ConceptNoteApplicationContextResponse,
)
from app.models.concept_note_draft import ConceptNoteChapterDraftOutput
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.chapter_drafting import ConceptNoteChapterDraftService

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
    service._load_run_context = AsyncMock(return_value={"context_bundle": {}})
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
