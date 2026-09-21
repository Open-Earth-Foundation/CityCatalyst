"""Atomic run structure edits shared by direct controls and chat acceptance."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from uuid import UUID

from app.models.cnb.concept_note_structure import (
    StructureChapter,
    StructureSaveRequest,
    StructureState,
)
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.workspace import (
    WorkspaceChapterSnapshot,
    _latest_revision,
    _snapshot_chapters,
)
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def structure_snapshot(chapters: list[WorkspaceChapterSnapshot]) -> StructureState:
    """Fingerprint metadata and revisions so stale previews cannot overwrite content."""
    # Canonical order binds the preview to the current document.
    ordered = sorted(chapters, key=lambda c: c.position)
    items = [
        StructureChapter(
            chapter_id=c.chapter_id,
            template_section_id=c.chapter_ref,
            required=c.required,
            title=c.title,
            description=c.description or "",
        )
        for c in ordered
    ]
    # Include revisions and locks even when visible metadata is unchanged.
    payload = [
        (item.model_dump(mode="json"), chapter.revision_number, chapter.user_locked)
        for item, chapter in zip(items, ordered, strict=True)
    ]
    fingerprint = hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()
    ).hexdigest()
    return StructureState(fingerprint=fingerprint, chapters=items)


def validate_structure(
    before: list[StructureChapter], after: list[StructureChapter]
) -> None:
    """Allow all labels/order to change; retain template identities and required flags."""
    # Validate identities before enforcing template membership.
    existing = {c.chapter_id: c for c in before}
    proposed = {c.chapter_id: c for c in after}
    if not after or len(after) > 100 or len(proposed) != len(after):
        raise EditOperationError(
            "invalid_structure",
            "Use 1-100 chapters with unique identities.",
            status_code=422,
        )
    for chapter in before:
        if chapter.chapter_id not in proposed and (
            chapter.required or chapter.template_section_id is not None
        ):
            raise EditOperationError(
                "protected_template",
                "Template chapters can be renamed, described and reordered, but cannot be removed. Remove only custom chapters.",
                status_code=422,
            )
    # Custom insertions cannot impersonate required template chapters.
    for chapter in after:
        prior = existing.get(chapter.chapter_id)
        if prior is None:
            if chapter.required or chapter.template_section_id is not None:
                raise EditOperationError(
                    "protected_template",
                    "New chapters must be custom chapters.",
                    status_code=422,
                )
        elif (chapter.required, chapter.template_section_id) != (
            prior.required,
            prior.template_section_id,
        ):
            raise EditOperationError(
                "protected_template",
                "Chapter identity and template requirements cannot change.",
                status_code=422,
            )


async def save_structure(
    session: AsyncSession,
    run_id: UUID,
    request: StructureSaveRequest,
    *,
    proposal_id: UUID | None = None,
) -> StructureState:
    """Apply under the caller's run lock; rollback every change on any failure."""
    # Lock chapter records before checking the content-aware optimistic fingerprint.
    rows = list(
        (
            await session.scalars(
                select(ConceptNoteChapter)
                .where(ConceptNoteChapter.run_id == run_id)
                .order_by(ConceptNoteChapter.chapter_id)
                .with_for_update()
            )
        ).all()
    )
    current = structure_snapshot(await _snapshot_chapters(session, run_id))
    if request.expected_fingerprint != current.fingerprint:
        raise EditOperationError(
            "stale_structure",
            "The chapter structure or draft changed. Reload the structure and review your changes before saving.",
        )
    if not current.chapters:
        raise EditOperationError(
            "template_unavailable",
            "Select an application template before editing the structure.",
            status_code=422,
        )
    validate_structure(current.chapters, request.chapters)
    if current.chapters == request.chapters:
        return current
    by_id = {c.chapter_id: c for c in rows}
    wanted = {c.chapter_id for c in request.chapters}
    now = datetime.now(UTC)
    # Vacate positions first: the active-position index is immediate, not deferred.
    offset = max((c.position for c in rows), default=0) + len(rows) + 1
    for index, chapter in enumerate(rows):
        if chapter.status != "deleted":
            chapter.position = offset + index
            if chapter.chapter_id not in wanted:
                chapter.status = "deleted"
    await session.flush()
    for position, item in enumerate(request.chapters):
        chapter = by_id.get(item.chapter_id)
        if chapter is not None and chapter.status == "deleted":
            raise EditOperationError(
                "invalid_structure",
                "A deleted chapter cannot be reused as a new chapter.",
                status_code=422,
            )
        if chapter is None:
            # Also reject identities belonging to another run without exposing it.
            if await session.get(ConceptNoteChapter, item.chapter_id) is not None:
                raise EditOperationError(
                    "invalid_structure",
                    "Choose a new custom chapter identity.",
                    status_code=422,
                )
            chapter = ConceptNoteChapter(
                chapter_id=item.chapter_id,
                run_id=run_id,
                title=item.title,
                description=item.description,
                position=position,
                required=False,
                status="empty",
            )
            session.add(chapter)
        else:
            latest = await _latest_revision(session, chapter.chapter_id)
            if latest and chapter.title != item.title:
                # Change only the chapter's own heading, retaining every paragraph/gap.
                pattern = (
                    r"(?m)\A(\s*#{1,2}[ \t]+)(?:\d+[.)][ \t]+)?"
                    + re.escape(chapter.title)
                    + r"[ \t]*(?=\r?$)"
                )
                body = re.sub(
                    pattern,
                    lambda m, title=item.title: m[1] + title,
                    latest.body_markdown,
                    count=1,
                )
                session.add(
                    ConceptNoteChapterRevision(
                        chapter_id=chapter.chapter_id,
                        revision_number=latest.revision_number + 1,
                        author_type="user",
                        change_type="edit_text",
                        body_markdown=body,
                        patch_summary={
                            "structure": True,
                            "previous_title": chapter.title,
                        },
                    )
                )
            chapter.title = item.title
            chapter.description = item.description
            chapter.position = position
            if latest:
                chapter.status = "needs_review"
                chapter.confirmed_revision_id = None
                chapter.user_locked = False
            chapter.updated_at = now
    # Structure affects cross-chapter checks; retain findings but mark them stale.
    ids = [c.chapter_id for c in rows]
    await session.execute(
        update(ConceptNoteChapterValidation)
        .where(ConceptNoteChapterValidation.chapter_id.in_(ids))
        .values(validation_input_fingerprint="0" * 64)
    )
    pending = update(ConceptNoteEditProposal).where(
        ConceptNoteEditProposal.run_id == run_id,
        ConceptNoteEditProposal.status.in_(
            ["processing", "proposed", "partially_applied"]
        ),
    )
    if proposal_id is not None:
        pending = pending.where(ConceptNoteEditProposal.proposal_id != proposal_id)
    await session.execute(
        pending.values(status="stale", error_code="stale_structure", updated_at=now)
    )
    await session.flush()
    logger.info(
        "Saved concept note structure run_id=%s chapters=%s",
        run_id,
        len(request.chapters),
    )
    return structure_snapshot(await _snapshot_chapters(session, run_id))
