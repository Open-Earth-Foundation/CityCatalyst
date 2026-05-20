"""Shared OpenAI client initialization for hiap-meed features."""

from __future__ import annotations

import os
from openai import OpenAI

DEFAULT_OPENAI_TIMEOUT_SECONDS = 30.0
DEFAULT_OPENAI_MAX_RETRIES = 3


def _get_openai_timeout_seconds() -> float:
    """Return OpenAI client timeout in seconds from shared environment config."""
    raw_value = os.getenv("OPENAI_TIMEOUT_SECONDS")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_OPENAI_TIMEOUT_SECONDS
    try:
        parsed = float(raw_value.strip())
    except ValueError as error:
        raise ValueError("OPENAI_TIMEOUT_SECONDS must be a number") from error
    if parsed <= 0:
        raise ValueError("OPENAI_TIMEOUT_SECONDS must be > 0")
    return parsed


def _get_openai_max_retries() -> int:
    """Return OpenAI client max retries from shared environment config."""
    raw_value = os.getenv("OPENAI_MAX_RETRIES")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_OPENAI_MAX_RETRIES
    try:
        parsed = int(raw_value.strip())
    except ValueError as error:
        raise ValueError("OPENAI_MAX_RETRIES must be an integer") from error
    if parsed < 0:
        raise ValueError("OPENAI_MAX_RETRIES must be >= 0")
    return parsed


def create_openai_client() -> OpenAI:
    """Create an OpenAI client using shared env-based API key and runtime config."""
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key is None or not api_key.strip():
        raise ValueError("OPENAI_API_KEY must be set to call OpenAI APIs")

    return OpenAI(
        api_key=api_key.strip(),
        timeout=_get_openai_timeout_seconds(),
        max_retries=_get_openai_max_retries(),
    )
