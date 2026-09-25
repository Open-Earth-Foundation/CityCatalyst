"""Compact current workspace facts for CNB navigation guidance and gap lookup."""

import logging
from typing import Literal
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceChapterSnapshot,
)

logger = logging.getLogger(__name__)

_OPEN_GAP_STATES = frozenset({"open", "processing"})
GapSeverity = Literal["critical", "noncritical"]


def build_ui_state(chapters: list[WorkspaceChapterSnapshot]) -> dict[str, object]:
    """Expose known draft/blocker facts without guessing browser-only state."""
    active = [chapter for chapter in chapters if chapter.status != "deleted"]
    # Template sections exist before generation; count only those with text as drafted.
    with_content = sum(
        bool((chapter.body_markdown or "").strip()) for chapter in active
    )
    has_draft = with_content > 0
    critical_gaps = sum(
        gap.severity == "critical" and gap.state in _OPEN_GAP_STATES
        for chapter in active
        for gap in chapter.gaps
    )
    blockers = []
    if not has_draft:
        blockers.append("No generated draft")

    # Browser acknowledgement, loading state, and selected tab are not persisted.
    return {
        "version": "cnb-desktop-v1",
        "active_tab": None,
        "draft": {
            "exists": has_draft,
            "total_sections": len(active),
            "sections_with_content": with_content,
        },
        "pending_proposal": None,
        "export": {
            "enabled": False if blockers else None,
            "blockers": blockers,
            "critical_gap_count": critical_gaps,
            "requires_acknowledgement": True if critical_gaps else None,
            "missing_upload_blocks_export": False,
        },
        "review": {"failed_chapters": None, "failure_blocks_export": None},
        # Counts point the agent at concept_note_gaps; questions are loaded on demand.
        "open_gaps_by_chapter": _open_gap_counts(active),
    }


def _open_gap_counts(
    chapters: list[WorkspaceChapterSnapshot],
) -> list[dict[str, object]]:
    """Summarize open gaps per chapter, in document order, omitting clear chapters."""
    counts = []
    for chapter in sorted(chapters, key=lambda item: item.position):
        open_gaps = [gap for gap in chapter.gaps if gap.state in _OPEN_GAP_STATES]
        if open_gaps:
            counts.append(
                {
                    "chapter_position": chapter.position,
                    "chapter": chapter.title,
                    "open": len(open_gaps),
                    "critical": sum(gap.severity == "critical" for gap in open_gaps),
                }
            )
    return counts


def build_gap_list(
    chapters: list[WorkspaceChapterSnapshot],
    *,
    chapter_position: int | None = None,
    severity: GapSeverity | None = None,
    include_closed: bool = False,
) -> dict[str, object]:
    """List missing-information gaps with short, stable `G#` handles.

    Handles follow gap creation order across every chapter, so a gap keeps its
    handle while other gaps are added, filtered out, or closed. Open gaps only
    unless `include_closed`; deleted chapters are never listed.
    """
    # Step 1: number every gap once, independent of the requested filters.
    ordered = sorted(
        (gap for chapter in chapters for gap in chapter.gaps),
        key=lambda gap: (gap.created_at, str(gap.gap_id)),
    )
    handles = {gap.gap_id: f"G{index}" for index, gap in enumerate(ordered, start=1)}

    # Step 2: select the requested gaps in document order.
    active = sorted(
        (chapter for chapter in chapters if chapter.status != "deleted"),
        key=lambda chapter: chapter.position,
    )
    gaps = []
    for chapter in active:
        if chapter_position is not None and chapter.position != chapter_position:
            continue
        for gap in chapter.gaps:
            if not include_closed and gap.state not in _OPEN_GAP_STATES:
                continue
            if severity is not None and gap.severity != severity:
                continue
            gaps.append(
                {
                    "gap": handles[gap.gap_id],
                    "chapter_position": chapter.position,
                    "chapter": chapter.title,
                    "question": gap.question,
                    "why_asking": gap.why_asking,
                    "severity": gap.severity,
                    "state": gap.state,
                }
            )
    return {
        "gaps": gaps,
        "open_total": sum(
            gap.state in _OPEN_GAP_STATES for chapter in active for gap in chapter.gaps
        ),
    }


async def load_ui_state(run_id: UUID) -> dict[str, object] | None:
    """Load current chapters only after the caller authorizes the CA-owned run.

    The CNB workspace is in its own database. Failure must not discard the
    already-authorized evidence bundle or imply that the document is empty.
    """
    try:
        repository = ConceptNoteWorkspaceRepository(get_cnb_reference_session_factory())
        chapters = await repository.list_chapters(run_id=run_id)
        return build_ui_state(chapters)
    except Exception:
        logger.warning("CNB navigation state unavailable", exc_info=True)
        return None


async def load_gap_list(
    run_id: UUID,
    *,
    chapter_position: int | None = None,
    severity: GapSeverity | None = None,
    include_closed: bool = False,
) -> dict[str, object]:
    """Load current chapters and list their gaps; the caller authorizes the run.

    Raises when the separately stored workspace is unavailable, so the tool can
    report the failure instead of implying the note has no gaps.
    """
    repository = ConceptNoteWorkspaceRepository(get_cnb_reference_session_factory())
    chapters = await repository.list_chapters(run_id=run_id)
    return build_gap_list(
        chapters,
        chapter_position=chapter_position,
        severity=severity,
        include_closed=include_closed,
    )
