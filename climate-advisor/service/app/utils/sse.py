from typing import Iterable, Optional
import json


def format_sse(data: dict | str, event: Optional[str] = None, id: Optional[str] = None) -> str:
    """Format a dict or string into an SSE event string."""
    lines = []
    if event:
        lines.append(f"event: {event}")
    if id:
        lines.append(f"id: {id}")
    if isinstance(data, (dict, list)):
        payload = json.dumps(data, ensure_ascii=False)
    else:
        payload = str(data)
    # Split payload by lines to respect SSE spec
    for line in payload.splitlines() or [""]:
        lines.append(f"data: {line}")
    lines.append("")  # end of event
    return "\n".join(lines) + "\n"


def chunk_text(text: str, chunks: int = 3) -> Iterable[str]:
    """Split text into N roughly equal chunks (min 2)."""
    chunks = max(2, chunks)
    n = len(text)
    if n == 0:
        yield ""
        return
    step = max(1, n // chunks)
    for i in range(0, n, step):
        yield text[i : min(n, i + step)]

