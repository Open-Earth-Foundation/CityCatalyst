from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.utils.token_manager import (
    create_token_context,
    is_token_expired,
    parse_jwt_claims,
)
from app.services.thread_service import ThreadService

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


def require_bearer_token(token: str | None) -> str:
    """Require a parsed Bearer token for authenticated Stationary Energy actions."""
    if not token:
        raise HTTPException(
            status_code=401,
            detail="CityCatalyst access token is required",
        )
    return token


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
