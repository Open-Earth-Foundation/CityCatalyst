from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from typing import Iterator

from ..models.requests import MessageCreateRequest
from ..middleware import get_request_id
from ..utils.sse import format_sse, chunk_text


router = APIRouter()


def _stream_echo(content: str) -> Iterator[bytes]:
    req_id = get_request_id()
    # Simple heuristic: 2 chunks for short text, else 3
    chunks_n = 2 if len(content) < 40 else 3
    for idx, part in enumerate(chunk_text(content, chunks=chunks_n)):
        payload = {"index": idx, "content": part}
        yield format_sse(payload, event="message", id=str(idx)).encode("utf-8")
    # terminal event
    yield format_sse({"ok": True, "request_id": req_id}, event="done").encode("utf-8")


@router.post("/messages")
async def post_message(payload: MessageCreateRequest, request: Request):
    # Echo streaming SSE response compatible with CC
    generator = _stream_echo(payload.content)
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generator, media_type="text/event-stream", headers=headers)

