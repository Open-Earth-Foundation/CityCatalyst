"""Shared OpenRouter client configuration helpers for Climate Advisor services."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any


DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_OPENROUTER_REFERER = "https://citycatalyst.ai"
DEFAULT_OPENROUTER_TITLE = "CityCatalyst Climate Advisor"


@dataclass(frozen=True)
class OpenRouterClientOptions:
    """Resolved AsyncOpenAI constructor kwargs and normalized base URL."""

    base_url: str
    kwargs: dict[str, Any]


def build_openrouter_client_options(
    settings: Any,
    *,
    missing_api_key_message: str,
    error_cls: type[Exception] = ValueError,
    default_retries: int = 2,
) -> OpenRouterClientOptions:
    """Resolve shared OpenRouter AsyncOpenAI settings from Climate Advisor config."""

    api_key = getattr(settings, "openrouter_api_key", None)
    if not api_key:
        raise error_cls(missing_api_key_message)

    openrouter_settings = getattr(settings.llm.api, "openrouter", None)
    timeout_ms = getattr(openrouter_settings, "timeout_ms", None) or 30000
    max_retries = getattr(openrouter_settings, "retry_attempts", None) or default_retries
    base_url = (
        getattr(settings, "openrouter_base_url", None)
        or getattr(openrouter_settings, "base_url", None)
        or DEFAULT_OPENROUTER_BASE_URL
    ).rstrip("/")
    referer = os.getenv("OPENROUTER_REFERER") or DEFAULT_OPENROUTER_REFERER
    title = os.getenv("OPENROUTER_TITLE") or DEFAULT_OPENROUTER_TITLE

    return OpenRouterClientOptions(
        base_url=base_url,
        kwargs={
            "api_key": api_key,
            "base_url": base_url,
            "timeout": timeout_ms / 1000,
            "max_retries": max_retries,
            "default_headers": {
                "HTTP-Referer": referer,
                "X-Title": title,
                "Accept": "application/json",
            },
        },
    )
