"""Request-scoped CityCatalyst token renewal for authenticated chat turns."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Optional

from app.utils.token_manager import is_token_expired

TokenRef = dict[str, Optional[str]]
TokenRefresh = Callable[[str], Awaitable[tuple[str, int]]]

# Core capability and datasource calls can run for 90 seconds. Keep the turn's
# bearer lifetime aligned with the 10-minute issuance margin so a supported
# request cannot start with less remaining time than its maximum timeout.
_TOKEN_REFRESH_BUFFER_SECONDS = 10 * 60


class RequestTokenRefreshContext:
    """Renew only the canonical identity's token captured at a write boundary."""

    def __init__(self, *, canonical_user_id: str, token: str) -> None:
        """Initialize a request-owned token reference for one authenticated turn."""
        self.canonical_user_id = canonical_user_id
        self.token_ref: TokenRef = {"value": token}
        self._refresh_lock = asyncio.Lock()

    async def token_for_request(self, refresh_token: TokenRefresh) -> str:
        """Return the active token, renewing it before it expires when necessary."""
        # Avoid locking normal tool calls; only near-expiry tokens need renewal.
        token = self.token_ref.get("value")
        if not token:
            raise ValueError("Authenticated request token is missing")
        if not is_token_expired(token, buffer_seconds=_TOKEN_REFRESH_BUFFER_SECONDS):
            return token

        async with self._refresh_lock:
            # Another concurrent tool may have renewed the shared token first.
            token = self.token_ref.get("value")
            if not token:
                raise ValueError("Authenticated request token is missing")
            if not is_token_expired(
                token,
                buffer_seconds=_TOKEN_REFRESH_BUFFER_SECONDS,
            ):
                return token

            renewed_token, _ = await refresh_token(self.canonical_user_id)
            self.token_ref["value"] = renewed_token
            return renewed_token
