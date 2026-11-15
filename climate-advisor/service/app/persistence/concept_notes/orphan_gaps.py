"""Restore missing question records from existing prose during explicit Sync."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
)
from app.persistence.concept_notes.gaps import _gap_from_output
from app.utils.cnb_information_markers import (
    INFORMATION_NEEDED_PATTERN,
    information_marker_key,
)


async def recover_orphan_information_gaps(session: AsyncSession, run_id: UUID) -> int:
    """Add conservative open questions without altering prose or historical answers.

    The caller must already hold the workspace lock. Lock chapters in UUID order
    before reading their latest immutable bodies. Recovery keys identify local
    questions only; they never assert a canonical point mapping or source fact.
    """
    chapters = await session.scalars(
        select(ConceptNoteChapter)
        .where(
            ConceptNoteChapter.run_id == run_id, ConceptNoteChapter.status != "deleted"
        )
        .order_by(ConceptNoteChapter.chapter_id)
        .with_for_update()
    )
    added = 0
    for chapter in chapters:
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        if latest is None:
            continue
        gaps = list(
            await session.scalars(
                select(ConceptNoteGap)
                .where(ConceptNoteGap.chapter_id == chapter.chapter_id)
                .with_for_update()
            )
        )
        active = {
            information_marker_key(gap.question)
            for gap in gaps
            if gap.status in {"open", "processing", "caveat"}
        }
        used_keys = {gap.field_key for gap in gaps}
        for marker in INFORMATION_NEEDED_PATTERN.finditer(latest.body_markdown):
            question = marker.group(1).strip()
            question_key = information_marker_key(question)
            if question_key in active:
                continue
            base_key = (
                "recovered_marker."
                + hashlib.sha256(question_key.encode()).hexdigest()[:32]
            )
            field_key, suffix = base_key, 1
            while field_key in used_keys:
                suffix += 1
                field_key = f"{base_key}.{suffix}"
            output = ConceptNoteDraftGapOutput(
                field_key=field_key,
                question=question,
                severity="critical",
                why_asking=(
                    "This question is already present in the chapter, but its structured "
                    "record was missing. Its canonical field mapping is unknown. "
                    "Confirm the answer before removing the information-needed marker."
                ),
            )
            session.add(_gap_from_output(chapter, output))
            chapter.status = "needs_review"
            chapter.updated_at = datetime.now(UTC)
            active.add(question_key)
            used_keys.add(field_key)
            added += 1
    await session.flush()
    return added
