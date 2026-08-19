"""Climate Advisor persistence for Concept Note lifecycle operations."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from app.models.cnb.context_bundle import ConceptNoteContextBundle
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import (
    ConceptNoteLifecycleOperation,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.thread import Thread
from app.persistence.concept_notes.workspace import WorkspaceCopyResult
from app.utils.chat_workflow_context import (
    CONCEPT_NOTE_RUN_ID_KEY,
    bind_workflow_context,
)
from app.utils.token_manager import create_token_context
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class ConceptNoteLifecycleRepository:
    """Persist resumable lifecycle phases in the Climate Advisor database."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the workflow database session."""
        self.session = session

    async def get_operation(
        self,
        *,
        user_id: str,
        idempotency_key: UUID,
    ) -> ConceptNoteLifecycleOperation | None:
        """Load an operation by its user-scoped idempotency key."""
        return await self.session.scalar(
            select(ConceptNoteLifecycleOperation).where(
                ConceptNoteLifecycleOperation.user_id == user_id,
                ConceptNoteLifecycleOperation.idempotency_key == idempotency_key,
            )
        )

    async def get_incomplete_for_source(
        self,
        *,
        source_run_id: UUID,
    ) -> ConceptNoteLifecycleOperation | None:
        """Load any unfinished lifecycle operation for the source run."""
        return await self.session.scalar(
            select(ConceptNoteLifecycleOperation).where(
                ConceptNoteLifecycleOperation.source_run_id == source_run_id,
                ConceptNoteLifecycleOperation.phase != "completed",
            )
        )

    async def rename_run(self, *, run: ConceptNoteRun, name: str) -> None:
        """Rename a run and its dedicated conversation in one transaction."""
        run.name = name
        run.updated_at = datetime.now(UTC)
        if run.thread_id is not None:
            thread = await self.session.scalar(
                select(Thread).where(
                    Thread.thread_id == run.thread_id,
                    Thread.user_id == run.user_id,
                )
            )
            if thread is not None:
                thread.title = name
                thread.last_updated = datetime.now(UTC)
        await self.session.flush()

    async def thread_is_dedicated(self, run: ConceptNoteRun) -> bool:
        """Return whether a run's chat is absent or referenced by only that run."""
        if run.thread_id is None:
            return True
        count = await self.session.scalar(
            select(func.count())
            .select_from(ConceptNoteRun)
            .where(ConceptNoteRun.thread_id == run.thread_id)
        )
        return int(count or 0) <= 1

    async def create_duplicate_operation(
        self,
        *,
        source: ConceptNoteRun,
        idempotency_key: UUID,
        token: str,
    ) -> ConceptNoteLifecycleOperation:
        """Create the hidden CA working copy and its durable operation record."""
        destination_run_id = uuid4()
        destination_thread_id = uuid4()
        copy_name = _copy_name(source.name)
        ready_uploads = list(
            (
                await self.session.scalars(
                    select(ConceptNoteUpload)
                    .where(
                        ConceptNoteUpload.run_id == source.run_id,
                        ConceptNoteUpload.ingest_status == "ready",
                    )
                    .order_by(
                        ConceptNoteUpload.received_at.asc(),
                        ConceptNoteUpload.upload_id.asc(),
                    )
                )
            ).all()
        )
        upload_map = {upload.upload_id: uuid4() for upload in ready_uploads}
        source_bundle = await self.session.get(
            ConceptNoteContextBundleRow,
            source.run_id,
        )
        copied_bundle = _copy_context_bundle(
            source_bundle.context_bundle if source_bundle is not None else None,
            upload_map,
        )
        copied_summary = _copy_context_summary(
            source.context_summary,
            ready_uploads=ready_uploads,
            upload_map=upload_map,
        )

        # Create a fresh conversation with no messages and a current user token.
        thread_context = bind_workflow_context(
            create_token_context(token),
            workflow_key=CONCEPT_NOTE_RUN_ID_KEY,
            run_id=destination_run_id,
        )
        self.session.add(
            Thread(
                thread_id=destination_thread_id,
                user_id=source.user_id,
                context=thread_context,
                title=copy_name,
            )
        )
        destination = ConceptNoteRun(
            run_id=destination_run_id,
            thread_id=destination_thread_id,
            user_id=source.user_id,
            name=copy_name,
            city_id=source.city_id,
            project_id=source.project_id,
            funder_id=source.funder_id,
            selected_funding_opportunity_id=source.selected_funding_opportunity_id,
            status="active",
            lifecycle_state="copying",
            duplicated_from_run_id=source.run_id,
            workflow_step=source.workflow_step,
            context_summary=copied_summary,
            permission_summary={},
            trace_id=None,
            idempotency_key=uuid4(),
            request_fingerprint=_duplicate_fingerprint(
                source.run_id,
                idempotency_key,
            ),
        )
        self.session.add(destination)
        self.session.add(
            ConceptNoteContextBundleRow(
                run_id=destination_run_id,
                context_bundle=copied_bundle,
            )
        )
        for source_upload in ready_uploads:
            self.session.add(
                ConceptNoteUpload(
                    upload_id=upload_map[source_upload.upload_id],
                    run_id=destination_run_id,
                    uploaded_by_user_id=source.user_id,
                    filename=source_upload.filename,
                    source_label=source_upload.source_label,
                    markdown_s3_key=source_upload.markdown_s3_key,
                    markdown_sha256=source_upload.markdown_sha256,
                    page_count=source_upload.page_count,
                    ingest_status="ready",
                    ingest_error_code=None,
                    ingest_started_at=source_upload.ingest_started_at,
                    ingest_completed_at=source_upload.ingest_completed_at,
                )
            )

        operation = ConceptNoteLifecycleOperation(
            user_id=source.user_id,
            city_id=source.city_id,
            source_run_id=source.run_id,
            destination_run_id=destination_run_id,
            kind="duplicate",
            idempotency_key=idempotency_key,
            phase="ca_copied",
            operation_data={
                "upload_map": {
                    str(source_id): str(destination_id)
                    for source_id, destination_id in upload_map.items()
                },
            },
        )
        self.session.add(operation)
        await self.session.flush()
        return operation

    async def create_delete_operation(
        self,
        *,
        source: ConceptNoteRun,
        idempotency_key: UUID,
    ) -> ConceptNoteLifecycleOperation:
        """Hide a run and snapshot the external bindings needed for cleanup."""
        uploads = list(
            (
                await self.session.scalars(
                    select(ConceptNoteUpload.upload_id).where(
                        ConceptNoteUpload.run_id == source.run_id
                    )
                )
            ).all()
        )
        source.lifecycle_state = "deleting"
        source.updated_at = datetime.now(UTC)
        operation = ConceptNoteLifecycleOperation(
            user_id=source.user_id,
            city_id=source.city_id,
            source_run_id=source.run_id,
            destination_run_id=None,
            kind="delete",
            idempotency_key=idempotency_key,
            phase="marked_deleting",
            operation_data={
                "thread_id": str(source.thread_id) if source.thread_id else None,
                "upload_ids": [str(upload_id) for upload_id in uploads],
            },
        )
        self.session.add(operation)
        await self.session.flush()
        return operation

    async def set_phase(
        self,
        operation: ConceptNoteLifecycleOperation,
        phase: str,
    ) -> None:
        """Advance an operation after one idempotent external phase succeeds."""
        operation.phase = phase
        operation.updated_at = datetime.now(UTC)
        await self.session.flush()

    async def finalize_duplicate(
        self,
        operation: ConceptNoteLifecycleOperation,
        result: WorkspaceCopyResult,
    ) -> ConceptNoteRun:
        """Publish the destination only after every copy boundary succeeds."""
        if operation.destination_run_id is None:
            raise ValueError("Duplicate operation has no destination run")
        destination = await self.session.get(
            ConceptNoteRun,
            operation.destination_run_id,
        )
        if destination is None:
            raise ValueError("Duplicate destination run was not found")
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
        if result.total_chapters > 0:
            destination.workflow_step = "editing_document"
        destination.lifecycle_state = "active"
        destination.updated_at = datetime.now(UTC)
        operation.phase = "completed"
        operation.operation_data = {}
        operation.updated_at = datetime.now(UTC)
        await self.session.flush()
        return destination

    async def finalize_delete(
        self,
        operation: ConceptNoteLifecycleOperation,
    ) -> None:
        """Delete CA-owned run/chat rows and retain only the operation tombstone."""
        run = await self.session.get(ConceptNoteRun, operation.source_run_id)
        thread_id = _operation_uuid(operation.operation_data.get("thread_id"))
        await self.session.execute(
            delete(ConceptNoteContextBundleRow).where(
                ConceptNoteContextBundleRow.run_id == operation.source_run_id
            )
        )
        await self.session.execute(
            delete(ConceptNoteUpload).where(
                ConceptNoteUpload.run_id == operation.source_run_id
            )
        )
        if run is not None:
            await self.session.delete(run)
        if thread_id is not None:
            await self.session.execute(
                delete(Thread).where(
                    Thread.thread_id == thread_id,
                    Thread.user_id == operation.user_id,
                )
            )
        operation.phase = "completed"
        operation.operation_data = {}
        operation.updated_at = datetime.now(UTC)
        await self.session.flush()


def _copy_name(name: str) -> str:
    """Append the working-copy suffix without exceeding the run-name limit."""
    suffix = " (copy)"
    return f"{name[: 120 - len(suffix)].rstrip()}{suffix}"


def _copy_context_bundle(
    value: Any,
    upload_map: dict[UUID, UUID],
) -> dict[str, Any]:
    """Deep-copy the typed context bundle while remapping selected uploads."""
    bundle = ConceptNoteContextBundle.model_validate(value or {})
    payload = bundle.model_dump(mode="json")
    for source in payload.get("selected_sources", []):
        source_id = _operation_uuid(source.get("upload_id"))
        if source_id in upload_map:
            source["upload_id"] = str(upload_map[source_id])
    return payload


def _copy_context_summary(
    value: Any,
    *,
    ready_uploads: list[ConceptNoteUpload],
    upload_map: dict[UUID, UUID],
) -> dict[str, Any]:
    """Copy durable progress while dropping in-flight task identities."""
    summary = deepcopy(value) if isinstance(value, dict) else {}
    summary.pop("draft_document", None)
    bundle = summary.get("context_bundle")
    if isinstance(bundle, dict):
        bundle.pop("build_id", None)
        bundle.pop("error_code", None)
        bundle["retryable"] = False
        bundle["source_fingerprint"] = _copied_source_fingerprint(
            ready_uploads,
            upload_map,
        )
        if bundle.get("status") == "building":
            bundle["status"] = "ready"
    return summary


def _copied_source_fingerprint(
    uploads: list[ConceptNoteUpload],
    upload_map: dict[UUID, UUID],
) -> str:
    payload = [
        {
            "upload_id": str(upload_map[upload.upload_id]),
            "sha256": upload.markdown_sha256,
            "page_count": upload.page_count,
        }
        for upload in uploads
    ]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _duplicate_fingerprint(source_run_id: UUID, idempotency_key: UUID) -> str:
    """Create an immutable fingerprint for an internally generated run."""
    return hashlib.sha256(
        f"duplicate:{source_run_id}:{idempotency_key}".encode()
    ).hexdigest()


def _operation_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value)) if value else None
    except (TypeError, ValueError):
        return None
