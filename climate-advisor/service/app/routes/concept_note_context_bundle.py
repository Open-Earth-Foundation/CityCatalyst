"""Retry, refresh, and inventory-selection endpoints for context bundles."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from app.models.cnb.context_bundle import (
    ContextBundleInventorySelectionRequest,
    ContextBundleRefreshResponse,
    ContextBundleRetryResponse,
)
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
    "cc_inventory_unavailable": "City inventories are temporarily unavailable",
    "inventory_not_accessible": "The inventory is not available for this city",
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


async def authenticate(
    request: Request,
    service: ContextBundleService | None,
    cc_client: CityCatalystClient,
) -> tuple[str, str] | JSONResponse:
    """Return the caller's user id and bearer token, or a problem response."""
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
    return user_id, token


def persistence_problem(exc: ContextBundlePersistenceError) -> JSONResponse:
    """Map a stable persistence error to its public problem response."""
    return problem(
        exc.status_code,
        exc.code,
        REPOSITORY_ERROR_MESSAGES.get(
            exc.code,
            "Concept Note context request could not be completed",
        ),
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
    identity = await authenticate(request, service, cc_client)
    if isinstance(identity, JSONResponse):
        return identity
    user_id, token = identity
    assert service is not None
    try:
        snapshot = await service.begin(
            user_id=user_id,
            run_id=run_id,
            force=True,
        )
    except ContextBundlePersistenceError as exc:
        return persistence_problem(exc)
    schedule_context_bundle_build(
        service=service,
        user_id=user_id,
        run_id=run_id,
        token=token,
        force=True,
        snapshot=snapshot,
    )
    return ContextBundleRetryResponse(run_id=run_id, status="queued")


@router.post(
    "/concept-notes/{run_id}/context-bundle/refresh",
    response_model=ContextBundleRefreshResponse,
)
async def refresh_context_bundle(
    run_id: UUID,
    request: Request,
    service: Annotated[
        ContextBundleService | None,
        Depends(get_context_bundle_service),
    ],
    cc_client: Annotated[CityCatalystClient, Depends(get_citycatalyst_client)],
) -> JSONResponse | ContextBundleRefreshResponse:
    """Rebuild a ready bundle when the city's inventory changed since it was built."""
    identity = await authenticate(request, service, cc_client)
    if isinstance(identity, JSONResponse):
        return identity
    user_id, token = identity
    assert service is not None
    try:
        refresh_status = await service.refresh_if_stale(
            user_id=user_id,
            run_id=run_id,
            token=token,
        )
    except ContextBundlePersistenceError as exc:
        return persistence_problem(exc)
    return ContextBundleRefreshResponse(run_id=run_id, status=refresh_status)


@router.put(
    "/concept-notes/{run_id}/inventory-selection",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ContextBundleRetryResponse,
)
async def select_context_inventory(
    run_id: UUID,
    payload: ContextBundleInventorySelectionRequest,
    request: Request,
    service: Annotated[
        ContextBundleService | None,
        Depends(get_context_bundle_service),
    ],
    cc_client: Annotated[CityCatalystClient, Depends(get_citycatalyst_client)],
) -> JSONResponse | ContextBundleRetryResponse:
    """Save the run's GHGI inventory choice and rebuild its context."""
    identity = await authenticate(request, service, cc_client)
    if isinstance(identity, JSONResponse):
        return identity
    user_id, token = identity
    assert service is not None
    try:
        await service.select_inventory(
            user_id=user_id,
            run_id=run_id,
            token=token,
            inventory_id=payload.inventory_id,
        )
    except ContextBundlePersistenceError as exc:
        return persistence_problem(exc)
    return ContextBundleRetryResponse(run_id=run_id, status="queued")
