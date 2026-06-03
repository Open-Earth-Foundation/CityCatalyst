"""Shared OpenAI client initialization for hiap-meed features."""

from __future__ import annotations

import os
from openai import OpenAI

from app.config.llm_settings import get_llm_settings


def _get_openai_timeout_seconds() -> float:
    """Return OpenAI client timeout in seconds from shared YAML config."""
    parsed = get_llm_settings().openai.timeout_seconds
    if parsed <= 0:
        raise ValueError("openai.timeout_seconds in llm_config.yaml must be > 0")
    return parsed


def _get_openai_max_retries() -> int:
    """Return OpenAI client max retries from shared YAML config."""
    parsed = get_llm_settings().openai.max_retries
    if parsed < 0:
        raise ValueError("openai.max_retries in llm_config.yaml must be >= 0")
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
