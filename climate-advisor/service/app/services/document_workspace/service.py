"""Canonical point operations shared by HTTP, chat, and background workers."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter, ConceptNoteChapterRevision
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentDependency,
    DocumentExport,
    DocumentNeed,
    DocumentOperation,
    DocumentPoint,
    DocumentPointRevision,
    DocumentSetupSnapshot,
    DocumentUpdateJob,
    DocumentWorkspaceState,
)
from app.models.document_workspace.contracts import (
    DocumentExportRequest,
    DocumentExportResponse,
    DocumentPointCommand,
    DocumentPointCommandResult,
    DocumentPointQuestion,
    DocumentSetupRequest,
    DocumentWorkspace,
    DocumentWorkspacePoint,
)
from app.services.cnb.application_context import (
    ConceptNoteApplicationContextService,
    calculate_application_template_fingerprint,
)
from app.services.document_workspace.requirements import (
    fingerprint,
    template_definitions,
    validate_value,
)

logger = logging.getLogger(__name__)
ACCEPTED = {"answered", "assumption", "not_applicable"}
SourceValidator = Callable[[list[dict[str, Any]]], Awaitable[None]]


class DocumentWorkspaceService:
    """Persist typed points and durable work without relying on model memory.

    Callers must first obtain an authorized owner-scoped ConceptNoteRun. The
    service never substitutes another identity or reads a caller supplied run.
    """

    def __init__(
        self, session_factory: async_sessionmaker[AsyncSession] | None = None
    ) -> None:
        """Allow isolated persistence fixtures while defaulting to CNB storage."""
        self.session_factory = session_factory or get_cnb_reference_session_factory()

    async def load(self, run: ConceptNoteRun) -> DocumentWorkspace:
        """Read the persisted projection; materialize a selected setup once."""
        template = await ConceptNoteApplicationContextService(
            session_factory=self.session_factory
        ).load_template_for_run(run)
        async with self.session_factory() as session, session.begin():
            state = await self._state(session, run.run_id)
            if state.setup is None and template is not None:
                await self._materialize(session, state, template, user_id=run.user_id)
            return await self._project(session, state)

    async def save_setup(
        self, run: ConceptNoteRun, payload: DocumentSetupRequest
    ) -> DocumentWorkspace:
        """Explicitly reconcile the currently selected immutable template snapshot."""
        template = await ConceptNoteApplicationContextService(
            session_factory=self.session_factory
        ).load_template_for_run(run)
        if template is None:
            raise HTTPException(
                422, "Select a document template before completing setup"
            )
        request_hash = fingerprint(
            {
                "operation": "setup",
                "payload": payload.model_dump(mode="json"),
                "template": template.model_dump(mode="json"),
            }
        )
        async with self.session_factory() as session, session.begin():
            state = await self._state(session, run.run_id)
            replay = await self._replay(
                session, run.run_id, payload.idempotency_key, request_hash
            )
            if replay is not None:
                return DocumentWorkspace.model_validate(replay)
            if payload.expected_revision != state.revision:
                raise HTTPException(
                    409, "Workspace changed. Reload before changing setup."
                )
            await self._materialize(session, state, template, user_id=run.user_id)
            result = await self._project(session, state)
            session.add(
                DocumentOperation(
                    run_id=run.run_id,
                    idempotency_key=payload.idempotency_key,
                    fingerprint=request_hash,
                    result=result.model_dump(mode="json"),
                )
            )
            return result

    async def reconcile_template(
        self, run: ConceptNoteRun, template: ApplicationContextTemplate
    ) -> None:
        """Apply an already authorized explicit funding/template selection."""
        async with self.session_factory() as session, session.begin():
            state = await self._state(session, run.run_id)
            await self._materialize(session, state, template, user_id=run.user_id)

    async def clear_setup(self, run: ConceptNoteRun) -> None:
        """Retire requirements after explicit template deselection, retaining history."""
        async with self.session_factory() as session, session.begin():
            state = await self._state(session, run.run_id)
            if state.setup is None:
                return
            for point in await session.scalars(
                select(DocumentPoint).where(
                    DocumentPoint.run_id == run.run_id, DocumentPoint.active.is_(True)
                )
            ):
                point.active = False
                point.version += 1
                self._history(session, point, run.user_id, "retire_setup", {})
            for job in await session.scalars(
                select(DocumentUpdateJob).where(
                    DocumentUpdateJob.run_id == run.run_id,
                    DocumentUpdateJob.status.in_(
                        ["queued", "running", "pending_review"]
                    ),
                )
            ):
                job.status = "superseded"
            state.setup, state.setup_fingerprint = None, None
            state.revision += 1

    async def _state(
        self, session: AsyncSession, run_id: UUID
    ) -> DocumentWorkspaceState:
        """Serialize mutations using the workspace row, including first use."""
        # PostgreSQL ON CONFLICT closes the first-reader race without requiring
        # a cross-database FK to the CA-owned run. SQLite is also used in tests.
        dialect = session.get_bind().dialect.name
        if dialect in {"postgresql", "sqlite"}:
            if dialect == "postgresql":
                from sqlalchemy.dialects.postgresql import insert
            else:
                from sqlalchemy.dialects.sqlite import insert
            await session.execute(
                insert(DocumentWorkspaceState)
                .values(run_id=run_id, revision=0, setup_version=0)
                .on_conflict_do_nothing(index_elements=["run_id"])
            )
        state = await session.scalar(
            select(DocumentWorkspaceState)
            .where(DocumentWorkspaceState.run_id == run_id)
            .with_for_update()
        )
        if state is None:
            raise RuntimeError("Workspace state could not be initialized")
        return state

    async def _materialize(
        self,
        session: AsyncSession,
        state: DocumentWorkspaceState,
        template: ApplicationContextTemplate,
        *,
        user_id: str,
    ) -> None:
        """Reconcile only exact compatible keys; retain retired records/history."""
        setup_hash = calculate_application_template_fingerprint(template)
        if state.setup_fingerprint == setup_hash:
            return
        definitions = template_definitions(template)
        points = {
            point.semantic_key: point
            for point in await session.scalars(
                select(DocumentPoint).where(DocumentPoint.run_id == state.run_id)
            )
        }
        new_keys = {definition["key"] for definition in definitions}
        for point in points.values():
            if point.active and point.semantic_key not in new_keys:
                point.active = False
                point.version += 1
                self._history(session, point, "system", "retire", {})
        for definition in definitions:
            point = points.get(definition["key"])
            if point is None:
                point = DocumentPoint(
                    point_id=uuid4(),
                    run_id=state.run_id,
                    semantic_key=definition["key"],
                    definition=definition,
                    version=1,
                    disposition="missing",
                    active=True,
                )
                session.add(point)
                await session.flush()
                self._history(session, point, "system", "materialize", {})
            else:
                previous = point.definition
                if previous != definition or not point.active:
                    # An incompatible type cannot inherit a formerly accepted value.
                    try:
                        if (
                            point.disposition in ACCEPTED
                            and point.disposition != "not_applicable"
                        ):
                            validate_value(definition, point.value)
                            if any(
                                previous.get(name) != definition.get(name)
                                for name in ("answer_type", "kind", "unit")
                            ):
                                raise HTTPException(
                                    422, "The point value schema changed"
                                )
                    except HTTPException:
                        point.value, point.disposition, point.accepted_version = (
                            None,
                            "missing",
                            0,
                        )
                    if (
                        point.disposition == "assumption"
                        and definition["required"]
                        and not definition["allow_assumption"]
                    ):
                        point.value, point.disposition, point.accepted_version = (
                            None,
                            "missing",
                            0,
                        )
                    if (
                        point.disposition == "not_applicable"
                        and definition["required"]
                        and not definition["allow_not_applicable"]
                    ):
                        point.value, point.disposition, point.accepted_version = (
                            None,
                            "missing",
                            0,
                        )
                    point.definition, point.active = definition, True
                    for candidate in await session.scalars(
                        select(DocumentCandidate).where(
                            DocumentCandidate.point_id == point.point_id,
                            DocumentCandidate.status == "pending",
                        )
                    ):
                        try:
                            validate_value(definition, candidate.value)
                        except HTTPException:
                            candidate.status = "dismissed"
                    point.version += 1
                    self._history(
                        session,
                        point,
                        "system",
                        "reconcile_setup",
                        {"previous_definition": previous},
                    )
            await session.execute(
                delete(DocumentDependency).where(
                    DocumentDependency.point_id == point.point_id
                )
            )
            for chapter_ref in definition["chapter_refs"]:
                session.add(
                    DocumentDependency(
                        point_id=point.point_id,
                        chapter_ref=chapter_ref,
                        applied_version=0,
                    )
                )
            if point.disposition in ACCEPTED:
                session.add(
                    DocumentUpdateJob(
                        run_id=state.run_id,
                        workspace_revision=state.revision + 1,
                        kind="draft",
                        payload={
                            "point_key": point.semantic_key,
                            "point_version": point.accepted_version,
                            "user_id": user_id,
                            "chapter_refs": definition["chapter_refs"],
                        },
                        status="queued",
                    )
                )
        # Evidence groups are template guidance; actual files remain run uploads.
        needs = {
            need.semantic_key: need
            for need in await session.scalars(
                select(DocumentNeed).where(DocumentNeed.run_id == state.run_id)
            )
        }
        groups: dict[str, dict[str, Any]] = {}
        for definition in definitions:
            raw = definition.get("evidence_need") or {
                "key": definition["key"],
                "label": definition["label"],
                "description": definition["description"],
            }
            raw = raw if isinstance(raw, dict) else {"key": str(raw), "label": str(raw)}
            key = str(raw.get("key") or definition["key"])
            group = groups.setdefault(
                key,
                {
                    "key": key,
                    "label": str(raw.get("label") or key),
                    "description": str(
                        raw.get("description")
                        or "Evidence supporting this requirement."
                    ),
                    "guidance": str(
                        raw.get("guidance")
                        or "Attach a relevant source, or provide a direct answer with its basis."
                    ),
                    "point_keys": [],
                    "required": False,
                },
            )
            group["point_keys"].append(definition["key"])
            group["required"] = group["required"] or definition["required"]
        for need in needs.values():
            need.active = need.semantic_key in groups
        for key, definition in groups.items():
            if key in needs:
                needs[key].definition, needs[key].active = definition, True
            else:
                session.add(
                    DocumentNeed(
                        run_id=state.run_id,
                        semantic_key=key,
                        definition=definition,
                        documents=[],
                        active=True,
                    )
                )
        state.setup_version += 1
        state.revision += 1
        state.setup_fingerprint = setup_hash
        state.setup = {
            "name": template.name,
            "document_type": "concept_note",
            "version": state.setup_version,
            "fingerprint": setup_hash,
            "ready": bool(definitions),
        }
        session.add(
            DocumentSetupSnapshot(
                run_id=state.run_id,
                version=state.setup_version,
                fingerprint=setup_hash,
                snapshot=template.model_dump(mode="json"),
            )
        )
        await session.flush()
        logger.info(
            "Materialized document setup run_id=%s version=%s points=%s",
            state.run_id,
            state.setup_version,
            len(definitions),
        )

    async def command(
        self,
        run: ConceptNoteRun,
        point_key: str,
        payload: DocumentPointCommand,
        *,
        user_id: str,
        source_validator: SourceValidator | None = None,
    ) -> DocumentPointCommandResult:
        """Validate and atomically save answer, immutable history, and outbox job."""
        if user_id != run.user_id:
            raise HTTPException(403, "Only the run owner can update document points")
        request_hash = fingerprint(
            {
                "point_key": point_key,
                "actor": user_id,
                "payload": payload.model_dump(mode="json"),
            }
        )
        async with self.session_factory() as session, session.begin():
            state = await self._state(session, run.run_id)
            replay = await self._replay(
                session, run.run_id, payload.idempotency_key, request_hash
            )
            if replay is not None:
                return DocumentPointCommandResult.model_validate(replay)
            point = await session.scalar(
                select(DocumentPoint).where(
                    DocumentPoint.run_id == run.run_id,
                    DocumentPoint.semantic_key == point_key,
                    DocumentPoint.active.is_(True),
                )
            )
            if point is None:
                raise HTTPException(404, "Document point not found")
            if point.version != payload.expected_version:
                raise HTTPException(409, "Point changed. Reload before answering.")
            candidate = None
            if payload.command in {"confirm_candidate", "dismiss_candidate"}:
                try:
                    candidate_id = UUID(payload.candidate_id or "")
                except ValueError as exc:
                    raise HTTPException(
                        422, "A valid candidate_id is required"
                    ) from exc
                candidate = await session.get(DocumentCandidate, candidate_id)
                if (
                    candidate is None
                    or candidate.point_id != point.point_id
                    or candidate.status != "pending"
                ):
                    raise HTTPException(409, "Candidate is no longer pending")
                if (
                    payload.command == "confirm_candidate"
                    and source_validator is not None
                ):
                    await source_validator([candidate.source_identity])
            accepted = payload.command in {
                "answer",
                "correct",
                "confirm_candidate",
                "assume",
                "not_applicable",
            }
            if payload.command in {"assume", "not_applicable"}:
                permission = (
                    "allow_assumption"
                    if payload.command == "assume"
                    else "allow_not_applicable"
                )
                if point.definition["required"] and not point.definition[permission]:
                    raise HTTPException(
                        422, "This required point does not permit that exception"
                    )
                if not payload.reason or not payload.reason.strip():
                    raise HTTPException(422, "An explicit reason is required")
            if accepted:
                value = candidate.value if candidate is not None else payload.value
                point.value = (
                    None
                    if payload.command == "not_applicable"
                    else validate_value(point.definition, value)
                )
                point.disposition = {
                    "assume": "assumption",
                    "not_applicable": "not_applicable",
                }.get(payload.command, "answered")
                point.task = {
                    "status": "done",
                    "waiting_for": None,
                    "requested_information": None,
                    "note": payload.reason or payload.note,
                }
                # Confirming/correcting is an explicit conflict resolution, while
                # a new source may create a new pending disagreement afterwards.
                for other in await session.scalars(
                    select(DocumentCandidate).where(
                        DocumentCandidate.point_id == point.point_id,
                        DocumentCandidate.status == "pending",
                    )
                ):
                    other.status = (
                        "accepted"
                        if candidate is not None
                        and other.candidate_id == candidate.candidate_id
                        else "dismissed"
                    )
            elif payload.command == "dismiss_candidate":
                candidate.status = "dismissed"
            elif payload.command == "park":
                point.task = {
                    "status": "waiting" if payload.waiting_for else "parked",
                    "waiting_for": payload.waiting_for,
                    "requested_information": payload.requested_information,
                    "note": payload.note,
                }
            elif payload.command == "resume":
                point.task = {
                    "status": "active",
                    "waiting_for": None,
                    "requested_information": None,
                    "note": payload.note,
                }
            point.version += 1
            if accepted:
                point.accepted_version = point.version
            state.revision += 1
            self._history(
                session,
                point,
                user_id,
                payload.command,
                {"reason": payload.reason, "candidate_id": payload.candidate_id},
            )
            job = None
            if accepted:
                # A persisted proposal is bound to the canonical input vector as
                # well as chapter text. New accepted facts invalidate that plan.
                pending_jobs = list(
                    await session.scalars(
                        select(DocumentUpdateJob).where(
                            DocumentUpdateJob.run_id == run.run_id,
                            DocumentUpdateJob.status == "pending_review",
                        )
                    )
                )
                for pending_job in pending_jobs:
                    for proposal_id in pending_job.payload.get("proposal_ids", []):
                        proposal = await session.get(
                            ConceptNoteEditProposal,
                            UUID(proposal_id),
                            with_for_update=True,
                        )
                        if proposal is not None and proposal.status == "proposed":
                            proposal.status = "stale"
                    pending_job.status = (
                        "superseded"
                        if pending_job.payload.get("point_key") == point.semantic_key
                        else "queued"
                    )
                    pending_job.attempts = 0
                    pending_job.payload = {
                        key: value
                        for key, value in pending_job.payload.items()
                        if key not in {"proposal_ids", "point_versions"}
                    }
                job = DocumentUpdateJob(
                    job_id=uuid4(),
                    run_id=run.run_id,
                    workspace_revision=state.revision,
                    kind="draft",
                    payload={
                        "point_key": point.semantic_key,
                        "point_version": point.version,
                        "user_id": user_id,
                        "chapter_refs": point.definition["chapter_refs"],
                    },
                    status="queued",
                )
                session.add(job)
            await session.flush()
            projection = await self._project(session, state)
            result = DocumentPointCommandResult(
                point=next(item for item in projection.points if item.key == point_key),
                workspace_revision=state.revision,
                update_job=(
                    {"job_id": str(job.job_id), "status": job.status} if job else None
                ),
            )
            session.add(
                DocumentOperation(
                    run_id=run.run_id,
                    idempotency_key=payload.idempotency_key,
                    fingerprint=request_hash,
                    result=result.model_dump(mode="json"),
                )
            )
            logger.info(
                "Saved document point run_id=%s point_key=%s version=%s operation=%s",
                run.run_id,
                point_key,
                point.version,
                payload.command,
            )
            return result

    async def _replay(
        self, session: AsyncSession, run_id: UUID, key: str, request_hash: str
    ) -> dict[str, Any] | None:
        """Replay exact requests before stale-version checks; reject key reuse."""
        previous = await session.scalar(
            select(DocumentOperation).where(
                DocumentOperation.run_id == run_id,
                DocumentOperation.idempotency_key == key,
            )
        )
        if previous is None:
            return None
        if previous.fingerprint != request_hash:
            raise HTTPException(
                409, "Idempotency key was already used for a different request"
            )
        return previous.result

    def _history(
        self,
        session: AsyncSession,
        point: DocumentPoint,
        actor: str,
        operation: str,
        metadata: dict[str, Any],
    ) -> None:
        """Append the complete point state, preserving reasons and provenance."""
        session.add(
            DocumentPointRevision(
                point_id=point.point_id,
                version=point.version,
                actor_user_id=actor,
                operation=operation,
                snapshot={
                    "value": point.value,
                    "disposition": point.disposition,
                    "task": point.task,
                    "definition": point.definition,
                    "active": point.active,
                    **metadata,
                },
            )
        )

    async def _project(
        self, session: AsyncSession, state: DocumentWorkspaceState
    ) -> DocumentWorkspace:
        """Compute coverage, conflicts, freshness and export from one locked snapshot."""
        await session.flush()
        rows = list(
            await session.scalars(
                select(DocumentPoint)
                .where(
                    DocumentPoint.run_id == state.run_id, DocumentPoint.active.is_(True)
                )
                .order_by(DocumentPoint.semantic_key)
            )
        )
        candidates = list(
            await session.scalars(
                select(DocumentCandidate)
                .join(DocumentPoint)
                .where(DocumentPoint.run_id == state.run_id)
            )
        )
        dependencies = list(
            await session.scalars(
                select(DocumentDependency)
                .join(DocumentPoint)
                .where(
                    DocumentPoint.run_id == state.run_id, DocumentPoint.active.is_(True)
                )
            )
        )
        jobs = list(
            await session.scalars(
                select(DocumentUpdateJob)
                .where(
                    DocumentUpdateJob.run_id == state.run_id,
                    DocumentUpdateJob.kind == "draft",
                )
                .order_by(DocumentUpdateJob.workspace_revision.desc())
            )
        )
        chapters = list(
            await session.scalars(
                select(ConceptNoteChapter).where(
                    ConceptNoteChapter.run_id == state.run_id,
                    ConceptNoteChapter.status != "deleted",
                )
            )
        )
        points: list[DocumentWorkspacePoint] = []
        blockers = []
        if state.setup is None:
            blockers.append("Select and confirm a document setup.")
        elif not state.setup["ready"]:
            blockers.append(
                "The selected template has no recognized point requirements. Configure requirements before final export."
            )
        snapshot = await session.scalar(
            select(DocumentSetupSnapshot).where(
                DocumentSetupSnapshot.run_id == state.run_id,
                DocumentSetupSnapshot.version == state.setup_version,
            )
        )
        required_chapter_refs = set()
        if snapshot is not None:
            from app.persistence.concept_notes.workspace import (
                normalize_template_chapters,
            )

            existing_refs = {chapter.template_section_id for chapter in chapters}
            for required_chapter in normalize_template_chapters(
                snapshot.snapshot.get("chapter_schema", [])
            ):
                if required_chapter.required:
                    required_chapter_refs.add(required_chapter.chapter_ref)
                if (
                    required_chapter.required
                    and required_chapter.chapter_ref not in existing_refs
                ):
                    blockers.append(
                        f"Required chapter is missing: {required_chapter.title}"
                    )
        for row in rows:
            choices = [
                candidate
                for candidate in candidates
                if candidate.point_id == row.point_id
            ]
            pending = [
                candidate for candidate in choices if candidate.status == "pending"
            ]
            values = {fingerprint(candidate.value) for candidate in pending}
            conflict = len(values) > 1 or (
                row.disposition in ACCEPTED
                and any(candidate.value != row.value for candidate in pending)
            )
            status = (
                "conflict"
                if conflict
                else (
                    "needs_confirmation"
                    if row.disposition == "missing" and pending
                    else row.disposition
                )
            )
            freshness = "missing" if row.disposition not in ACCEPTED else "current"
            stale = any(
                dependency.applied_version < row.accepted_version
                for dependency in dependencies
                if dependency.point_id == row.point_id
            )
            latest_job = next(
                (
                    job
                    for job in jobs
                    if job.payload.get("point_key") == row.semantic_key
                    and job.payload.get("point_version") == row.accepted_version
                ),
                None,
            )
            if row.disposition in ACCEPTED and stale:
                freshness = {
                    "queued": "updating",
                    "running": "updating",
                    "failed": "failed",
                    "pending_review": "pending_review",
                }.get(latest_job.status if latest_job else "", "stale")
            point = DocumentWorkspacePoint(
                point_id=str(row.point_id),
                key=row.semantic_key,
                **{
                    key: row.definition[key]
                    for key in (
                        "label",
                        "description",
                        "kind",
                        "answer_type",
                        "required",
                        "allow_assumption",
                        "allow_not_applicable",
                        "chapter_refs",
                    )
                },
                version=row.version,
                choices=row.definition.get("choices", []),
                status=status,
                value=row.value,
                candidates=[
                    {
                        "candidate_id": str(candidate.candidate_id),
                        "value": candidate.value,
                        "citations": candidate.citations,
                        "status": candidate.status,
                    }
                    for candidate in choices
                ],
                task=row.task,
                freshness=freshness,
            )
            points.append(point)
            if point.required and status not in ACCEPTED:
                blockers.append(f"Required point unresolved: {point.label}")
            if status == "conflict":
                blockers.append(f"Conflicting evidence: {point.label}")
            if row.disposition in ACCEPTED and freshness != "current":
                blockers.append(f"Dependent text is {freshness}: {point.label}")
        chapter_versions = []
        for chapter in chapters:
            latest = await session.scalar(
                select(ConceptNoteChapterRevision)
                .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
                .order_by(ConceptNoteChapterRevision.revision_number.desc())
                .limit(1)
            )
            chapter_versions.append(
                {
                    "chapter": str(chapter.chapter_id),
                    "revision": latest.revision_number if latest else 0,
                    "status": chapter.status,
                    "confirmed_revision": str(chapter.confirmed_revision_id),
                    "position": chapter.position,
                }
            )
            if latest is None or not latest.body_markdown.strip():
                blockers.append(f"Chapter has no text: {chapter.title}")
            elif (
                chapter.required or chapter.template_section_id in required_chapter_refs
            ) and (
                chapter.status != "ready"
                or chapter.confirmed_revision_id != latest.revision_id
            ):
                blockers.append(f"Required chapter review pending: {chapter.title}")
        if not chapters:
            blockers.append("Generate the document text before final export.")
        draft_hash = fingerprint(chapter_versions)
        if (
            state.draft_fingerprint is not None
            and state.draft_fingerprint != draft_hash
        ):
            state.revision += 1
        state.draft_fingerprint = draft_hash
        needs = []
        by_key = {point.key: point for point in points}
        for need in await session.scalars(
            select(DocumentNeed)
            .where(DocumentNeed.run_id == state.run_id, DocumentNeed.active.is_(True))
            .order_by(DocumentNeed.semantic_key)
        ):
            linked = [
                by_key[key] for key in need.definition["point_keys"] if key in by_key
            ]
            status = (
                "available"
                if need.documents
                else (
                    "waiting"
                    if any(
                        point.task and point.task.status == "waiting"
                        for point in linked
                    )
                    else (
                        "later"
                        if any(
                            point.task and point.task.status == "parked"
                            for point in linked
                        )
                        else "missing"
                    )
                )
            )
            needs.append(
                {
                    "need_id": str(need.need_id),
                    **need.definition,
                    "status": status,
                    "documents": need.documents,
                }
            )
        required = [point for point in points if point.required]
        optional = [point for point in points if not point.required]
        return DocumentWorkspace(
            revision=state.revision,
            setup=state.setup,
            points=points,
            needs=needs,
            overview={
                "required_total": len(required),
                "required_covered": sum(point.status in ACCEPTED for point in required),
                "optional_total": len(optional),
                "optional_covered": sum(point.status in ACCEPTED for point in optional),
                "waiting_count": sum(
                    bool(point.task and point.task.status == "waiting")
                    for point in points
                ),
                "next_steps": [
                    {
                        "point_id": point.point_id,
                        "label": point.label,
                        "reason": point.status.replace("_", " "),
                    }
                    for point in sorted(points, key=lambda item: not item.required)
                    if point.status not in ACCEPTED
                ][:3],
            },
            export_eligibility={
                "working": True,
                "final": not blockers,
                "blockers": blockers,
                "workspace_revision": state.revision,
            },
        )

    async def question(
        self, run: ConceptNoteRun, point_key: str, language: str = "en"
    ) -> DocumentPointQuestion:
        """Generate bounded guidance using semantic state, with no identifiers."""
        from app.config.settings import get_settings
        from app.services.cnb.chat_suggestions import generate_suggestion

        workspace = await self.load(run)
        point = next((item for item in workspace.points if item.key == point_key), None)
        if point is None:
            raise HTTPException(404, "Document point not found")
        context = point.model_dump(
            mode="json",
            include={
                "key",
                "label",
                "description",
                "kind",
                "answer_type",
                "required",
                "value",
                "status",
            },
        )
        async with self.session_factory() as session:
            definition = await session.scalar(
                select(DocumentPoint.definition).where(
                    DocumentPoint.point_id == UUID(point.point_id)
                )
            )
        context["choices"] = definition.get("choices", [])
        context["candidates"] = [
            {
                "value": candidate.value,
                "citations": [
                    citation.model_dump(mode="json") for citation in candidate.citations
                ],
            }
            for candidate in point.candidates
            if candidate.status == "pending"
        ]
        output = await generate_suggestion(
            get_settings(),
            {"language": language, "point": context},
            "document_point_question",
            DocumentPointQuestion,
        )
        if output is None:
            raise HTTPException(503, "Point question service unavailable")
        return output

    async def export(
        self,
        run: ConceptNoteRun,
        payload: DocumentExportRequest,
        *,
        source_validator: SourceValidator | None = None,
    ) -> DocumentExportResponse:
        """Enforce final eligibility and persist content at the reviewed revision."""
        async with self.session_factory() as session, session.begin():
            state = await self._state(session, run.run_id)
            # Editing/review operations lock chapter rows too. Lock them before
            # computing eligibility so a reviewed body cannot change mid-export.
            chapters = list(
                await session.scalars(
                    select(ConceptNoteChapter)
                    .where(
                        ConceptNoteChapter.run_id == run.run_id,
                        ConceptNoteChapter.status != "deleted",
                    )
                    .order_by(ConceptNoteChapter.position)
                    .with_for_update()
                )
            )
            view = await self._project(session, state)
            source_caveats = []
            if source_validator is not None:
                identities = []
                for point in await session.scalars(
                    select(DocumentPoint).where(
                        DocumentPoint.run_id == run.run_id,
                        DocumentPoint.active.is_(True),
                        DocumentPoint.accepted_version > 0,
                    )
                ):
                    accepted = await session.scalar(
                        select(DocumentPointRevision).where(
                            DocumentPointRevision.point_id == point.point_id,
                            DocumentPointRevision.version == point.accepted_version,
                        )
                    )
                    candidate_id = (
                        accepted.snapshot.get("candidate_id")
                        if accepted is not None
                        else None
                    )
                    if candidate_id:
                        candidate = await session.get(
                            DocumentCandidate, UUID(candidate_id)
                        )
                        if candidate is not None:
                            identities.append(candidate.source_identity)
                try:
                    await source_validator(identities)
                except HTTPException:
                    if payload.mode == "final":
                        raise
                    source_caveats.append(
                        "An accepted source is unavailable. Verify the affected values before final export."
                    )
            if payload.expected_revision != state.revision:
                raise HTTPException(
                    409,
                    "Workspace changed. Review the current revision before exporting.",
                )
            if payload.mode == "final" and not view.export_eligibility.final:
                raise HTTPException(
                    409,
                    {
                        "code": "document_final_export_blocked",
                        "message": "; ".join(view.export_eligibility.blockers),
                    },
                )
            bodies = []
            chapter_revisions = {}
            for chapter in chapters:
                latest = await session.scalar(
                    select(ConceptNoteChapterRevision)
                    .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
                    .order_by(ConceptNoteChapterRevision.revision_number.desc())
                    .limit(1)
                )
                if latest is not None:
                    bodies.append(latest.body_markdown)
                    chapter_revisions[str(chapter.chapter_id)] = str(latest.revision_id)
            caveats = (
                list(view.export_eligibility.blockers)
                if payload.mode == "working"
                else []
            )
            caveats.extend(source_caveats)
            for point in view.points:
                if point.status in {"assumption", "not_applicable"}:
                    caveats.append(
                        f"{point.label}: {point.status.replace('_', ' ')}. {point.task.note if point.task else ''}"
                    )
            annotation = (
                (
                    "# Working draft — caveats\n\n"
                    if payload.mode == "working"
                    else "# Assumptions and exceptions\n\n"
                )
                + "\n".join(f"- {caveat}" for caveat in caveats)
                + "\n\n"
                if caveats
                else ""
            )
            result = DocumentExportResponse(
                export_id=str(uuid4()),
                mode=payload.mode,
                workspace_revision=state.revision,
                caveats=caveats,
                body_markdown=annotation + "\n\n".join(bodies),
            )
            session.add(
                DocumentExport(
                    export_id=UUID(result.export_id),
                    run_id=run.run_id,
                    workspace_revision=state.revision,
                    mode=payload.mode,
                    caveats=caveats,
                    body_markdown=result.body_markdown,
                    chapter_revisions=chapter_revisions,
                )
            )
            return result


def get_document_workspace_service() -> DocumentWorkspaceService:
    """Build the shared point service using the managed CNB session factory."""
    return DocumentWorkspaceService()
