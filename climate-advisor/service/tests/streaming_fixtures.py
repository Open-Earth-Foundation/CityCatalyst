from __future__ import annotations

import json


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
