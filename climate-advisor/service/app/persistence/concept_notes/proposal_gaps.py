"""Retain generated gap definitions privately until their chapter edit is accepted."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
from app.models.db.cnb_workspace import ConceptNoteChapter
from app.persistence.concept_notes.gaps import _chapter_gaps, _reconcile_evidence_gaps
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
)

GENERATED_GAPS_KEY = "generated_gaps_by_chapter"


async def apply_generated_gaps(
    session: AsyncSession,
    *,
    scope: dict,
    chapter: ConceptNoteChapter,
    body: str,
) -> None:
    """Materialize only visible gaps for an accepted chapter, within its edit transaction.

    Other chapters and rejected changes contribute nothing. Existing unresolved
    markers may survive a partial acceptance; removed markers have already been
    resolved by the normal edit path. Closed gaps absent from this body stay closed.
    """
    if GENERATED_GAPS_KEY not in scope:
        return
    definitions = scope[GENERATED_GAPS_KEY]
    if not isinstance(definitions, dict) or str(chapter.chapter_id) not in definitions:
        raise ValueError("Generated gap metadata is missing for the accepted chapter")
    outputs = [
        ConceptNoteDraftGapOutput.model_validate(value)
        for value in definitions[str(chapter.chapter_id)]
    ]
    marker_keys = {
        information_marker_key(marker) for marker in information_needed_markers(body)
    }
    outputs = [
        output
        for output in outputs
        if information_marker_key(output.question) in marker_keys
    ]
    existing = await _chapter_gaps(session, chapter.chapter_id)
    known_keys = {
        information_marker_key(gap.question)
        for gap in existing
        if gap.status in {"open", "processing", "caveat"}
    } | {information_marker_key(output.question) for output in outputs}
    if marker_keys - known_keys:
        raise ValueError(
            "Accepted information markers must have structured gap metadata"
        )
    _reconcile_evidence_gaps(session, chapter, existing, outputs, [], set())
    await session.flush()
