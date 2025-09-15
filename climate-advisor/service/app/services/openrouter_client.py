from __future__ import annotations

import json
from typing import AsyncIterator, Dict, List, Optional

import httpx
from loguru import logger


class OpenRouterClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://openrouter.ai/api/v1",
        timeout_ms: int = 30000,
        default_model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(timeout_ms / 1000)
        self.default_model = default_model
        self._client: Optional[httpx.AsyncClient] = None

    def _headers(self, request_id: Optional[str] = None) -> Dict[str, str]:
        h = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if request_id:
            h["X-Request-Id"] = request_id
        return h

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        request_id: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Yield content tokens from OpenRouter (OpenAI-compatible stream)."""

        payload: Dict[str, object] = {
            "model": model or self.default_model or "openrouter/auto",
            "messages": messages,
            "stream": True,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        url = f"{self.base_url}/chat/completions"

        client = await self._get_client()
        try:
            async with client.stream(
                "POST", url, headers=self._headers(request_id), json=payload
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data = line.removeprefix("data: ").strip()
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                        except json.JSONDecodeError:
                            logger.debug("openrouter_stream_nonjson", data=data[:200])
                            continue
                        # choices[0].delta.content (OpenAI-style)
                        try:
                            delta = obj["choices"][0].get("delta") or {}
                            content = delta.get("content")
                            if content:
                                yield content
                        except Exception:
                            # Some providers use 'choices[].message' in final chunks
                            msg = obj.get("choices", [{}])[0].get("message", {})
                            content = msg.get("content")
                            if content:
                                yield content
        except httpx.HTTPStatusError as e:
            # Surface limited details; caller should emit SSE error
            status = e.response.status_code if e.response else None
            text = None
            try:
                text = e.response.text
            except Exception:
                pass
            logger.error("openrouter_http_error", status=status, body=(text[:200] if text else None))
            raise
        except Exception:
            logger.exception("openrouter_stream_error")
            raise

