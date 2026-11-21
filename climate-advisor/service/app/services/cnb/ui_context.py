"""Compact current workspace facts for CNB navigation guidance and gap lookup."""

import logging
import math
import re
from typing import Literal
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot

logger = logging.getLogger(__name__)

_OPEN_GAP_STATES = frozenset({"open", "processing"})
GapSeverity = Literal["critical", "noncritical"]

# Same marker syntax and question matching as the draft preview
# (`missingInformationRanges` in draft-markdown.ts, `questionText` in
# chapter-gaps-panel.tsx). Kept separate from `cnb_information_markers`, whose
# looser key ignores punctuation and would number some gaps differently.
_UI_MARKER_PATTERN = re.compile(
    r"\[(Information needed:\s*[^\]\r\n]+)\]", re.IGNORECASE
)
_UI_MARKER_PREFIX = re.compile(r"^information needed:\s*", re.IGNORECASE)


class UnknownChapterNumberError(ValueError):
    """Raised when no active chapter has the requested chapter number."""


def _chapter_number(chapter: WorkspaceChapterSnapshot) -> int:
    """Return the 1-based number the Draft preview shows (`position + 1`)."""
    return chapter.position + 1


def _ui_question_key(text: str) -> str:
    """Normalize a marker or gap question like the UI's `questionText`."""
    return _UI_MARKER_PREFIX.sub("", text, count=1).strip().lower()


def ui_gap_numbers(chapter: WorkspaceChapterSnapshot) -> dict[UUID, int]:
    """Number a chapter's open gaps exactly as its gap popover ("Gap 2") does.

    Mirrors `chapterGapRows` in chapter-gaps-panel.tsx: the rows are the open
    gaps plus one row per marker that matches no gap record (legacy markers),
    ordered by the first matching marker in the chapter text; rows without a
    marker come last. Legacy rows take a number too, so gap numbers can skip.
    Returns gap_id -> number for open gaps only.
    """
    marker_messages = [
        match.group(1).strip()
        for match in _UI_MARKER_PATTERN.finditer(chapter.body_markdown or "")
    ]
    marker_keys = [_ui_question_key(message) for message in marker_messages]
    # Step 1: open gaps in API order, then markers no gap record (any state) claims.
    rows: list[tuple[str, UUID | None]] = [
        (gap.question, gap.gap_id)
        for gap in chapter.gaps
        if gap.state in _OPEN_GAP_STATES
    ]
    claimed = {_ui_question_key(gap.question) for gap in chapter.gaps}
    for message, key in zip(marker_messages, marker_keys, strict=True):
        if key not in claimed:
            # Like the UI, a legacy row's question is the message without its prefix.
            question = _UI_MARKER_PREFIX.sub("", message, count=1).strip()
            rows.append((question, None))
            claimed.add(_ui_question_key(question))

    # Step 2: stable sort by the first matching marker, unmatched rows last.
    def marker_index(row: tuple[str, UUID | None]) -> int:
        key = _ui_question_key(row[0])
        return marker_keys.index(key) if key in marker_keys else len(marker_keys)

    rows.sort(key=marker_index)
    return {
        gap_id: number
        for number, (_, gap_id) in enumerate(rows, start=1)
        if gap_id is not None
    }


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
    """Summarize open gaps per chapter, in document order, omitting clear chapters.

    `required` counts critical gaps, which the gap popover labels "Required".
    """
    counts = []
    for chapter in sorted(chapters, key=lambda item: item.position):
        open_gaps = [gap for gap in chapter.gaps if gap.state in _OPEN_GAP_STATES]
        if open_gaps:
            counts.append(
                {
                    "chapter_number": _chapter_number(chapter),
                    "chapter": chapter.title,
                    "open": len(open_gaps),
                    "required": sum(gap.severity == "critical" for gap in open_gaps),
                }
            )
    return counts


def build_gap_list(
    chapters: list[WorkspaceChapterSnapshot],
    *,
    chapter_number: int | None = None,
    severity: GapSeverity | None = None,
    include_closed: bool = False,
) -> dict[str, object]:
    """List missing-information gaps with the numbers the Draft preview shows.

    Each gap has its chapter's `chapter_number`, its per-chapter `gap_number`
    (null once closed, because the draft no longer shows it), and the UI
    `label` of its severity. Gaps are listed in document order, then gap
    number. Open gaps only unless `include_closed`; deleted chapters are never
    listed. Raises UnknownChapterNumberError, naming the valid chapters, when
    `chapter_number` matches no active chapter.
    """
    active = sorted(
        (chapter for chapter in chapters if chapter.status != "deleted"),
        key=lambda chapter: chapter.position,
    )
    # Step 1: resolve the requested chapter; a wrong number must not look empty.
    selected = active
    if chapter_number is not None:
        selected = [c for c in active if _chapter_number(c) == chapter_number]
        if not selected:
            valid = ", ".join(f'{_chapter_number(c)} "{c.title}"' for c in active)
            raise UnknownChapterNumberError(
                f"No chapter {chapter_number}. Chapters: {valid or 'none'}."
            )

    # Step 2: list the requested gaps in the order the draft numbers them.
    gaps = []
    for chapter in selected:
        numbers = ui_gap_numbers(chapter)
        ordered = sorted(
            chapter.gaps, key=lambda gap: numbers.get(gap.gap_id, math.inf)
        )
        for gap in ordered:
            if not include_closed and gap.state not in _OPEN_GAP_STATES:
                continue
            if severity is not None and gap.severity != severity:
                continue
            item = {
                "chapter_number": _chapter_number(chapter),
                "chapter": chapter.title,
                "gap_number": numbers.get(gap.gap_id),
                "question": gap.question,
                "why_asking": gap.why_asking,
                "severity": gap.severity,
                # The en label the gap popover shows (`severityKey` in the UI).
                "label": "Required" if gap.severity == "critical" else "Optional",
                "state": gap.state,
            }
            # Unverified values the drafter found in uploaded sources for this gap.
            if gap.state in _OPEN_GAP_STATES and gap.suggestions:
                item["suggestions"] = gap.suggestions
            # Name the files whose evidence filled a gap during source revalidation.
            resolution = gap.resolution
            if (
                gap.state == "resolved"
                and resolution is not None
                and resolution.action == "evidence_update"
            ):
                item["filled_from"] = resolution.source_refs
            gaps.append(item)
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
    chapter_number: int | None = None,
    severity: GapSeverity | None = None,
    include_closed: bool = False,
) -> dict[str, object]:
    """Load current chapters and list their gaps; the caller authorizes the run.

    Raises when the separately stored workspace is unavailable, so the tool can
    report the failure instead of implying the note has no gaps, and raises
    UnknownChapterNumberError for a chapter number the draft does not show.
    """
    repository = ConceptNoteWorkspaceRepository(get_cnb_reference_session_factory())
    chapters = await repository.list_chapters(run_id=run_id)
    return build_gap_list(
        chapters,
        chapter_number=chapter_number,
        severity=severity,
        include_closed=include_closed,
    )
