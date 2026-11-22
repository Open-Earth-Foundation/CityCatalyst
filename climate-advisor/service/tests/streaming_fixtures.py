"""SSE parsing and a controlled Responses-API provider stream for chat tests."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

import httpx


def _parse_sse_payload(chunk: bytes) -> dict:
    event_type = None
    data_lines: list[str] = []

    for line in chunk.decode("utf-8").splitlines():
        if line.startswith("event:"):
            event_type = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())

    return {
        "event": event_type,
        "data": json.loads("\n".join(data_lines)),
    }


def _event(kind: str, **fields: object) -> dict:
    return {"type": kind, "sequence_number": 1, **fields}


def _delta(text: str) -> dict:
    return _event(
        "response.output_text.delta",
        item_id="msg-test",
        content_index=0,
        output_index=0,
        delta=text,
        logprobs=[],
    )


def _completed(output: list[dict]) -> dict:
    return _event(
        "response.completed",
        response={
            "id": "resp-test",
            "object": "response",
            "created_at": 1,
            "status": "completed",
            "model": "test-model",
            "output": output,
            "parallel_tool_calls": False,
            "tool_choice": "auto",
            "tools": [],
        },
    )


def _answer() -> list[dict]:
    return [
        _delta("Recovered answer"),
        _completed(
            [
                {
                    "type": "message",
                    "id": "msg-test",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Recovered answer",
                            "annotations": [],
                        }
                    ],
                }
            ]
        ),
    ]


def _tool_call(*, status: str = "completed", arguments: str = "{}") -> dict:
    return {
        "type": "function_call",
        "id": "fc-test",
        "call_id": "call-test",
        "name": "update_note",
        "arguments": arguments,
        "status": status,
    }


class ProviderStream(httpx.AsyncByteStream):
    """Replay provider SSE events, then optionally fail mid-body."""

    def __init__(self, events: list[dict], error: Exception | None = None) -> None:
        self.events = events
        self.error = error
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for event in self.events:
            yield ("data: " + json.dumps(event) + "\n\n").encode()
            await asyncio.sleep(0)
        if self.error is not None:
            raise self.error

    async def aclose(self) -> None:
        self.closed = True
