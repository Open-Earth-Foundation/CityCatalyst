"""Compact current workspace facts for CNB navigation guidance."""

import logging
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceChapterSnapshot,
)

logger = logging.getLogger(__name__)


def build_ui_state(chapters: list[WorkspaceChapterSnapshot]) -> dict[str, object]:
    """Expose known draft/blocker facts without guessing browser-only state."""
    active = [chapter for chapter in chapters if chapter.status != "deleted"]
    has_draft = any((chapter.body_markdown or "").strip() for chapter in active)
    critical_gaps = sum(
        gap.severity == "critical" and gap.state in {"open", "processing"}
        for chapter in active
        for gap in chapter.gaps
    )
    blockers = []
    if not has_draft:
        blockers.append("No generated draft")
    if critical_gaps:
        blockers.append(
            f"{critical_gaps} critical gaps; fill through reviewed chat edits"
        )

    # Browser acknowledgement, loading state, and selected tab are not persisted.
    return {
        "version": "cnb-desktop-v1",
        "active_tab": None,
        "draft": {"exists": has_draft, "chapters": len(active)},
        "pending_proposal": None,
        "export": {
            "enabled": False if blockers else None,
            "blockers": blockers,
            "missing_upload_blocks_export": False,
        },
        "review": {"failed_chapters": None, "failure_blocks_export": None},
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
