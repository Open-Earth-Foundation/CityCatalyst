"""Authenticate Climate Advisor write requests against CityCatalyst Core."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping

from fastapi import HTTPException

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)

logger = logging.getLogger(__name__)

WRITE_AUTH_FAILED = "CityCatalyst authentication failed"
WRITE_AUTH_UNAVAILABLE = "CityCatalyst identity service is unavailable"
_AUTH_REJECTION_STATUSES = frozenset({401, 403})
_CREDENTIAL_CONTEXT_KEYS = frozenset({"access_token", "cc_access_token"})


@dataclass(frozen=True)
class AuthenticatedWriteIdentity:
    """Canonical Core subject and the bearer that proved it."""

    user_id: str
    token: str


def extract_bearer_token(authorization: str | None) -> str:
    """Parse a strict Bearer token or raise the stable write-auth 401."""
    if authorization is None or not authorization.strip():
        raise HTTPException(status_code=401, detail=WRITE_AUTH_FAILED)

    scheme, separator, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not separator or not token.strip():
        raise HTTPException(status_code=401, detail=WRITE_AUTH_FAILED)
    return token.strip()


def normalize_write_context(context: Any, validated_token: str) -> dict[str, Any]:
    """Replace credential aliases with the validated bearer.

    Body ``access_token`` / ``cc_access_token`` values are discarded, including
    when they conflict with the header. Non-credential fields are preserved.
    """
    normalized: dict[str, Any] = {}
    if isinstance(context, Mapping):
        normalized = {
            key: value
            for key, value in context.items()
            if key not in _CREDENTIAL_CONTEXT_KEYS
        }
    normalized["access_token"] = validated_token
    return normalized


async def authenticate_write_request(
    *,
    authorization: str | None,
    claimed_user_id: str,
) -> AuthenticatedWriteIdentity:
    """Validate the request bearer and bind it to the claimed body subject.

    Args:
        authorization: Raw Authorization header value.
        claimed_user_id: ``user_id`` from the request body.

    Returns:
        Canonical Core user ID and the validated bearer.

    Raises:
        HTTPException: 401 when the bearer is missing, malformed, rejected, or
            bound to a different subject. 503 when Core identity validation is
            unavailable. Upstream error text is never returned to the client.
    """
    token = extract_bearer_token(authorization)

    # Validate through Core before any caller-controlled identity is trusted.
    try:
        async with CityCatalystClient() as client:
            canonical_user_id = await client.validate_user_identity(token)
    except CityCatalystClientError as exc:
        if exc.status_code in _AUTH_REJECTION_STATUSES:
            logger.warning(
                "Rejected Climate Advisor write bearer status=%s",
                exc.status_code,
            )
            raise HTTPException(status_code=401, detail=WRITE_AUTH_FAILED) from exc
        logger.warning(
            "CityCatalyst identity validation unavailable status=%s",
            exc.status_code,
        )
        raise HTTPException(
            status_code=503,
            detail=WRITE_AUTH_UNAVAILABLE,
        ) from exc

    if canonical_user_id != claimed_user_id:
        logger.warning("Rejected Climate Advisor write subject mismatch")
        raise HTTPException(status_code=401, detail=WRITE_AUTH_FAILED)

    return AuthenticatedWriteIdentity(user_id=canonical_user_id, token=token)
