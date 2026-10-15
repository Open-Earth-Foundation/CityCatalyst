"""Per-stage time, requests, tokens, and cost of a golden-set run.

The evaluator wraps each fixture stage in ``measure``. While a
``UsageRecorder`` is installed, every OpenRouter response a measured stage's
tasks receive is attributed to that stage and to the agent whose configured
prompt sent it. Cost is what the
response reports: OpenRouter's charge (``usage.cost``) plus, for
bring-your-own-key requests, the provider's charge
(``usage.cost_details.upstream_inference_cost``). Evaluation only; production
code never imports this module.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

import httpx
from app.models.cnb.golden_set import AgentUsage, StageUsage

logger = logging.getLogger(__name__)
_STAGE: ContextVar[StageUsage | None] = ContextVar("golden_set_stage", default=None)
_MODEL_PATHS = ("/api/v1/responses", "/api/v1/chat/completions")


@contextmanager
def measure(usage: StageUsage) -> Iterator[StageUsage]:
    """Time the enclosed stage; an installed recorder also adds its model usage."""
    token = _STAGE.set(usage)
    started = time.monotonic()
    try:
        yield usage
    finally:
        usage.seconds = round(time.monotonic() - started, 1)
        _STAGE.reset(token)


class UsageRecorder:
    """Attribute OpenRouter responses to the stage being measured.

    ``prompts`` maps each configured prompt's text to its name, so a request's
    instructions identify the agent that sent it.
    """

    def __init__(self, prompts: dict[str, str]) -> None:
        self._prompts = prompts
        self._send: Any = None

    def __enter__(self) -> UsageRecorder:
        """Observe every httpx request in this process until exit."""
        self._send = original = httpx.AsyncClient.send
        recorder = self

        async def send(client: httpx.AsyncClient, request: httpx.Request, **kwargs: Any) -> httpx.Response:
            started = time.monotonic()
            response = await original(client, request, **kwargs)
            stage = _STAGE.get()
            if stage is None or not _is_model_call(request):
                return response

            def record(body: bytes) -> None:
                recorder._record(stage, request, _usage(body), time.monotonic() - started)

            if kwargs.get("stream"):
                # Streamed usage arrives in the final event; read it as it passes.
                response.stream = _TeeStream(response.stream, record)
            else:
                record(response.content)
            return response

        httpx.AsyncClient.send = send  # type: ignore[method-assign]
        return self

    def __exit__(self, *exc: object) -> None:
        """Restore httpx."""
        httpx.AsyncClient.send = self._send  # type: ignore[method-assign]

    def _record(
        self, stage: StageUsage, request: httpx.Request, usage: dict[str, Any], seconds: float
    ) -> None:
        """Add one response's usage to the stage and to its agent."""
        try:
            body = json.loads(request.content or b"{}")
        except ValueError:
            body = {}
        agent = stage.agents.setdefault(self._agent(body), AgentUsage())
        details = usage.get("cost_details") or {}
        output_details = usage.get("output_tokens_details") or usage.get("completion_tokens_details") or {}
        for item in (stage, agent):
            item.requests += 1
            item.input_tokens += int(usage.get("input_tokens", usage.get("prompt_tokens")) or 0)
            item.output_tokens += int(usage.get("output_tokens", usage.get("completion_tokens")) or 0)
            item.reasoning_tokens += int(output_details.get("reasoning_tokens") or 0)
            item.cost_usd += float(usage.get("cost") or 0) + float(details.get("upstream_inference_cost") or 0)
            item.request_seconds += seconds

    def _agent(self, body: dict[str, Any]) -> str:
        """The configured prompt that sent a request, or ``other``."""
        instructions = body.get("instructions")
        if instructions is None:
            first = (body.get("messages") or [{}])[0]
            instructions = first.get("content") if first.get("role") in {"system", "developer"} else None
        return self._prompts.get(str(instructions or "").strip(), "other")


class _TeeStream(httpx.AsyncByteStream):
    """Pass a streamed body through unchanged and report it once, when it ends."""

    def __init__(self, inner: Any, done: Any) -> None:
        self._inner = inner
        self._done = done
        self._chunks: list[bytes] = []
        self._reported = False

    async def __aiter__(self) -> Any:
        async for chunk in self._inner:
            self._chunks.append(chunk)
            yield chunk
        self._report()

    async def aclose(self) -> None:
        await self._inner.aclose()
        self._report()

    def _report(self) -> None:
        if not self._reported:
            self._reported = True
            self._done(b"".join(self._chunks))


def _usage(body: bytes) -> dict[str, Any]:
    """Usage of a JSON response, or of the last event of a server-sent stream."""
    try:
        return json.loads(body).get("usage") or {}
    except ValueError:
        pass
    usage: dict[str, Any] = {}
    for line in body.decode("utf-8", "replace").splitlines():
        if not line.startswith("data:") or line.strip() == "data: [DONE]":
            continue
        try:
            event = json.loads(line[5:])
        except ValueError:
            continue
        # Chat Completions chunks carry usage directly; Responses events in "response".
        usage = event.get("usage") or (event.get("response") or {}).get("usage") or usage
    if not usage:
        logger.warning("Golden usage: model response without usage")
    return usage


def _is_model_call(request: httpx.Request) -> bool:
    """Whether a request is an OpenRouter model call."""
    return request.method == "POST" and request.url.host == "openrouter.ai" and request.url.path in _MODEL_PATHS


def prompt_names(prompts: Any) -> dict[str, str]:
    """Map every configured prompt's loaded text to its configuration name."""
    names: dict[str, str] = {}
    for name in type(prompts).model_fields:
        try:
            names[prompts.get_prompt(name).strip()] = name
        except (OSError, ValueError, TypeError):
            continue
    return names
