"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@dataclass(frozen=True)
class WorkspaceTemplateChapter:
    """One normalized template chapter used to seed a run workspace."""

    chapter_ref: str
    description: str | None
    required: bool
    title: str


@dataclass(frozen=True)
class WorkspaceChapterSnapshot:
    """Detached chapter metadata plus its latest persisted revision."""

    chapter_id: UUID
    chapter_ref: str | None
    title: str
    position: int
    status: str
    required: bool
    user_locked: bool
    body_markdown: str | None
    missing_information: list[str]
    revision_number: int | None


class ConceptNoteWorkspaceRepository:
    """Read and write chapters in the managed CNB database."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._session_factory = session_factory

    async def ensure_template_chapters(
        self,
        *,
        run_id: UUID,
        chapters: list[WorkspaceTemplateChapter],
    ) -> None:
        """Materialize the reviewed template order once for a run."""
        async with self._session_factory() as session, session.begin():
            existing = await session.scalar(
                select(ConceptNoteChapter.chapter_id)
                .where(
                    ConceptNoteChapter.run_id == run_id,
                    ConceptNoteChapter.status != "deleted",
                )
                .limit(1)
            )
            if existing is not None:
                return

            for position, chapter in enumerate(chapters):
                session.add(
                    ConceptNoteChapter(
                        run_id=run_id,
                        template_section_id=chapter.chapter_ref,
                        title=chapter.title,
                        position=position,
                        status="empty",
                        required=chapter.required,
                    )
                )

    async def save_generated_chapter(
        self,
        *,
        chapter_id: UUID,
        body_markdown: str,
        missing_information: list[str],
    ) -> bool:
        """Persist the first agent revision unless the chapter is already drafted."""
        async with self._session_factory() as session, session.begin():
            chapter = await session.get(
                ConceptNoteChapter,
                chapter_id,
                with_for_update=True,
            )
            if chapter is None or chapter.status == "deleted":
                raise ValueError(f"Concept Note chapter {chapter_id} was not found")

            latest = await _latest_revision(session, chapter.chapter_id)
            if latest is not None:
                return False

            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter_id,
                    revision_number=1,
                    author_type="agent",
                    change_type="draft",
                    body_markdown=body_markdown,
                    patch_summary={"missing_information": missing_information},
                )
            )
            await session.execute(
                delete(ConceptNoteGap).where(
                    ConceptNoteGap.chapter_id == chapter_id,
                    ConceptNoteGap.status == "open",
                )
            )
            for missing_item in missing_information:
                session.add(
                    ConceptNoteGap(
                        run_id=chapter.run_id,
                        chapter_id=chapter_id,
                        field_key=None,
                        severity="missing_information",
                        reason=missing_item,
                        status="open",
                    )
                )
            chapter.status = "needs_review" if missing_information else "draft"
            chapter.updated_at = datetime.now(UTC)
            return True

    async def list_chapters(
        self,
        *,
        run_id: UUID,
    ) -> list[WorkspaceChapterSnapshot]:
        """Return active chapters in document order with latest Markdown."""
        async with self._session_factory() as session:
            chapters = list(
                (
                    await session.scalars(
                        select(ConceptNoteChapter)
                        .where(
                            ConceptNoteChapter.run_id == run_id,
                            ConceptNoteChapter.status != "deleted",
                        )
                        .order_by(
                            ConceptNoteChapter.position.asc(),
                            ConceptNoteChapter.chapter_id.asc(),
                        )
                    )
                ).all()
            )
            return [await _snapshot_chapter(session, chapter) for chapter in chapters]


async def _latest_revision(
    session: AsyncSession,
    chapter_id: UUID,
) -> ConceptNoteChapterRevision | None:
    """Load the current immutable revision for a chapter."""
    return await session.scalar(
        select(ConceptNoteChapterRevision)
        .where(ConceptNoteChapterRevision.chapter_id == chapter_id)
        .order_by(ConceptNoteChapterRevision.revision_number.desc())
        .limit(1)
    )


async def _snapshot_chapter(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
) -> WorkspaceChapterSnapshot:
    latest = await _latest_revision(session, chapter.chapter_id)
    gaps = list(
        (
            await session.scalars(
                select(ConceptNoteGap.reason)
                .where(
                    ConceptNoteGap.chapter_id == chapter.chapter_id,
                    ConceptNoteGap.status == "open",
                )
                .order_by(ConceptNoteGap.created_at.asc(), ConceptNoteGap.gap_id.asc())
            )
        ).all()
    )
    return WorkspaceChapterSnapshot(
        chapter_id=chapter.chapter_id,
        chapter_ref=chapter.template_section_id,
        title=chapter.title,
        position=chapter.position,
        status=chapter.status,
        required=chapter.required,
        user_locked=chapter.user_locked,
        body_markdown=latest.body_markdown if latest is not None else None,
        missing_information=gaps,
        revision_number=latest.revision_number if latest is not None else None,
    )


def normalize_template_chapters(
    chapter_schema: list[dict[str, Any]],
) -> list[WorkspaceTemplateChapter]:
    """Coerce reviewed template JSON into deterministic workspace rows."""
    normalized: list[WorkspaceTemplateChapter] = []
    seen_refs: set[str] = set()
    for index, chapter in enumerate(chapter_schema):
        title = str(chapter.get("title") or "").strip() or f"Chapter {index + 1}"
        chapter_ref = (
            str(chapter.get("chapter_ref") or "").strip() or f"chapter-{index + 1}"
        )
        if chapter_ref in seen_refs:
            raise ValueError(f"Duplicate template chapter_ref: {chapter_ref}")
        seen_refs.add(chapter_ref)
        normalized.append(
            WorkspaceTemplateChapter(
                chapter_ref=chapter_ref,
                description=_normalize_optional_text(chapter.get("description")),
                required=chapter.get("required") is True,
                title=title,
            )
        )
    return normalized


def _normalize_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
