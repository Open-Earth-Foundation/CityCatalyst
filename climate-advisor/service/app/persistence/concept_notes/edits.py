"""Run-owned proposal persistence and explicit, optimistic edit transactions."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.cnb.concept_note_edits import (
    EditApplicationResult,
    EditApplyRequest,
    EditChange,
    EditProposalRequest,
    EditProposalResponse,
)
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.utils.cnb_information_markers import (
    information_marker_key,
    information_needed_markers,
    marker_replacement_text,
    removed_information_markers,
)

logger = logging.getLogger(__name__)


class EditOperationError(Exception):
    """A safe, machine-readable edit failure exposed at the API boundary."""

    def __init__(self, code: str, message: str, *, status_code: int = 409) -> None:
        """Retain an allowlisted failure category without private document text."""
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ConceptNoteEditRepository:
    """Store proposals independently; append revisions only for explicit acceptance."""

    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        """Use the existing managed CNB session factory."""
        self._sessions = sessions

    async def start(
        self,
        *,
        run_id: UUID,
        user_id: str,
        request: EditProposalRequest,
    ) -> tuple[EditProposalResponse, bool]:
        """Create one durable processing record or replay the identical request."""
        fingerprint = request_fingerprint(request)
        async with self._sessions() as session, session.begin():
            # Let the unique index arbitrate simultaneous idempotent submissions.
            proposal_id = await session.scalar(
                insert(ConceptNoteEditProposal)
                .values(
                    proposal_id=uuid4(),
                    run_id=run_id,
                    actor_user_id=user_id,
                    idempotency_key=request.idempotency_key,
                    request_fingerprint=fingerprint,
                    instruction=request.instruction,
                    scope=request.scope.model_dump(mode="json"),
                )
                .on_conflict_do_nothing(
                    constraint="uq_cnb_edit_proposals_idempotency",
                )
                .returning(ConceptNoteEditProposal.proposal_id)
            )
            row = await session.scalar(
                select(ConceptNoteEditProposal).where(
                    ConceptNoteEditProposal.run_id == run_id,
                    ConceptNoteEditProposal.actor_user_id == user_id,
                    ConceptNoteEditProposal.idempotency_key == request.idempotency_key,
                )
            )
            assert row is not None
            if row.request_fingerprint != fingerprint:
                raise EditOperationError(
                    "idempotency_key_reused",
                    "This request key was already used for different edit instructions.",
                )
            return to_response(row), proposal_id is not None

    async def finish(
        self,
        *,
        run_id: UUID,
        user_id: str,
        proposal_id: UUID,
        base_revisions: dict[UUID, int],
        changes: list[EditChange],
        clarification: str | None = None,
        error_code: str | None = None,
    ) -> EditProposalResponse:
        """Finalize a processing proposal without reviving a concurrent rejection."""
        async with self._sessions() as session, session.begin():
            row = await require_proposal(
                session, run_id, user_id, proposal_id, lock=True
            )
            if row.status != "processing":
                return to_response(row)
            row.base_revisions = {
                str(key): value for key, value in base_revisions.items()
            }
            row.changes = [change.model_dump(mode="json") for change in changes]
            row.clarification = clarification
            row.error_code = error_code
            row.status = (
                "clarification_required"
                if clarification
                else "failed"
                if error_code
                else "proposed"
            )
            row.updated_at = datetime.now(UTC)
            return to_response(row)

    async def get(
        self, *, run_id: UUID, user_id: str, proposal_id: UUID
    ) -> EditProposalResponse:
        """Return one proposal only within its run and owner scope."""
        async with self._sessions() as session:
            return to_response(
                await require_proposal(session, run_id, user_id, proposal_id)
            )

    async def list(self, *, run_id: UUID, user_id: str) -> list[EditProposalResponse]:
        """Restore the most recent proposal states after reload or reconnect."""
        async with self._sessions() as session, session.begin():
            await session.execute(
                update(ConceptNoteEditProposal)
                .where(
                    ConceptNoteEditProposal.run_id == run_id,
                    ConceptNoteEditProposal.actor_user_id == user_id,
                    ConceptNoteEditProposal.status == "processing",
                    ConceptNoteEditProposal.updated_at
                    < datetime.now(UTC) - timedelta(minutes=10),
                )
                .values(
                    status="failed",
                    error_code="planning_interrupted",
                    updated_at=datetime.now(UTC),
                )
            )
            recent = (
                select(ConceptNoteEditProposal.proposal_id)
                .where(
                    ConceptNoteEditProposal.run_id == run_id,
                    ConceptNoteEditProposal.actor_user_id == user_id,
                )
                .order_by(
                    ConceptNoteEditProposal.created_at.desc(),
                    ConceptNoteEditProposal.proposal_id.desc(),
                )
                .limit(100)
            )
            rows = await session.scalars(
                select(ConceptNoteEditProposal)
                .where(
                    ConceptNoteEditProposal.run_id == run_id,
                    ConceptNoteEditProposal.actor_user_id == user_id,
                    or_(
                        ConceptNoteEditProposal.proposal_id.in_(recent),
                        ConceptNoteEditProposal.status.in_(
                            [
                                "processing",
                                "proposed",
                                "clarification_required",
                                "failed",
                                "stale",
                            ]
                        ),
                    ),
                )
                .order_by(
                    ConceptNoteEditProposal.created_at.desc(),
                    ConceptNoteEditProposal.proposal_id.desc(),
                )
            )
            return [to_response(row) for row in rows]

    async def mark_stale(
        self, *, run_id: UUID, user_id: str, proposal_id: UUID
    ) -> EditProposalResponse:
        """Invalidate a pending proposal after its immutable source context changed."""
        async with self._sessions() as session, session.begin():
            row = await require_proposal(
                session, run_id, user_id, proposal_id, lock=True
            )
            if row.status == "proposed":
                row.status = "stale"
                row.error_code = "source_changed"
                row.updated_at = datetime.now(UTC)
            return to_response(row)

    async def reject(
        self, *, run_id: UUID, user_id: str, proposal_id: UUID
    ) -> EditProposalResponse:
        """Reject or cancel a proposal without writing any chapter revision."""
        async with self._sessions() as session, session.begin():
            row = await require_proposal(
                session, run_id, user_id, proposal_id, lock=True
            )
            if row.status in {"applied", "partially_applied"}:
                raise EditOperationError(
                    "already_applied",
                    "This proposal was applied; use revision history to undo it.",
                )
            if row.status != "rejected":
                row.status = "rejected"
                row.updated_at = datetime.now(UTC)
            return to_response(row)

    async def apply(
        self,
        *,
        run_id: UUID,
        user_id: str,
        proposal_id: UUID,
        request: EditApplyRequest,
    ) -> EditProposalResponse:
        """Append an entire accepted set and history in one run-serialized transaction."""
        fingerprint = request_fingerprint(request)
        async with self._sessions() as session, session.begin():
            # Serialize run history, then lock all chapter rows in stable UUID order.
            await lock_run(session, run_id)
            row = await require_proposal(
                session, run_id, user_id, proposal_id, lock=True
            )
            if row.apply_key == request.idempotency_key:
                if row.apply_fingerprint != fingerprint:
                    raise EditOperationError(
                        "idempotency_key_reused",
                        "This apply key was already used for different acceptance decisions.",
                    )
                return to_response(row)
            if row.status != "proposed":
                raise EditOperationError(
                    "proposal_not_pending",
                    "This proposal is no longer awaiting review.",
                )
            await replay_application(
                session,
                run_id,
                user_id,
                request.idempotency_key,
                fingerprint,
                "apply",
                proposal_id,
            )
            proposal = to_response(row)
            if request.expected_revisions != proposal.base_revisions:
                raise EditOperationError(
                    "revision_vector_mismatch",
                    "Reload the proposal before accepting its exact revisions.",
                )
            selected = accepted_changes(proposal.changes, request.selected_change_ids)
            locked = await locked_revisions(session, run_id, proposal.base_revisions)
            if locked is None:
                row.status = "stale"
                row.error_code = "stale_base"
                row.updated_at = datetime.now(UTC)
            else:
                before: dict[str, int] = {}
                after: dict[str, int] = {}
                for chapter, latest in sorted(
                    locked.values(), key=lambda pair: pair[0].position
                ):
                    changes = [
                        change
                        for change in selected
                        if change.chapter_id == chapter.chapter_id
                    ]
                    if not changes:
                        continue
                    body = replace_anchors(latest.body_markdown, changes)
                    await resolve_filled_information_gaps(
                        session,
                        chapter=chapter,
                        before=latest.body_markdown,
                        after=body,
                        changes=changes,
                        user_id=user_id,
                        idempotency_key=request.idempotency_key,
                    )
                    revision = await append_revision(
                        session,
                        chapter,
                        latest,
                        body=body,
                        user_id=user_id,
                        idempotency_key=request.idempotency_key,
                        preserve_ready=chapter.status == "ready"
                        and chapter.confirmed_revision_id == latest.revision_id
                        and all(change.kind == "wording" for change in changes),
                        patch_summary={
                            "proposal_id": str(proposal_id),
                            "changes": [
                                change.model_dump(mode="json") for change in changes
                            ],
                        },
                    )
                    before[str(chapter.chapter_id)] = latest.revision_number
                    after[str(chapter.chapter_id)] = revision.revision_number
                history = await save_application(
                    session,
                    run_id=run_id,
                    user_id=user_id,
                    operation="apply",
                    proposal_id=proposal_id,
                    target_id=None,
                    idempotency_key=request.idempotency_key,
                    fingerprint=fingerprint,
                    before=before,
                    after=after,
                    change_ids=[str(change.change_id) for change in selected],
                )
                row.status = (
                    "applied"
                    if len(selected) == len(proposal.changes)
                    else "partially_applied"
                )
                row.apply_key = request.idempotency_key
                row.apply_fingerprint = fingerprint
                row.updated_at = datetime.now(UTC)
                row.applied_result = EditApplicationResult(
                    application_id=history.application_id,
                    accepted_change_ids=[change.change_id for change in selected],
                    revisions=after,
                ).model_dump(mode="json")
            response = to_response(row)
        if response.status == "stale":
            raise EditOperationError(
                "stale_base",
                "The draft changed. Generate a fresh proposal before applying.",
            )
        logger.info(
            "Concept Note edit applied run_id=%s proposal_id=%s", run_id, proposal_id
        )
        return response


async def resolve_filled_information_gaps(
    session: AsyncSession,
    *,
    chapter: ConceptNoteChapter,
    before: str,
    after: str,
    changes: list[EditChange],
    user_id: str,
    idempotency_key: UUID,
) -> None:
    """Close structured gaps whose accepted grounded edits replace their markers."""
    removed = removed_information_markers(before, after)
    if not removed:
        return

    gaps = list(
        (
            await session.scalars(
                select(ConceptNoteGap)
                .where(
                    ConceptNoteGap.chapter_id == chapter.chapter_id,
                    ConceptNoteGap.status.in_(["open", "caveat"]),
                )
                .with_for_update()
            )
        ).all()
    )
    gaps_by_key = {information_marker_key(gap.question): gap for gap in gaps}
    now = datetime.now(UTC)
    resolved_gap_ids: set[UUID] = set()
    for marker in removed:
        gap = gaps_by_key.get(information_marker_key(marker))
        change = next(
            (
                change
                for change in changes
                if marker in change.before
                and marker not in change.after
                and marker_replacement_text(change.after)
            ),
            None,
        )
        if gap is None or change is None:
            raise EditOperationError(
                "stale_gap",
                "The information gap changed. Generate a fresh proposal before applying.",
            )
        if gap.gap_id in resolved_gap_ids:
            continue
        gap.status = "resolved"
        gap.version += 1
        gap.updated_at = now
        session.add(
            ConceptNoteGapResolution(
                gap_id=gap.gap_id,
                action="answer",
                answer=marker_replacement_text(change.after),
                actor_user_id=user_id,
                source_refs=list(dict.fromkeys(change.source_refs)),
                idempotency_key=idempotency_key,
            )
        )
        resolved_gap_ids.add(gap.gap_id)


async def lock_run(session: AsyncSession, run_id: UUID) -> None:
    """Serialize the run-local history sequence without locking unrelated runs."""
    key = int.from_bytes(
        hashlib.sha256(f"cnb-edit:{run_id}".encode()).digest()[:8], "big", signed=True
    )
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def accepted_changes(
    changes: list[EditChange], selected_ids: list[UUID] | None
) -> list[EditChange]:
    """Return a non-empty selection containing complete consistency groups."""
    selected = (
        set(selected_ids)
        if selected_ids is not None
        else {change.change_id for change in changes}
    )
    if not selected or selected - {change.change_id for change in changes}:
        raise EditOperationError(
            "invalid_selection",
            "Select one or more changes from this proposal.",
            status_code=422,
        )
    selected_groups = {
        change.group_id for change in changes if change.change_id in selected
    }
    if any(
        change.change_id not in selected and change.group_id in selected_groups
        for change in changes
    ):
        raise EditOperationError(
            "invalid_selection",
            "Select all changes in each consistency group.",
            status_code=422,
        )
    return [change for change in changes if change.change_id in selected]


async def locked_revisions(
    session: AsyncSession, run_id: UUID, expected: dict[UUID, int]
) -> dict[UUID, tuple[ConceptNoteChapter, ConceptNoteChapterRevision]] | None:
    """Lock in UUID order and validate the entire planned base before any writes."""
    chapters = await session.scalars(
        select(ConceptNoteChapter)
        .where(
            ConceptNoteChapter.run_id == run_id,
            ConceptNoteChapter.chapter_id.in_(expected),
            ConceptNoteChapter.status != "deleted",
        )
        .order_by(ConceptNoteChapter.chapter_id)
        .with_for_update()
    )
    result = {}
    for chapter in chapters:
        latest = await latest_revision(session, chapter.chapter_id)
        if latest is None or latest.revision_number != expected[chapter.chapter_id]:
            return None
        result[chapter.chapter_id] = (chapter, latest)
    return result if len(result) == len(expected) else None


async def append_revision(
    session: AsyncSession,
    chapter: ConceptNoteChapter,
    latest: ConceptNoteChapterRevision,
    *,
    body: str,
    user_id: str,
    idempotency_key: UUID,
    preserve_ready: bool,
    patch_summary: dict,
) -> ConceptNoteChapterRevision:
    """Append an accepted revision and a coherent exact confirmation when justified."""
    if chapter.user_locked:
        raise EditOperationError(
            "chapter_unavailable",
            "The chapter is locked; unlock it before applying edits.",
        )
    has_open_gaps = await session.scalar(
        select(ConceptNoteGap.gap_id)
        .where(
            ConceptNoteGap.chapter_id == chapter.chapter_id,
            ConceptNoteGap.status.in_(["open", "processing"]),
        )
        .limit(1)
    )
    revision = ConceptNoteChapterRevision(
        revision_id=uuid4(),
        chapter_id=chapter.chapter_id,
        revision_number=latest.revision_number + 1,
        author_type="user",
        change_type="edit_text",
        body_markdown=body,
        patch_summary=patch_summary,
    )
    session.add(revision)
    await session.flush()
    keep_ready = (
        preserve_ready and not has_open_gaps and not information_needed_markers(body)
    )
    if keep_ready:
        chapter.confirmed_revision_id = revision.revision_id
        session.add(
            ConceptNoteChapterReview(
                chapter_id=chapter.chapter_id,
                revision_id=revision.revision_id,
                user_id=user_id,
                idempotency_key=idempotency_key,
            )
        )
    chapter.status = (
        "ready" if keep_ready else "needs_review" if has_open_gaps else "draft"
    )
    chapter.updated_at = datetime.now(UTC)
    return revision


async def save_application(
    session: AsyncSession,
    *,
    run_id: UUID,
    user_id: str,
    operation: str,
    proposal_id: UUID | None,
    target_id: UUID | None,
    idempotency_key: UUID,
    fingerprint: str,
    before: dict[str, int],
    after: dict[str, int],
    change_ids: list[str],
) -> ConceptNoteEditApplication:
    """Append a durable batch result under the held run history lock."""
    sequence = await session.scalar(
        select(func.max(ConceptNoteEditApplication.sequence)).where(
            ConceptNoteEditApplication.run_id == run_id
        )
    )
    row = ConceptNoteEditApplication(
        application_id=uuid4(),
        run_id=run_id,
        actor_user_id=user_id,
        proposal_id=proposal_id,
        restores_application_id=target_id,
        sequence=(sequence or 0) + 1,
        operation=operation,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
        before_revisions=before,
        after_revisions=after,
        accepted_change_ids=change_ids,
    )
    session.add(row)
    await session.flush()
    return row


async def replay_application(
    session: AsyncSession,
    run_id: UUID,
    user_id: str,
    key: UUID,
    fingerprint: str,
    operation: str,
    target_id: UUID,
) -> ConceptNoteEditApplication | None:
    """Replay only the same operation/target/decision; cross-operation key reuse fails."""
    row = await session.scalar(
        select(ConceptNoteEditApplication).where(
            ConceptNoteEditApplication.run_id == run_id,
            ConceptNoteEditApplication.actor_user_id == user_id,
            ConceptNoteEditApplication.idempotency_key == key,
        )
    )
    if row is not None and (
        row.operation != operation
        or row.request_fingerprint != fingerprint
        or (row.proposal_id if operation == "apply" else row.restores_application_id)
        != target_id
    ):
        raise EditOperationError(
            "idempotency_key_reused",
            "This key was already used for another revision operation.",
        )
    return row


def request_fingerprint(request: BaseModel) -> str:
    """Hash normalized operation data, excluding the caller's idempotency identity."""
    payload = request.model_dump(mode="json", exclude={"idempotency_key"})
    if isinstance(payload.get("selected_change_ids"), list):
        payload["selected_change_ids"] = sorted(payload["selected_change_ids"])
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def require_proposal(
    session: AsyncSession,
    run_id: UUID,
    user_id: str,
    proposal_id: UUID,
    *,
    lock: bool = False,
) -> ConceptNoteEditProposal:
    """Resolve a proposal within one authorized actor/run scope, optionally locked."""
    query = select(ConceptNoteEditProposal).where(
        ConceptNoteEditProposal.proposal_id == proposal_id,
        ConceptNoteEditProposal.run_id == run_id,
        ConceptNoteEditProposal.actor_user_id == user_id,
    )
    row = await session.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise EditOperationError(
            "proposal_not_found", "Edit proposal not found.", status_code=404
        )
    return row


async def latest_revision(
    session: AsyncSession, chapter_id: UUID
) -> ConceptNoteChapterRevision | None:
    """Read the current immutable revision while its chapter lock is held on writes."""
    return await session.scalar(
        select(ConceptNoteChapterRevision)
        .where(
            ConceptNoteChapterRevision.chapter_id == chapter_id,
        )
        .order_by(ConceptNoteChapterRevision.revision_number.desc())
        .limit(1)
    )


def replace_anchors(body: str, changes: list[EditChange]) -> str:
    """Replace exact, non-overlapping anchors and preserve all unrelated bytes."""
    cursor = 0
    pieces: list[str] = []
    for change in sorted(changes, key=lambda item: item.start):
        end = change.start + len(change.before)
        if change.start < cursor or body[change.start : end] != change.before:
            raise EditOperationError(
                "invalid_anchor", "A proposed passage no longer matches the draft."
            )
        pieces.extend([body[cursor : change.start], change.after])
        cursor = end
    pieces.append(body[cursor:])
    result = "".join(pieces)
    if not result.strip() or len(result) > 50_000:
        raise EditOperationError(
            "content_limit",
            "The proposed chapter is empty or exceeds its content limit.",
        )
    return result


def to_response(row: ConceptNoteEditProposal) -> EditProposalResponse:
    """Detach public proposal data from the managed database session."""
    return EditProposalResponse.model_validate(
        {
            "proposal_id": row.proposal_id,
            "run_id": row.run_id,
            "instruction": row.instruction,
            "scope": row.scope,
            "status": row.status,
            "base_revisions": row.base_revisions,
            "changes": row.changes,
            "clarification": row.clarification,
            "error_code": row.error_code,
            "result": row.applied_result,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    )
