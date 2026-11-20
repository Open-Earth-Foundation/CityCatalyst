"""Chat-only HTML visuals for the CNB agent; the frontend renders them sandboxed."""

import json
import logging
from typing import Any

from agents import function_tool
from app.services.cnb.visual_data import VisualData, check_visual_data
from app.utils.concept_note_context import VISUAL_RENDER_ACTION
from app.utils.visual_html import has_visible_content, smallest_svg_text_px

logger = logging.getLogger(__name__)

MAX_VISUAL_TITLE_CHARS = 200
MAX_VISUAL_HTML_CHARS = 200_000
# Smaller SVG text is unreadable on a phone, where the chat shows a 320 px column.
MIN_SVG_TEXT_PX = 11
# Returned with visual_no_visible_content; the result is the model's only
# guidance for this code, so it carries the one-retry limit itself.
NO_VISIBLE_CONTENT_HINT = {
    "reason": "Nothing would be visible after scripts, links, forms, iframes "
    "and external resources are removed.",
    "next_step": "Retry once with the content as HTML text or inline SVG "
    "shapes and labels. If that also fails, do not call the tool again; "
    "answer in text with the same values.",
}
# Shared by the visual and panel tools, which both return visual_text_too_small.
TEXT_TOO_SMALL_HINT = {
    "reason": "Some SVG text would be smaller than 11 px once drawn in the chat.",
    "next_step": "Use viewBox width 320 (150 for mini charts in a 2-column grid) "
    "and font-size of at least 12 (13 in mini charts), then retry once. If that "
    "also fails, do not call the tool again; answer in text with the same values.",
}


@function_tool
async def concept_note_render_visual(
    title: str, html: str, data: VisualData | None = None
) -> str:
    """Show one static HTML visual (chart, diagram, table or expandable sections).

    Call when the user asks for a chart, diagram, table or expandable sections,
    or when a pattern across series, a flow, or many values is hard to read in
    text. Not for single facts, short lists, capability questions or edits.
    For switchable cards or tabs use `concept_note_render_panels` instead.
    For KPI cards, metric tiles or a dashboard of numbers, use one visual with
    a grid of cards, not panels.
    `html` must be ONE complete, static HTML document with inline CSS and
    inline SVG. Scripts, links, forms, SVG animation and external resources
    are removed before display, so draw charts as inline SVG and never rely on
    JavaScript. Buttons, search boxes and links do not work. Native controls do
    work without scripts (radio inputs, select, checkbox and details styled with
    `:checked` or `:has()`); precompute every state from the given data. Keep it
    under about 100 KB (hard limit 200,000 characters). Never invent numbers:
    use only data from the conversation, context or source results and label
    its sources.
    `title` is required, at most 200 characters.
    It shows in a chat column 340 to 500 px wide that fits up to 1200 px of
    height before scrolling: one fluid column at width 100%, each SVG with
    viewBox width 320 and font-size of at least 12, no fixed widths over 320 px,
    the key result first, and no vh or 100% heights. Mini charts in a 2-column
    grid use viewBox width 150 and font-size of at least 13. Print every exact
    value with its unit as visible text, not only on hover. Put legends in HTML
    below the chart, not inside the SVG. Tables keep units only in their headers
    and at most 4 columns; split a wider table into tables that repeat the row
    label. For long lists show the leaders first and the complete list in
    `<details>`.
    ALWAYS also reply with a short text answer giving the main result, its
    exact values and the data source; never paste the HTML instead. The visual
    is shown in chat only; it never changes the Concept Note.
    HTML that would show nothing once scripts and external resources are
    removed returns visual_no_visible_content: retry once, then answer in text.
    SVG text under 11 px returns visual_text_too_small with `smallest_text_px`:
    retry once with viewBox width 320 (150 for mini charts in a 2-column grid)
    and font-size of at least 12 (13 in mini charts), then answer in text.
    When the visual shows numbers, pass `data` with every plotted value: its
    unit, its source (document values cite source_index and the page or anchor
    of the concept_note_sources_query excerpt) and its status. Use status
    missing with value null for gaps (never 0), conflicting with every
    disagreeing sourced value in alternatives, and derived for values you
    computed (totals, differences, counts, products), with derived_from naming
    the input point labels or describing each input briefly. Use method sum
    only for a plain total of listed points, which is recomputed exactly;
    otherwise use other. In the HTML print each value, the unit, the
    source label, "not reported" for gaps and every conflicting value. Pass
    data null for visuals without numbers. Invalid data returns
    visual_data_invalid with `issues` to fix; `data_check.warnings` lists
    declared values or gaps the HTML does not show, so fix or mention them.
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

    # Content only in scripts, iframes or external files leaves a blank card.
    if not has_visible_content(html):
        return _visual_result(
            False, data=NO_VISIBLE_CONTENT_HINT, code="visual_no_visible_content"
        )

    # SVG text drawn below the readable minimum in a phone-width column.
    smallest_px = smallest_svg_text_px(html)
    if smallest_px is not None and smallest_px < MIN_SVG_TEXT_PX:
        return _visual_result(
            False,
            data={"smallest_text_px": round(smallest_px, 1), **TEXT_TOO_SMALL_HINT},
            code="visual_text_too_small",
        )

    # Optional data metadata: invalid provenance blocks, visibility gaps warn.
    data_check = check_visual_data(data, html) if data is not None else None
    if data_check is not None and data_check["issues"]:
        return _visual_result(
            False,
            data={"issues": data_check["issues"]},
            code="visual_data_invalid",
        )

    logger.info(
        "Rendered CNB visual title_chars=%s html_chars=%s", len(title), len(html)
    )
    # The chat reads the HTML from the call arguments; repeating it here would
    # store and stream every visual twice more.
    result = {"title": title, "html_chars": len(html)}
    if data_check is not None:
        result["data_check"] = {
            "summary": data_check["summary"],
            "warnings": data_check["warnings"],
        }
    return _visual_result(True, data=result)


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
