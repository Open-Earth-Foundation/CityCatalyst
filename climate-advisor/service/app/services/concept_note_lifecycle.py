"""Authorized, retryable Concept Note rename, duplicate, and delete workflows."""

from __future__ import annotations

import logging
from collections.abc import Awaitable
from typing import Any
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.concept_note_runs import (
    ConceptNoteRenameRequest,
    ConceptNoteRunResponse,
)
from app.models.db.concept_note import (
    ConceptNoteLifecycleOperation,
    ConceptNoteRun,
)
from app.persistence.concept_notes.lifecycle import (
    ConceptNoteLifecycleRepository,
)
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
)
from app.services.citycatalyst_client import CityCatalystClient
from app.services.concept_note_runs import (
    ConceptNoteRunService,
    _require_bearer_token,
    _to_response,
)
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ConceptNoteLifecycleService:
    """Coordinate lifecycle changes across CA, CNB, and CityCatalyst storage."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        cc_client: CityCatalystClient | None = None,
        workspace: ConceptNoteWorkspaceRepository | None = None,
    ) -> None:
        """Initialize lifecycle collaborators without opening the CNB database."""
        self.session = session
        self.cc_client = cc_client or CityCatalystClient()
        self.run_service = ConceptNoteRunService(session, cc_client=self.cc_client)
        self.repository = ConceptNoteLifecycleRepository(session)
        self._workspace = workspace

    @property
    def workspace(self) -> ConceptNoteWorkspaceRepository:
        """Lazily resolve managed CNB storage only for duplicate/delete calls."""
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
        """Rename an active owned run and its dedicated conversation."""
        run = await self.run_service.get_authorized_run(
            run_id=run_id,
            requested_user_id=requested_user_id,
            authorization=authorization,
        )
        await self.repository.rename_run(run=run, name=payload.name)
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
        """Create or resume an independent working copy of an owned run."""
        token, canonical_user_id = await self._authorize_user(
            requested_user_id=requested_user_id,
            authorization=authorization,
        )
        operation = await self.repository.get_operation(
            user_id=canonical_user_id,
            idempotency_key=idempotency_key,
        )
        created = operation is None
        if operation is None:
            source = await self.run_service.get_authorized_run(
                run_id=run_id,
                requested_user_id=canonical_user_id,
                authorization=authorization,
            )
            await self._require_compatible_source(source)
            operation = await self._commit_new_operation(
                self.repository.create_duplicate_operation(
                    source=source,
                    idempotency_key=idempotency_key,
                    token=token,
                )
            )
        else:
            self._require_matching_operation(operation, kind="duplicate", run_id=run_id)
            await self.run_service._validate_city_access(
                token=token,
                user_id=canonical_user_id,
                city_id=UUID(operation.city_id),
            )

        if operation.phase == "completed":
            destination = await self._destination(operation)
            return _to_response(destination, created=False), False

        try:
            destination = await self._resume_duplicate(operation, token=token)
            return _to_response(destination, created=created), created
        except Exception as exc:
            phase = operation.phase
            await self.session.rollback()
            logger.exception(
                "Concept Note duplication failed at phase %s",
                phase,
            )
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "concept_note_duplicate_incomplete",
                    "message": "Concept Note duplication can be retried safely",
                },
            ) from exc

    async def delete_run(
        self,
        *,
        run_id: UUID,
        idempotency_key: UUID,
        requested_user_id: str,
        authorization: str | None,
    ) -> None:
        """Permanently delete or resume deletion of one owned run and chat."""
        token, canonical_user_id = await self._authorize_user(
            requested_user_id=requested_user_id,
            authorization=authorization,
        )
        operation = await self.repository.get_operation(
            user_id=canonical_user_id,
            idempotency_key=idempotency_key,
        )
        if operation is None:
            source = await self.run_service.get_authorized_run(
                run_id=run_id,
                requested_user_id=canonical_user_id,
                authorization=authorization,
            )
            await self._require_compatible_source(source)
            if not await self.repository.thread_is_dedicated(source):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "concept_note_chat_shared",
                        "message": "The concept note chat is shared and cannot be deleted",
                    },
                )
            operation = await self._commit_new_operation(
                self.repository.create_delete_operation(
                    source=source,
                    idempotency_key=idempotency_key,
                )
            )
        else:
            self._require_matching_operation(operation, kind="delete", run_id=run_id)
            await self.run_service._validate_city_access(
                token=token,
                user_id=canonical_user_id,
                city_id=UUID(operation.city_id),
            )

        if operation.phase == "completed":
            return
        try:
            await self._resume_delete(operation, token=token)
        except Exception as exc:
            phase = operation.phase
            await self.session.rollback()
            logger.exception(
                "Concept Note deletion failed at phase %s",
                phase,
            )
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "concept_note_delete_incomplete",
                    "message": "Concept Note deletion can be retried safely",
                },
            ) from exc

    async def _authorize_user(
        self,
        *,
        requested_user_id: str,
        authorization: str | None,
    ) -> tuple[str, str]:
        """Return a bearer token and its matching canonical user."""
        token = _require_bearer_token(authorization)
        canonical_user_id = await self.run_service._authorize_user(
            token=token,
            requested_user_id=requested_user_id,
        )
        return token, canonical_user_id

    async def _require_compatible_source(self, source: ConceptNoteRun) -> None:
        """Reject source runs with another operation or active background work."""
        conflict = await self.repository.get_incomplete_for_source(
            source_run_id=source.run_id
        )
        if conflict is not None or _has_active_background_work(source):
            raise _lifecycle_conflict()
        try:
            if await self.workspace.has_active_export(run_id=source.run_id):
                raise _lifecycle_conflict()
        except RuntimeError as exc:
            raise HTTPException(
                status_code=503,
                detail="Concept Note workspace storage is unavailable",
            ) from exc

    async def _commit_new_operation(
        self,
        pending: Awaitable[ConceptNoteLifecycleOperation],
    ) -> ConceptNoteLifecycleOperation:
        """Commit a new lifecycle marker or report a concurrent conflict."""
        try:
            operation = await pending
            await self.session.commit()
            return operation
        except IntegrityError as exc:
            await self.session.rollback()
            raise _lifecycle_conflict() from exc

    async def _resume_duplicate(
        self,
        operation: ConceptNoteLifecycleOperation,
        *,
        token: str,
    ) -> ConceptNoteRun:
        """Resume duplicate phases after their last durable completion marker."""
        if operation.phase == "ca_copied":
            upload_map = _string_map(operation.operation_data.get("upload_map"))
            if upload_map:
                await self.cc_client.post_internal_capability(
                    "/api/v1/internal/ca/concept-note-uploads/bindings",
                    json_data={
                        "operation": "clone",
                        "uploads": [
                            {
                                "source_upload_id": source_id,
                                "destination_upload_id": destination_id,
                            }
                            for source_id, destination_id in upload_map.items()
                        ],
                    },
                    token=token,
                )
            await self.repository.set_phase(operation, "source_bindings_copied")
            await self.session.commit()

        if operation.phase == "source_bindings_copied":
            if operation.destination_run_id is None:
                raise ValueError("Duplicate operation has no destination run")
            result = await self.workspace.copy_working_copy(
                source_run_id=operation.source_run_id,
                destination_run_id=operation.destination_run_id,
            )
            destination = await self.repository.finalize_duplicate(
                operation,
                result,
            )
            await self.session.commit()
            return destination

        if operation.phase == "completed":
            return await self._destination(operation)
        raise ValueError(f"Unsupported duplicate phase: {operation.phase}")

    async def _resume_delete(
        self,
        operation: ConceptNoteLifecycleOperation,
        *,
        token: str,
    ) -> None:
        """Resume delete phases after their last durable completion marker."""
        if operation.phase == "marked_deleting":
            await self.workspace.delete_run(run_id=operation.source_run_id)
            await self.repository.set_phase(operation, "workspace_deleted")
            await self.session.commit()

        if operation.phase == "workspace_deleted":
            upload_ids = _string_list(operation.operation_data.get("upload_ids"))
            if upload_ids:
                await self.cc_client.post_internal_capability(
                    "/api/v1/internal/ca/concept-note-uploads/bindings",
                    json_data={"operation": "delete", "upload_ids": upload_ids},
                    token=token,
                )
            await self.repository.set_phase(operation, "source_bindings_deleted")
            await self.session.commit()

        if operation.phase == "source_bindings_deleted":
            await self.repository.finalize_delete(operation)
            await self.session.commit()
            return
        if operation.phase != "completed":
            raise ValueError(f"Unsupported delete phase: {operation.phase}")

    async def _destination(
        self,
        operation: ConceptNoteLifecycleOperation,
    ) -> ConceptNoteRun:
        if operation.destination_run_id is None:
            raise ValueError("Duplicate operation has no destination run")
        destination = await self.session.get(
            ConceptNoteRun,
            operation.destination_run_id,
        )
        if (
            destination is None
            or destination.user_id != operation.user_id
            or destination.lifecycle_state != "active"
        ):
            raise ValueError("Duplicate destination run is unavailable")
        return destination

    @staticmethod
    def _require_matching_operation(
        operation: ConceptNoteLifecycleOperation,
        *,
        kind: str,
        run_id: UUID,
    ) -> None:
        """Reject idempotency reuse for another action or source run."""
        if operation.kind != kind or operation.source_run_id != run_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "idempotency_key_reused",
                    "message": "Idempotency key was already used for another request",
                },
            )


def _has_active_background_work(run: ConceptNoteRun) -> bool:
    """Detect known context and draft jobs that must finish before lifecycle work."""
    summary = run.context_summary if isinstance(run.context_summary, dict) else {}
    context = summary.get("context_bundle")
    draft = summary.get("draft_document")
    return bool(
        (isinstance(context, dict) and context.get("status") == "building")
        or (isinstance(draft, dict) and draft.get("status") == "running")
    )


def _lifecycle_conflict() -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "code": "concept_note_lifecycle_conflict",
            "message": "Finish the current Concept Note operation and try again",
        },
    )


def _string_map(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): str(item)
        for key, item in value.items()
        if isinstance(key, str) and isinstance(item, str)
    }


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]
