"""Chat-only HTML visuals for the CNB agent; the frontend renders them sandboxed."""

import json
import logging
from typing import Any

from agents import function_tool
from app.utils.concept_note_context import VISUAL_RENDER_ACTION

logger = logging.getLogger(__name__)

MAX_VISUAL_TITLE_CHARS = 200
MAX_VISUAL_HTML_CHARS = 200_000


@function_tool
async def concept_note_render_visual(title: str, html: str) -> str:
    """Show one self-contained HTML visual (chart, diagram or table) in the chat.

    Use only when a visual genuinely helps the user: a chart of numbers already
    in the context, a diagram such as a theory of change or logframe, or a
    comparison table. `html` must be ONE complete HTML document with inline data,
    CSS and JS. Never load data over the network (no fetch, XHR or WebSocket);
    load external scripts only from https://cdn.jsdelivr.net. No forms or inputs
    collecting user data. Keep it under about 100 KB (hard limit 200,000
    characters). Never invent numbers: use only data from the context and label
    its sources. `title` is required, at most 200 characters.
    It shows in a chat column 340 to 500 px wide that fits up to 720 px of
    height before scrolling: use one fluid column at width 100%, no fixed
    widths over 320 px, at most 4 table columns, the key result first, and no
    vh or 100% heights.
    ALWAYS also reply with a short text message describing the visual. The visual
    is shown in chat only; it never changes the Concept Note.
    """
    # Validate the model-supplied payload before the chat renders it.
    title = title.strip()
    if not title or len(title) > MAX_VISUAL_TITLE_CHARS or not html.strip():
        return _visual_result(False, code="visual_invalid_input")
    if len(html) > MAX_VISUAL_HTML_CHARS:
        return _visual_result(
            False,
            data={"html_chars": len(html), "max_html_chars": MAX_VISUAL_HTML_CHARS},
            code="visual_html_too_large",
        )

    logger.info(
        "Rendered CNB visual title_chars=%s html_chars=%s", len(title), len(html)
    )
    return _visual_result(True, data={"title": title, "html": html})


def _visual_result(
    success: bool, *, data: dict[str, Any] | None = None, code: str | None = None
) -> str:
    """Serialize the visual result in the shared CNB tool-result envelope."""
    return json.dumps(
        {
            "action": VISUAL_RENDER_ACTION,
            "success": success,
            "data": data,
            "error_code": code,
        },
        ensure_ascii=False,
    )
