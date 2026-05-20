"""Small shared HTTP helpers for upstream API calls."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_UPSTREAM_HTTP_TIMEOUT_SECONDS = 30.0
DEFAULT_UPSTREAM_HTTP_MAX_RETRIES = 2
DEFAULT_UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS = 0.5
RETRYABLE_STATUS_CODES = {429, 502, 503, 504}


@dataclass
class UpstreamApiError(Exception):
    """Structured error raised when an upstream HTTP call fails."""

    status_code: int
    message: str
    upstream_status_code: int | None = None
    url: str | None = None

    def __str__(self) -> str:
        """Return the human-readable upstream error message."""
        return self.message


def _get_upstream_http_timeout_seconds() -> float:
    """Return upstream HTTP timeout from env config."""
    raw_value = os.getenv("UPSTREAM_HTTP_TIMEOUT_SECONDS")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_UPSTREAM_HTTP_TIMEOUT_SECONDS
    try:
        parsed = float(raw_value.strip())
    except ValueError as error:
        raise ValueError("UPSTREAM_HTTP_TIMEOUT_SECONDS must be a number") from error
    if parsed <= 0:
        raise ValueError("UPSTREAM_HTTP_TIMEOUT_SECONDS must be > 0")
    return parsed


def _get_upstream_http_max_retries() -> int:
    """Return upstream HTTP retry count from env config."""
    raw_value = os.getenv("UPSTREAM_HTTP_MAX_RETRIES")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_UPSTREAM_HTTP_MAX_RETRIES
    try:
        parsed = int(raw_value.strip())
    except ValueError as error:
        raise ValueError("UPSTREAM_HTTP_MAX_RETRIES must be an integer") from error
    if parsed < 0:
        raise ValueError("UPSTREAM_HTTP_MAX_RETRIES must be >= 0")
    return parsed


def _get_upstream_http_retry_backoff_seconds() -> float:
    """Return upstream HTTP retry backoff from env config."""
    raw_value = os.getenv("UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS
    try:
        parsed = float(raw_value.strip())
    except ValueError as error:
        raise ValueError(
            "UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS must be a number"
        ) from error
    if parsed < 0:
        raise ValueError("UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS must be >= 0")
    return parsed


def _map_upstream_http_status_to_api_status(upstream_status_code: int) -> int:
    """Map upstream HTTP statuses to the status hiap-meed should return."""
    if upstream_status_code == 404:
        return 404
    if upstream_status_code in RETRYABLE_STATUS_CODES:
        return 503
    if upstream_status_code == 408:
        return 504
    return 502


def get_json_with_retries(
    *,
    url: str,
    operation_name: str,
    headers: dict[str, str] | None = None,
) -> tuple[dict[str, Any], int]:
    """GET one JSON payload with simple retries for transient upstream failures."""
    timeout_seconds = _get_upstream_http_timeout_seconds()
    max_retries = _get_upstream_http_max_retries()
    retry_backoff_seconds = _get_upstream_http_retry_backoff_seconds()
    attempts = max_retries + 1

    for attempt_number in range(1, attempts + 1):
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.get(url, headers=headers)
                response.raise_for_status()
                try:
                    payload = response.json()
                except ValueError as error:
                    raise UpstreamApiError(
                        status_code=502,
                        message=f"{operation_name} returned invalid JSON",
                        upstream_status_code=response.status_code,
                        url=url,
                    ) from error
            if not isinstance(payload, dict):
                raise UpstreamApiError(
                    status_code=502,
                    message=f"{operation_name} returned a non-object JSON payload",
                    upstream_status_code=response.status_code,
                    url=url,
                )
            return payload, response.status_code
        except httpx.TimeoutException as error:
            if attempt_number < attempts:
                time.sleep(retry_backoff_seconds)
                continue
            raise UpstreamApiError(
                status_code=504,
                message=f"{operation_name} timed out",
                url=url,
            ) from error
        except (httpx.ConnectError, httpx.NetworkError) as error:
            if attempt_number < attempts:
                time.sleep(retry_backoff_seconds)
                continue
            raise UpstreamApiError(
                status_code=503,
                message=f"{operation_name} is temporarily unavailable",
                url=url,
            ) from error
        except httpx.HTTPStatusError as error:
            upstream_status_code = error.response.status_code
            if (
                upstream_status_code in RETRYABLE_STATUS_CODES
                and attempt_number < attempts
            ):
                time.sleep(retry_backoff_seconds)
                continue
            raise UpstreamApiError(
                status_code=_map_upstream_http_status_to_api_status(
                    upstream_status_code
                ),
                message=(
                    f"{operation_name} failed with upstream status "
                    f"{upstream_status_code}"
                ),
                upstream_status_code=upstream_status_code,
                url=url,
            ) from error
