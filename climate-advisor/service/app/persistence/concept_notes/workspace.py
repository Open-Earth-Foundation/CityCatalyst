"""Persistence for the chapter-by-chapter Concept Note workspace."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteEvidenceLink,
    ConceptNoteExport,
    ConceptNoteGap,
    ConceptNoteMatchedProject,
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


@dataclass(frozen=True)
class WorkspaceCopyResult:
    """Counts needed to publish a duplicated run's draft progress."""

    completed_chapters: int
    total_chapters: int


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

    async def copy_working_copy(
        self,
        *,
        source_run_id: UUID,
        destination_run_id: UUID,
    ) -> WorkspaceCopyResult:
        """Replace a destination with an independent copy of current workspace state."""
        async with self._session_factory() as session, session.begin():
            # Make retries deterministic after any earlier transaction failure.
            await _delete_workspace_rows(session, destination_run_id)
            source_chapters = list(
                (
                    await session.scalars(
                        select(ConceptNoteChapter)
                        .where(
                            ConceptNoteChapter.run_id == source_run_id,
                            ConceptNoteChapter.status != "deleted",
                        )
                        .order_by(
                            ConceptNoteChapter.position.asc(),
                            ConceptNoteChapter.chapter_id.asc(),
                        )
                    )
                ).all()
            )
            chapter_map: dict[UUID, UUID] = {}
            completed_chapters = 0

            # Copy chapter metadata and only the latest body as revision one.
            for source_chapter in source_chapters:
                destination_chapter = ConceptNoteChapter(
                    run_id=destination_run_id,
                    template_section_id=source_chapter.template_section_id,
                    title=source_chapter.title,
                    position=source_chapter.position,
                    status=source_chapter.status,
                    required=source_chapter.required,
                    user_locked=source_chapter.user_locked,
                )
                session.add(destination_chapter)
                await session.flush()
                chapter_map[source_chapter.chapter_id] = destination_chapter.chapter_id

                latest = await _latest_revision(session, source_chapter.chapter_id)
                if latest is not None:
                    session.add(
                        ConceptNoteChapterRevision(
                            chapter_id=destination_chapter.chapter_id,
                            revision_number=1,
                            author_type="system",
                            change_type="draft",
                            body_markdown=latest.body_markdown,
                            patch_summary={
                                "duplicated_from_revision_id": str(latest.revision_id)
                            },
                        )
                    )
                    completed_chapters += 1

                evidence_links = list(
                    (
                        await session.scalars(
                            select(ConceptNoteEvidenceLink).where(
                                ConceptNoteEvidenceLink.chapter_id
                                == source_chapter.chapter_id
                            )
                        )
                    ).all()
                )
                for evidence in evidence_links:
                    session.add(
                        ConceptNoteEvidenceLink(
                            chapter_id=destination_chapter.chapter_id,
                            selected_source_label=evidence.selected_source_label,
                            source_location=evidence.source_location,
                            claim_ref=evidence.claim_ref,
                            quote_or_summary=evidence.quote_or_summary,
                        )
                    )

            # Copy run-scoped gaps and remap any chapter relationship.
            gaps = list(
                (
                    await session.scalars(
                        select(ConceptNoteGap).where(
                            ConceptNoteGap.run_id == source_run_id
                        )
                    )
                ).all()
            )
            for gap in gaps:
                session.add(
                    ConceptNoteGap(
                        run_id=destination_run_id,
                        chapter_id=(
                            chapter_map.get(gap.chapter_id)
                            if gap.chapter_id is not None
                            else None
                        ),
                        field_key=gap.field_key,
                        severity=gap.severity,
                        reason=gap.reason,
                        status=gap.status,
                    )
                )

            # Copy selected project matches as independent mutable rows.
            matches = list(
                (
                    await session.scalars(
                        select(ConceptNoteMatchedProject).where(
                            ConceptNoteMatchedProject.run_id == source_run_id
                        )
                    )
                ).all()
            )
            for match in matches:
                session.add(
                    ConceptNoteMatchedProject(
                        run_id=destination_run_id,
                        funded_project_id=match.funded_project_id,
                        decision=match.decision,
                        fit_rationale=match.fit_rationale,
                        matched_tags=deepcopy(match.matched_tags),
                        evidence=deepcopy(match.evidence),
                        caveats=deepcopy(match.caveats),
                    )
                )

            return WorkspaceCopyResult(
                completed_chapters=completed_chapters,
                total_chapters=len(source_chapters),
            )

    async def delete_run(self, *, run_id: UUID) -> None:
        """Delete every managed workspace row owned by one CA run."""
        async with self._session_factory() as session, session.begin():
            await _delete_workspace_rows(session, run_id)


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


async def _delete_workspace_rows(session: AsyncSession, run_id: UUID) -> None:
    """Delete one run's workspace in explicit dependency order."""
    chapter_ids = list(
        (
            await session.scalars(
                select(ConceptNoteChapter.chapter_id).where(
                    ConceptNoteChapter.run_id == run_id
                )
            )
        ).all()
    )
    if chapter_ids:
        await session.execute(
            delete(ConceptNoteEvidenceLink).where(
                ConceptNoteEvidenceLink.chapter_id.in_(chapter_ids)
            )
        )
        await session.execute(
            delete(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id.in_(chapter_ids)
            )
        )
    await session.execute(
        delete(ConceptNoteExport).where(ConceptNoteExport.run_id == run_id)
    )
    await session.execute(
        delete(ConceptNoteMatchedProject).where(
            ConceptNoteMatchedProject.run_id == run_id
        )
    )
    await session.execute(delete(ConceptNoteGap).where(ConceptNoteGap.run_id == run_id))
    await session.execute(
        delete(ConceptNoteChapter).where(ConceptNoteChapter.run_id == run_id)
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
