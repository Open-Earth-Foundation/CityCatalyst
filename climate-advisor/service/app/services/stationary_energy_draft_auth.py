from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.models.stationary_energy_drafts import StartStationaryEnergyDraftRequest
from app.utils.token_manager import (
    create_token_context,
    is_token_expired,
    parse_jwt_claims,
)
from app.services.thread_service import ThreadService


def extract_token(context: Any) -> str | None:
    """Return a stored CityCatalyst token from a thread or request context payload."""
    if not isinstance(context, dict):
        return None
    return context.get("cc_access_token") or context.get("access_token")


def extract_bearer_token(authorization: str | None) -> str | None:
    """Parse a Bearer token from an Authorization header value."""
    if authorization is None:
        return None

    scheme, separator, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not separator or not token.strip():
        raise HTTPException(
            status_code=401,
            detail="Authorization header must use Bearer token",
        )
    return token.strip()


def token_user_id(token: str) -> str | None:
    """Extract the authenticated CityCatalyst user id from a JWT subject claim."""
    claims = parse_jwt_claims(token)
    if not isinstance(claims, dict):
        return None

    value = claims.get("sub") or claims.get("user_id") or claims.get("userId")
    return str(value) if value else None


def resolve_authenticated_user_id(
    *,
    token: str | None,
    requested_user_id: str,
) -> str:
    """Ensure the provided token belongs to the requested user id."""
    if not token:
        raise HTTPException(
            status_code=401,
            detail="CityCatalyst access token is required",
        )

    authenticated_user_id = token_user_id(token)
    if not authenticated_user_id:
        raise HTTPException(
            status_code=401,
            detail="CityCatalyst access token must include a user subject",
        )
    if authenticated_user_id != requested_user_id:
        raise HTTPException(
            status_code=403,
            detail="Request user does not match access token",
        )
    return authenticated_user_id


async def resolve_user_and_token(
    *,
    payload: StartStationaryEnergyDraftRequest,
    authorization: str | None,
    thread_service: ThreadService,
) -> tuple[str, str | None]:
    """Resolve the authenticated user id and best-available token for a draft start."""
    request_token = extract_bearer_token(authorization) or extract_token(
        payload.context
    )

    if payload.thread_id is None:
        user_id = resolve_authenticated_user_id(
            token=request_token,
            requested_user_id=payload.user_id,
        )
        return user_id, request_token

    thread = await thread_service.get_thread(payload.thread_id)
    if thread is None:
        raise HTTPException(
            status_code=404,
            detail=f"Thread {payload.thread_id} not found",
        )

    thread_token = extract_token(thread.context)
    token = request_token or thread_token
    user_id = resolve_authenticated_user_id(
        token=token,
        requested_user_id=payload.user_id,
    )
    if thread.user_id != user_id:
        raise HTTPException(status_code=403, detail="Thread does not belong to user")
    return user_id, token


def needs_token_refresh(token: str) -> bool:
    """Return whether a JWT token should be refreshed before reuse."""
    if "." not in token:
        return False

    claims = parse_jwt_claims(token)
    if claims is None:
        return False
    if "exp" not in claims:
        return True
    return is_token_expired(token)


async def load_thread_token(
    *,
    thread_service: ThreadService,
    thread_id: UUID | None,
) -> str | None:
    """Read a persisted CityCatalyst token from the stored thread context."""
    if thread_id is None:
        return None

    thread = await thread_service.get_thread(thread_id)
    if thread is None:
        return None
    return extract_token(thread.context)


async def persist_thread_context_update(
    *,
    thread_service: ThreadService,
    thread_id: UUID,
    user_id: str,
    context_update: dict[str, Any],
) -> None:
    """Persist a context fragment onto a thread when it belongs to the user."""
    thread = await thread_service.get_thread(thread_id)
    if thread is None or thread.user_id != user_id:
        return

    await thread_service.update_context(
        thread=thread,
        context_update=context_update,
    )


async def persist_thread_token(
    *,
    thread_service: ThreadService,
    thread_id: UUID,
    user_id: str,
    token: str,
    expires_in: int,
) -> None:
    """Store a refreshed CityCatalyst token on the associated thread context."""
    await persist_thread_context_update(
        thread_service=thread_service,
        thread_id=thread_id,
        user_id=user_id,
        context_update=create_token_context(token, expires_in),
    )


async def persist_thread_draft_run_id(
    *,
    thread_service: ThreadService,
    thread_id: UUID | None,
    user_id: str,
    draft_run_id: UUID,
) -> None:
    """Persist the active Stationary Energy draft run id on a thread context."""
    if thread_id is None:
        return

    await persist_thread_context_update(
        thread_service=thread_service,
        thread_id=thread_id,
        user_id=user_id,
        context_update={"stationary_energy_draft_run_id": str(draft_run_id)},
    )
