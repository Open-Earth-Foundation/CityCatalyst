from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from typing import AsyncIterator

from ..models.requests import MessageCreateRequest
from ..middleware import get_request_id
from ..utils.sse import format_sse
from ..config import get_settings
from ..services.openrouter_client import OpenRouterClient


router = APIRouter()


async def _stream_openrouter(payload: MessageCreateRequest) -> AsyncIterator[bytes]:
    req_id = get_request_id()
    settings = get_settings()

    client = OpenRouterClient(
        api_key=settings.openrouter_api_key or "",
        base_url=settings.openrouter_base_url,
        timeout_ms=settings.request_timeout_ms,
        default_model=settings.openrouter_model,
    )

    # Build OpenAI-style messages
    system_prompt = (
        "You are Climate Advisor. Answer concisely and accurately."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": payload.content},
    ]

    idx = 0
    try:
        async for token in client.stream_chat(
            messages=messages,
            model=(payload.options or {}).get("model") if payload.options else None,
            temperature=(payload.options or {}).get("temperature") if payload.options else None,
            max_tokens=(payload.options or {}).get("max_tokens") if payload.options else None,
            request_id=req_id,
        ):
            if token:
                yield format_sse({"index": idx, "content": token}, event="message", id=str(idx)).encode(
                    "utf-8"
                )
                idx += 1
        # terminal event
        yield format_sse({"ok": True, "request_id": req_id}, event="done").encode("utf-8")
    except Exception as exc:
        # stream error then done
        yield format_sse({"message": str(exc)}, event="error").encode("utf-8")
        yield format_sse({"ok": False, "request_id": req_id}, event="done").encode("utf-8")
    finally:
        await client.aclose()


@router.post("/messages")
async def post_message(payload: MessageCreateRequest, request: Request):
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(_stream_openrouter(payload), media_type="text/event-stream", headers=headers)
