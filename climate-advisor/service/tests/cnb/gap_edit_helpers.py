"""Shared builders for Concept Note Builder gap-editing tests."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.models.cnb.concept_note_edits import EditProposalRequest, EditScope
from app.persistence.concept_notes.gaps import (
    WorkspaceGapResolutionSnapshot,
    WorkspaceGapSnapshot,
)
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot


def chapter_snapshot(body: str, position: int = 0) -> WorkspaceChapterSnapshot:
    """An unlocked chapter at its first revision, with no gaps attached yet."""
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=None,
        title="Implementation",
        position=position,
        status="needs_review",
        required=True,
        user_locked=False,
        body_markdown=body,
        revision_number=1,
    )


def gap_snapshot(
    question: str,
    *,
    state: str = "open",
    gap_id: UUID | None = None,
    answered: str | None = None,
    original: str | None = None,
    passages: tuple[str, ...] = (),
    resolution: WorkspaceGapResolutionSnapshot | None = None,
) -> WorkspaceGapSnapshot:
    """A structured gap projection with its saved answers and accepted lineage."""
    now = datetime.now(UTC)
    return WorkspaceGapSnapshot(
        gap_id=gap_id or uuid4(),
        field_key="field",
        question=question,
        why_asking="Needed for the chapter.",
        severity="critical",
        state=state,
        suggestions=[],
        source_refs=[],
        version=1,
        resolution=resolution,
        created_at=now,
        updated_at=now,
        answered_so_far=answered,
        original_question=original,
        accepted_passages=passages,
    )


def caveat_gap(question: str, estimate: str) -> WorkspaceGapSnapshot:
    """A gap whose accepted estimate still waits for confirmation."""
    resolution = WorkspaceGapResolutionSnapshot(
        resolution_id=uuid4(),
        action="answer",
        answer=estimate,
        actor_user_id="owner",
        source_refs=[],
        created_at=datetime.now(UTC),
        gap_version=1,
    )
    return gap_snapshot(question, state="caveat", resolution=resolution)


def edit_request(
    instruction: str,
    *,
    chapter: WorkspaceChapterSnapshot | None = None,
    gap: WorkspaceGapSnapshot | None = None,
) -> EditProposalRequest:
    """An edit request, bound to one gap version when a chapter and gap are given."""
    scope = EditScope()
    if gap is not None and chapter is not None:
        scope = EditScope(
            focused_chapter_id=chapter.chapter_id,
            gap_id=gap.gap_id,
            gap_version=gap.version,
        )
    return EditProposalRequest(
        instruction=instruction, scope=scope, idempotency_key=uuid4()
    )


def marker(question: str) -> str:
    """The draft marker that asks ``question``."""
    return f"[Information needed: {question}]"
