"""Chat-only HTML visuals for the CNB agent; the frontend renders them sandboxed."""

import json
import logging
from collections.abc import Callable
from typing import Any

from agents import function_tool
from app.utils.concept_note_context import VISUAL_RENDER_ACTION
from app.utils.visual_html import (
    has_visible_content,
    needs_svg,
    svg_animation_elements,
    unsupported_html_features,
)

logger = logging.getLogger(__name__)

MAX_VISUAL_TITLE_CHARS = 200
MAX_VISUAL_HTML_CHARS = 200_000
# Each hint below is the model's only guidance for its error code, so it
# carries the one-retry limit itself.
_ANSWER_IN_TEXT = (
    "If that also fails, do not call the tool again; answer in text with the "
    "same values."
)
NO_VISIBLE_CONTENT_HINT = {
    "reason": "Nothing would be visible after scripts, links, forms, iframes "
    "and external resources are removed.",
    "next_step": "Retry once with the content as HTML text or inline SVG "
    f"shapes and labels. {_ANSWER_IN_TEXT}",
}
NEEDS_SVG_HINT = {
    "reason": "Scripts never run in the chat, so a <canvas> stays empty and "
    "Mermaid source shows as text.",
    "next_step": "Draw it as inline SVG with shapes and text labels, then "
    f"retry once. {_ANSWER_IN_TEXT}",
}
UNSUPPORTED_HTML_HINT = {
    "reason": "The chat runs no scripts and loads nothing from the network, so "
    "the listed `features` would show but do nothing, or stay empty or broken.",
    "next_step": "Replace each one: buttons, sliders, text inputs and :target "
    "tabs with radio, checkbox, select or details controls styled with "
    ":checked or :has() and every state precomputed; scripts with the static "
    "result; foreignObject with SVG <text>; external images, fonts, "
    "stylesheets and frames with inline SVG, inline CSS or data: URLs. Then "
    f"retry once. {_ANSWER_IN_TEXT}",
}
SVG_ANIMATION_HINT = {
    "reason": "SVG animation elements are removed, so the chart would stay in "
    "its start state.",
    "next_step": "Remove them, write the final state in the attributes and "
    f"animate only with CSS @keyframes, then retry once. {_ANSWER_IN_TEXT}",
}


def _blank(html: str) -> dict[str, Any] | None:
    return None if has_visible_content(html) else {}


def _mermaid(html: str) -> dict[str, Any] | None:
    return {} if needs_svg(html) else None


def _unsupported(html: str) -> dict[str, Any] | None:
    features = unsupported_html_features(html)
    return {"features": features} if features else None


def _svg_animation(html: str) -> dict[str, Any] | None:
    elements = svg_animation_elements(html)
    return {"elements": elements} if elements else None


# Static HTML checks in the order they run: (error code, check, hint). A check
# returns None when the HTML passes, else the details to report.
VISUAL_HTML_CHECKS: tuple[
    tuple[str, Callable[[str], dict[str, Any] | None], dict[str, str]], ...
] = (
    # Content only in scripts, iframes or external files leaves a blank card.
    ("visual_no_visible_content", _blank, NO_VISIBLE_CONTENT_HINT),
    ("visual_needs_svg", _mermaid, NEEDS_SVG_HINT),
    # Scripts, dead controls and network resources show but never work.
    ("visual_unsupported_html", _unsupported, UNSUPPORTED_HTML_HINT),
    ("visual_uses_svg_animation", _svg_animation, SVG_ANIMATION_HINT),
)


@function_tool
async def concept_note_render_visual(title: str, html: str) -> str:
    """Show one static HTML visual (chart, diagram, table or expandable sections).

    Call when the user asks for a chart, diagram, table or expandable sections,
    or when a pattern across series, a flow, or many values is hard to read in
    text. Not for single facts, short lists, capability questions or edits.
    For switchable cards or tabs use radio inputs and labels styled with
    `:checked`. For KPI cards, metric tiles or a dashboard of numbers, use a
    grid of cards.
    `html` must be ONE complete, static HTML document with inline CSS and
    inline SVG. Scripts, links, forms, SVG animation and external resources
    are removed before display, so draw charts as inline SVG and never rely on
    JavaScript; animate only with CSS @keyframes. Buttons, sliders, search
    boxes and links do not work. Native controls do work without scripts (radio inputs,
    select, checkbox and details styled with `:checked` or `:has()`);
    precompute every state from the given data. Keep it under about 100 KB
    (hard limit 200,000 characters). Never invent numbers: use only data from
    the conversation, context or source results and label its sources.
    `title` is required, at most 200 characters.
    It shows in a chat column 340 to 500 px wide that fits up to 1200 px of
    height before scrolling: one fluid column at width 100%, each SVG with
    viewBox width 320 and font-size of at least 12, no fixed widths over 320 px,
    the key result first, and no vh or 100% heights. Mini charts in a 2-column
    grid use viewBox width 150 and font-size of at least 13. Print every exact
    value with its unit as visible text, not only on hover. Put legends in HTML
    below the chart, not inside the SVG. Tables keep units only in their headers
    and at most 4 columns; a wider table stays one table with sticky row
    labels, never one row split across tables. For long lists
    show the leaders first and the complete list in `<details>`.
    ALWAYS also reply with a short text answer giving the main result, its
    exact values and the data source; never paste the HTML instead. The visual
    is shown in chat only; it never changes the Concept Note.
    HTML that would show nothing once scripts and external resources are
    removed returns visual_no_visible_content: retry once, then answer in text.
    Mermaid source without SVG returns visual_needs_svg; scripts, buttons,
    sliders, text inputs, :target tabs, foreignObject and external files
    visual_unsupported_html with the `features` to replace; and SVG animation
    elements visual_uses_svg_animation: follow `next_step`, retry once, then
    answer in text.
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

    for code, check, hint in VISUAL_HTML_CHECKS:
        details = check(html)
        if details is not None:
            return _visual_result(False, data={**details, **hint}, code=code)

    logger.info(
        "Rendered CNB visual title_chars=%s html_chars=%s", len(title), len(html)
    )
    # The chat reads the HTML from the call arguments; repeating it here would
    # store and stream every visual twice more.
    return _visual_result(True, data={"title": title, "html_chars": len(html)})


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
