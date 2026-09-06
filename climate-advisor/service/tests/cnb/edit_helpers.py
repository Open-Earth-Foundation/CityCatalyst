"""Synthetic, schema-isolated PostgreSQL fixtures for CC-732 acceptance tests."""

from __future__ import annotations

from collections.abc import AsyncIterator
import os
import re
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import pytest
from app.db.cnb import CnbBase
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterReview,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
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
