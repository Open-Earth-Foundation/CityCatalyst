"""Synthetic, schema-isolated PostgreSQL fixtures for CC-732 acceptance tests."""

from __future__ import annotations

import os
import re
from collections.abc import AsyncIterator
from dataclasses import replace
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import pytest
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_edits import (
    EditChange,
    EditPlanOutput,
    EditProposalRequest,
    EditScope,
    PlannedTextChange,
)
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.persistence.concept_notes.edits import ConceptNoteEditRepository
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceChapterSnapshot,
)
from app.services.cnb.edits import ConceptNoteEditService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

RUN_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
CHAPTER_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
OTHER_CHAPTER_ID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
BODY = "## Summary\n\nThe project builds parks. The investment is EUR 10 million."


def database_url() -> str:
    """Require explicitly isolated PostgreSQL, never silently substitute SQLite."""
    url = os.getenv("CNB_EDIT_TEST_DATABASE_URL", "")
    parsed = urlsplit(url)
    if parsed.hostname not in {
        "127.0.0.1",
        "localhost",
        "::1",
    } or not parsed.path.startswith("/cc732_"):
        pytest.fail(
            "CNB_EDIT_TEST_DATABASE_URL must point to an isolated loopback cc732_* database"
        )
    if parsed.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}:
        pytest.fail("The CC-732 concurrency tests require real PostgreSQL")
    return url.replace("postgres://", "postgresql+asyncpg://", 1).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


@pytest.fixture
async def edit_database() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Create and remove only a generated schema inside the owned test database."""
    url = database_url()
    schema = f"cc732_{uuid4().hex}"
    assert re.fullmatch(r"cc732_[a-f0-9]{32}", schema)
    admin = create_async_engine(url, poolclass=NullPool)
    engine = create_async_engine(
        url,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": schema}},
    )
    tables = [
        model.__table__
        for model in (
            ConceptNoteChapter,
            ConceptNoteChapterRevision,
            ConceptNoteChapterReview,
            ConceptNoteGap,
            ConceptNoteGapResolution,
            ConceptNoteEditProposal,
            ConceptNoteEditApplication,
        )
    ]
    async with admin.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda sync: CnbBase.metadata.create_all(sync, tables=tables)
            )
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


async def seed_chapter(
    sessions: async_sessionmaker[AsyncSession],
    *,
    chapter_id: UUID = CHAPTER_ID,
    run_id: UUID = RUN_ID,
    body: str = BODY,
    position: int = 0,
    ready: bool = False,
) -> None:
    """Seed one synthetic full-text revision, optionally exactly confirmed."""
    revision_id = uuid4()
    async with sessions() as session, session.begin():
        chapter = ConceptNoteChapter(
            chapter_id=chapter_id,
            run_id=run_id,
            title="Summary",
            position=position,
            status="ready" if ready else "draft",
            required=True,
        )
        session.add(chapter)
        await session.flush()
        session.add(
            ConceptNoteChapterRevision(
                revision_id=revision_id,
                chapter_id=chapter_id,
                revision_number=1,
                author_type="agent",
                change_type="draft",
                body_markdown=body,
                patch_summary={},
            )
        )
        await session.flush()
        if ready:
            chapter.confirmed_revision_id = revision_id
            session.add(
                ConceptNoteChapterReview(
                    chapter_id=chapter_id,
                    revision_id=revision_id,
                    user_id="owner",
                    idempotency_key=uuid4(),
                )
            )


def snapshot(**overrides) -> WorkspaceChapterSnapshot:
    base = WorkspaceChapterSnapshot(
        chapter_id=CHAPTER_ID,
        chapter_ref="summary",
        title="Summary",
        position=0,
        status="draft",
        required=True,
        user_locked=False,
        body_markdown=BODY,
        gaps=[],
        revision_id=uuid4(),
        revision_number=1,
        confirmed_body_markdown=None,
        confirmed_revision_number=None,
        proposed_revision_number=None,
        regeneration_status="idle",
        regeneration_error=None,
    )
    return replace(base, **overrides)


def request(**overrides) -> EditProposalRequest:
    return EditProposalRequest(
        **{
            "instruction": "Make the parks wording clearer",
            "idempotency_key": uuid4(),
            "scope": EditScope(focused_chapter_id=CHAPTER_ID),
            **overrides,
        }
    )


def plan(**overrides) -> EditPlanOutput:
    change = {
        "chapter_id": CHAPTER_ID,
        "start": BODY.index("builds parks"),
        "before": "builds parks",
        "after": "creates greener parks",
        "kind": "wording",
        "group_id": "clarity",
    }
    return EditPlanOutput(
        intent="edit", changes=[PlannedTextChange(**{**change, **overrides})]
    )


def investment_plan(
    chapters,
    instruction="Change the investment amount to EUR 12 million",
    *,
    omit_last=False,
    source_ref=None,
    quote=True,
):
    changes = []
    for index, chapter in enumerate(chapters[:-1] if omit_last else chapters):
        before = (
            "EUR 10 million"
            if "EUR 10 million" in chapter.body_markdown
            else "€10 million"
        )
        after = "EUR 12 million" if before.startswith("EUR") else "€12 million"
        changes.append(
            PlannedTextChange(
                chapter_id=chapter.chapter_id,
                start=chapter.body_markdown.index(before),
                before=before,
                after=after,
                kind="factual",
                group_id=f"model-group-{index}",
                source_refs=[source_ref] if source_ref else [],
                user_input_quote=instruction if quote else None,
            )
        )
    return EditPlanOutput(intent="edit", changes=changes)


def wording_change(**overrides) -> EditChange:
    values = {
        "change_id": uuid4(),
        "chapter_id": CHAPTER_ID,
        "chapter_title": "Summary",
        "base_revision": 1,
        "start": BODY.index("builds parks"),
        "before": "builds parks",
        "after": "creates greener parks",
        "kind": "wording",
        "group_id": "clarity",
    }
    return EditChange(**{**values, **overrides})


class FakePlanner:
    def __init__(self, output=None, error=None):
        self.output = output or plan()
        self.error = error
        self.calls = 0

    async def plan(self, *args, **kwargs):
        self.calls += 1
        self.prior_proposal = kwargs.get("prior_proposal")
        self.recent_messages = kwargs.get("recent_messages")
        if self.error:
            raise self.error
        return self.output


def service(sessions, planner=None) -> ConceptNoteEditService:
    return ConceptNoteEditService(
        ConceptNoteEditRepository(sessions),
        ConceptNoteWorkspaceRepository(sessions),
        planner or FakePlanner(),
    )
