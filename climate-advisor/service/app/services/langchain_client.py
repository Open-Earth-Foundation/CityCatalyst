"""
Lightweight wrapper around the OpenAI/Responses client for OpenRouter.

This module exposes a thin abstraction that lets the application request
Response API streams without dealing with configuration plumbing in the FastAPI
layer. It deliberately keeps the interface minimal – just enough for the
messages route to convert conversation state into Response API inputs.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Iterable, List, Optional

from openai import AsyncOpenAI

from ..config.settings import LLMConfig

logger = logging.getLogger(__name__)


class OpenRouterResponsesClient:
    """Wrapper around AsyncOpenAI configured for the Responses API."""

    def __init__(
        self,
        api_key: str,
        llm_config: Optional[LLMConfig] = None,
        *,
        base_url: Optional[str] = None,
        timeout_ms: Optional[int] = None,
        default_model: Optional[str] = None,
        default_temperature: Optional[float] = None,
        default_headers: Optional[Dict[str, str]] = None,
        max_retries: int = 2,
    ) -> None:
        self.llm_config = llm_config
        self._default_model = default_model
        self._default_temperature = default_temperature

        resolved_base_url: Optional[str] = base_url
        resolved_timeout: Optional[float] = None

        if llm_config:
            resolved_base_url = (
                base_url or llm_config.api.openrouter.base_url
            ).rstrip("/")
            config_timeout_ms = (
                timeout_ms
                if timeout_ms is not None
                else llm_config.api.openrouter.timeout_ms
            )
            if config_timeout_ms is None:
                raise ValueError(
                    "timeout_ms must be provided either directly or via "
                    "llm_config.api.openrouter.timeout_ms"
                )
            resolved_timeout = config_timeout_ms / 1000
            if self._default_model is None:
                self._default_model = llm_config.models.get("default", "openrouter/auto")
            if self._default_temperature is None:
                self._default_temperature = llm_config.generation.defaults.temperature
        else:
            resolved_base_url = (base_url or "https://openrouter.ai/api/v1").rstrip("/")
            resolved_timeout = (timeout_ms or 30000) / 1000
            self._default_model = self._default_model or "openrouter/auto"
            self._default_temperature = self._default_temperature or 0.1

        if api_key is None:
            raise ValueError("OpenRouter API key must be provided")

        headers: Dict[str, str] = {}
        if default_headers:
            headers.update(default_headers)

        referer = os.getenv("OPENROUTER_REFERER") or "https://citycatalyst.ai"
        title = os.getenv("OPENROUTER_TITLE") or "CityCatalyst Climate Advisor"

        headers.setdefault("HTTP-Referer", referer)
        headers.setdefault("X-Title", title)
        headers.setdefault("Accept", "application/json")

        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=resolved_base_url,
            timeout=resolved_timeout,
            default_headers=headers,
            max_retries=max_retries,
        )

    @property
    def default_model(self) -> str:
        if not self._default_model:
            raise RuntimeError("Default model is not configured")
        return self._default_model

    @property
    def default_temperature(self) -> float:
        if self._default_temperature is None:
            raise RuntimeError("Default temperature is not configured")
        return self._default_temperature

    def stream_response(
        self,
        *,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Dict[str, Any]] | str | None = None,
        stream_options: Optional[Dict[str, Any]] = None,
    ):
        """Invoke the Chat Completions API with streaming enabled."""
        payload: Dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
        }

        payload["temperature"] = (
            temperature if temperature is not None else self.default_temperature
        )

        if tools:
            payload["tools"] = tools
            payload["parallel_tool_calls"] = True
            if tool_choice:
                payload["tool_choice"] = tool_choice

        if stream_options:
            payload["stream_options"] = stream_options

        logger.debug(
            "Starting Chat Completions stream - model=%s messages=%s tools=%s",
            payload["model"],
            len(messages),
            len(tools) if tools else 0,
        )

        return self._client.chat.completions.stream(**payload)

    async def aclose(self) -> None:
        """Dispose the underlying HTTP client."""
        await self._client.close()
