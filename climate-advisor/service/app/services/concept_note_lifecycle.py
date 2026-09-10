"""Rename, duplicate, and permanently delete Concept Note runs."""

from __future__ import annotations

import hashlib
import json
import logging
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.context_bundle import ConceptNoteContextBundle
from app.models.cnb.concept_note_runs import (
    ConceptNoteRenameRequest,
    ConceptNoteRunResponse,
)
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import ConceptNoteRun, ConceptNoteUpload
from app.models.db.thread import Thread
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.concept_note_runs import (
    ConceptNoteRunService,
    _require_bearer_token,
    _require_matching_fingerprint,
    _to_response,
)
from app.utils.chat_workflow_context import (
    CONCEPT_NOTE_RUN_ID_KEY,
    bind_workflow_context,
)
from app.utils.token_manager import create_token_context
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ConceptNoteLifecycleService:
    """Apply the three user-facing lifecycle actions with direct persistence."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        workspace: ConceptNoteWorkspaceRepository | None = None,
    ) -> None:
        """Initialize workflow and managed-workspace persistence."""
        self.session = session
        self.run_service = ConceptNoteRunService(session)
        self._workspace = workspace

    @property
    def workspace(self) -> ConceptNoteWorkspaceRepository:
        """Open managed CNB storage only for duplicate and delete."""
        if self._workspace is None:
            self._workspace = ConceptNoteWorkspaceRepository(
                get_cnb_reference_session_factory()
            )
        return self._workspace

    async def rename_run(
        self,
        *,
        run_id: UUID,
        payload: ConceptNoteRenameRequest,
        requested_user_id: str,
        authorization: str | None,
    ) -> ConceptNoteRunResponse:
        """Rename an owned run and its chat in the same database transaction."""
        run = await self.run_service.get_authorized_run(
            run_id=run_id,
            requested_user_id=requested_user_id,
            authorization=authorization,
        )
        run.name = payload.name
        run.updated_at = datetime.now(UTC)

        if run.thread_id is not None:
            thread = await self.session.scalar(
                select(Thread).where(
                    Thread.thread_id == run.thread_id,
                    Thread.user_id == run.user_id,
                )
            )
            if thread is not None:
                thread.title = payload.name
                thread.last_updated = datetime.now(UTC)

        await self.session.commit()
        return _to_response(run, created=False)

    async def duplicate_run(
        self,
        *,
        run_id: UUID,
        idempotency_key: UUID,
        requested_user_id: str,
        authorization: str | None,
    ) -> tuple[ConceptNoteRunResponse, bool]:
        """Copy current run data and workspace into a fresh run and chat."""
        token = _require_bearer_token(authorization)
        source = await self.run_service.get_authorized_run(
            run_id=run_id,
            requested_user_id=requested_user_id,
            authorization=authorization,
        )
        fingerprint = hashlib.sha256(
            f"duplicate:{source.run_id}".encode()
        ).hexdigest()

        # Reuse the destination created by an identical browser retry.
        existing = await self.run_service.repository.get_by_idempotency_key(
            user_id=source.user_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            _require_matching_fingerprint(existing, fingerprint)
            return _to_response(existing, created=False), False
        _require_idle(source)

        # Keep the new run hidden in the CA transaction until its workspace exists.
        destination = await self._build_copy(
            source=source,
            token=token,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
        )
        try:
            await self.session.flush()
            result = await self.workspace.copy_working_copy(
                source_run_id=source.run_id,
                destination_run_id=destination.run_id,
            )
            summary = deepcopy(destination.context_summary or {})
            summary["draft_document"] = {
                "status": (
                    "complete"
                    if result.total_chapters > 0
                    and result.completed_chapters == result.total_chapters
                    else "not_started"
                ),
                "completed_chapters": result.completed_chapters,
                "total_chapters": result.total_chapters,
            }
            destination.context_summary = summary
            if result.total_chapters:
                destination.workflow_step = "editing_document"
            destination.updated_at = datetime.now(UTC)
            await self.session.commit()
        except Exception as exc:
            await self.session.rollback()
            try:
                await self.workspace.delete_run(run_id=destination.run_id)
            except Exception:
                logger.warning(
                    "Failed to clean up Concept Note workspace copy run_id=%s",
                    destination.run_id,
                    exc_info=True,
                )
            logger.exception("Concept Note duplication failed")
            raise HTTPException(
                status_code=503,
                detail="Concept Note could not be duplicated",
            ) from exc

        return _to_response(destination, created=True), True

    async def delete_run(
        self,
        *,
        run_id: UUID,
        requested_user_id: str,
        authorization: str | None,
    ) -> None:
        """Delete an owned run, its managed workspace, and dedicated chat."""
        run = await self.run_service.get_authorized_run(
            run_id=run_id,
            requested_user_id=requested_user_id,
            authorization=authorization,
        )
        _require_idle(run)
        if not await self._thread_is_dedicated(run):
            raise HTTPException(
                status_code=409,
                detail="The Concept Note chat is shared and cannot be deleted",
            )

        # Remove run-owned document rows before deleting its CA record and chat.
        try:
            await self.workspace.delete_run(run_id=run.run_id)
        except Exception as exc:
            logger.exception("Concept Note workspace deletion failed")
            raise HTTPException(
                status_code=503,
                detail="Concept Note could not be deleted",
            ) from exc

        if run.thread_id is not None:
            thread = await self.session.scalar(
                select(Thread).where(
                    Thread.thread_id == run.thread_id,
                    Thread.user_id == run.user_id,
                )
            )
            if thread is not None:
                await self.session.delete(thread)
        await self.session.delete(run)
        await self.session.commit()

    async def _build_copy(
        self,
        *,
        source: ConceptNoteRun,
        token: str,
        idempotency_key: UUID,
        fingerprint: str,
    ) -> ConceptNoteRun:
        """Add one independent CA copy to the current transaction."""
        destination_run_id = uuid4()
        destination_thread_id = uuid4()
        suffix = " (copy)"
        name = f"{source.name[: 120 - len(suffix)].rstrip()}{suffix}"
        uploads = list(
            (
                await self.session.scalars(
                    select(ConceptNoteUpload).where(
                        ConceptNoteUpload.run_id == source.run_id,
                        ConceptNoteUpload.ingest_status == "ready",
                    ).order_by(ConceptNoteUpload.upload_id.asc())
                )
            ).all()
        )
        upload_map = {upload.upload_id: uuid4() for upload in uploads}
        source_bundle = await self.session.get(
            ConceptNoteContextBundleRow,
            source.run_id,
        )

        thread = Thread(
            thread_id=destination_thread_id,
            user_id=source.user_id,
            title=name,
            context=bind_workflow_context(
                create_token_context(token),
                workflow_key=CONCEPT_NOTE_RUN_ID_KEY,
                run_id=destination_run_id,
            ),
        )
        destination = ConceptNoteRun(
            run_id=destination_run_id,
            thread_id=destination_thread_id,
            user_id=source.user_id,
            name=name,
            city_id=source.city_id,
            project_id=source.project_id,
            funder_id=source.funder_id,
            selected_funding_opportunity_id=source.selected_funding_opportunity_id,
            status="active",
            workflow_step=source.workflow_step,
            context_summary=_copy_context_summary(
                source.context_summary,
                uploads=uploads,
                upload_map=upload_map,
            ),
            permission_summary={},
            trace_id=None,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        bundle = ConceptNoteContextBundleRow(
            run_id=destination_run_id,
            context_bundle=_copy_context_bundle(
                source_bundle.context_bundle if source_bundle is not None else None,
                upload_map,
            ),
        )
        self.session.add_all([thread, destination, bundle])

        for upload in uploads:
            self.session.add(
                ConceptNoteUpload(
                    upload_id=upload_map[upload.upload_id],
                    run_id=destination_run_id,
                    uploaded_by_user_id=source.user_id,
                    filename=upload.filename,
                    source_label=upload.source_label,
                    markdown_s3_key=upload.markdown_s3_key,
                    markdown_sha256=upload.markdown_sha256,
                    page_count=upload.page_count,
                    ingest_status="ready",
                    ingest_started_at=upload.ingest_started_at,
                    ingest_completed_at=upload.ingest_completed_at,
                )
            )
        return destination

    async def _thread_is_dedicated(self, run: ConceptNoteRun) -> bool:
        """Return whether no other run references the chat thread."""
        if run.thread_id is None:
            return True
        count = await self.session.scalar(
            select(func.count())
            .select_from(ConceptNoteRun)
            .where(ConceptNoteRun.thread_id == run.thread_id)
        )
        return int(count or 0) <= 1


def _copy_context_bundle(
    value: Any,
    upload_map: dict[UUID, UUID],
) -> dict[str, Any]:
    """Copy the typed bundle and replace run-specific upload IDs."""
    payload = ConceptNoteContextBundle.model_validate(value or {}).model_dump(
        mode="json"
    )
    for source in payload.get("selected_sources", []):
        source_id = _as_uuid(source.get("upload_id"))
        if source_id in upload_map:
            source["upload_id"] = str(upload_map[source_id])
    return payload


def _copy_context_summary(
    value: Any,
    *,
    uploads: list[ConceptNoteUpload],
    upload_map: dict[UUID, UUID],
) -> dict[str, Any]:
    """Copy durable progress without in-flight task identifiers."""
    summary = deepcopy(value) if isinstance(value, dict) else {}
    summary.pop("draft_document", None)
    bundle = summary.get("context_bundle")
    if isinstance(bundle, dict):
        bundle.pop("build_id", None)
        bundle.pop("error_code", None)
        bundle["retryable"] = False
        fingerprint_rows = [
            {
                "upload_id": str(upload_map[upload.upload_id]),
                "sha256": upload.markdown_sha256,
            }
            for upload in uploads
        ]
        bundle["source_fingerprint"] = hashlib.sha256(
            json.dumps(fingerprint_rows, sort_keys=True).encode()
        ).hexdigest()
    return summary


def _require_idle(run: ConceptNoteRun) -> None:
    """Reject mutation while context or draft generation is active."""
    summary = run.context_summary if isinstance(run.context_summary, dict) else {}
    context = summary.get("context_bundle")
    draft = summary.get("draft_document")
    if (
        isinstance(context, dict)
        and context.get("status") == "building"
        or isinstance(draft, dict)
        and draft.get("status") == "running"
    ):
        raise HTTPException(
            status_code=409,
            detail="Finish the current Concept Note operation and try again",
        )


def _as_uuid(value: Any) -> UUID | None:
    """Parse optional bundle identifiers without trusting stored JSON."""
    try:
        return UUID(str(value)) if value else None
    except (TypeError, ValueError):
        return None
