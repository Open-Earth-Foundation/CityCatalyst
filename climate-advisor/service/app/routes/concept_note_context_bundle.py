"""Retry endpoint for authenticated Concept Note context-bundle assembly."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from app.models.cnb.context_bundle import ContextBundleRetryResponse
from app.persistence.concept_notes.context_bundle import ContextBundlePersistenceError
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.services.cnb.context_bundle import (
    ContextBundleService,
    get_context_bundle_service,
    schedule_context_bundle_build,
)
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse

router = APIRouter()

REPOSITORY_ERROR_MESSAGES = {
    "concept_note_run_not_found": "Concept Note run was not found",
    "concept_note_run_forbidden": "Concept Note run belongs to another user",
    "cnb_storage_unavailable": "Concept Note context storage is unavailable",
}


async def get_citycatalyst_client() -> AsyncIterator[CityCatalystClient]:
    """Provide and close the CityCatalyst identity client."""
    client = CityCatalystClient()
    try:
        yield client
    finally:
        await client.close()


def problem(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a stable machine-readable bundle error."""
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "detail": message, "status": status_code},
        media_type="application/problem+json",
    )


@router.post(
    "/concept-notes/{run_id}/context-bundle/retry",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ContextBundleRetryResponse,
)
async def retry_context_bundle(
    run_id: UUID,
    request: Request,
    service: Annotated[
        ContextBundleService | None,
        Depends(get_context_bundle_service),
    ],
    cc_client: Annotated[CityCatalystClient, Depends(get_citycatalyst_client)],
) -> JSONResponse | ContextBundleRetryResponse:
    """Authorize, guard, and queue a fresh context-bundle build."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not authorization[7:].strip():
        return problem(401, "invalid_bearer_token", "Bearer token is required")
    if service is None:
        return problem(
            503,
            "cnb_storage_unavailable",
            "Concept Note context storage is unavailable",
        )
    token = authorization[7:].strip()
    try:
        user_id = await cc_client.validate_user_identity(token)
    except CityCatalystClientError as exc:
        if exc.status_code in (401, 403):
            return problem(401, "invalid_bearer_token", "Bearer token is invalid")
        return problem(
            503,
            "cc_identity_unavailable",
            "Identity service is temporarily unavailable",
        )
    try:
        snapshot = await service.begin(
            user_id=user_id,
            run_id=run_id,
            force=True,
        )
    except ContextBundlePersistenceError as exc:
        return problem(
            exc.status_code,
            exc.code,
            REPOSITORY_ERROR_MESSAGES.get(
                exc.code,
                "Concept Note context request could not be completed",
            ),
        )
    schedule_context_bundle_build(
        service=service,
        user_id=user_id,
        run_id=run_id,
        token=token,
        force=True,
        snapshot=snapshot,
    )
    return ContextBundleRetryResponse(run_id=run_id, status="queued")
