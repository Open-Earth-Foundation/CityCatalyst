"""Switchable chat panels (tabs) for the CNB agent.

The model supplies only labels and static HTML. CityCatalyst renders the tab
strip itself (accessible, keyboard navigable) and each panel body in the same
sanitized, script-free sandbox as `concept_note_render_visual`.
"""

import json
import logging
from typing import Any

from agents import function_tool
from pydantic import BaseModel

from app.tools.concept_note_visual_tools import NO_VISIBLE_CONTENT_HINT
from app.utils.concept_note_context import VISUAL_PANELS_KIND, VISUAL_RENDER_ACTION
from app.utils.visual_html import has_visible_content

logger = logging.getLogger(__name__)

MAX_PANELS_TITLE_CHARS = 200
MAX_PANEL_LABEL_CHARS = 40
MIN_PANELS = 2
MAX_PANELS = 6
# Same total budget as one visual: every panel is stored and streamed once.
MAX_PANELS_HTML_CHARS = 200_000


class VisualPanel(BaseModel):
    """One switchable panel: a short tab label and its static HTML body."""

    label: str
    html: str


@function_tool
async def concept_note_render_panels(title: str, panels: list[VisualPanel]) -> str:
    """Show switchable cards (tabs) in the chat: one panel visible at a time.

    Use when the user asks for switchable cards, tabs, or panels, e.g. "three
    cards for Overview, Costs and Risks". The chat draws the tab buttons
    itself; the user switches with a click, tap, or the arrow keys. Do NOT draw
    tab buttons, radio inputs, or hidden sections inside the HTML.
    `panels`: 2 to 6 items, each with a distinct `label` (the tab text, at most
    40 characters) and `html`: static HTML for that panel only, with inline
    CSS and inline SVG. Scripts, links, forms and external resources are
    removed. Each panel shows in a chat column 340 to 500 px wide: one fluid
    column, no fixed widths over 320 px, text of at least 12 px. Combined panel
    HTML must stay under 200,000 characters. `title` is required, at most 200
    characters. Never invent numbers: use only data the user gave or the
    context contains, and keep the user's own wording of each panel's content.
    For sections the user should open independently (e.g. project phases),
    do not use this tool: call `concept_note_render_visual` with native
    `<details><summary>Phase</summary>...</details>` elements instead.
    ALWAYS also reply with a short text message describing the panels. They
    are shown in chat only and never change the Concept Note.
    A panel whose HTML would show nothing once scripts and external resources
    are removed returns visual_no_visible_content with its `labels`: fix those
    panels and retry once, then answer in text.
    """
    # Validate the model-supplied payload before the chat renders it.
    title = title.strip()
    labels = [panel.label.strip() for panel in panels]
    if (
        not title
        or len(title) > MAX_PANELS_TITLE_CHARS
        or not MIN_PANELS <= len(panels) <= MAX_PANELS
        or any(not label or len(label) > MAX_PANEL_LABEL_CHARS for label in labels)
        or len({label.casefold() for label in labels}) != len(labels)
        or any(not panel.html.strip() for panel in panels)
    ):
        return _panels_result(False, code="visual_invalid_input")
    html_chars = sum(len(panel.html) for panel in panels)
    if html_chars > MAX_PANELS_HTML_CHARS:
        return _panels_result(
            False,
            data={"html_chars": html_chars, "max_html_chars": MAX_PANELS_HTML_CHARS},
            code="visual_html_too_large",
        )

    # A panel with content only in scripts, iframes or external files would
    # be a blank tab. Name every such panel so one retry can fix them all.
    blank_labels = [
        label
        for label, panel in zip(labels, panels)
        if not has_visible_content(panel.html)
    ]
    if blank_labels:
        return _panels_result(
            False,
            data={**NO_VISIBLE_CONTENT_HINT, "labels": blank_labels},
            code="visual_no_visible_content",
        )

    logger.info(
        "Rendered CNB panels title_chars=%s panels=%s html_chars=%s",
        len(title),
        len(panels),
        html_chars,
    )
    # Like the single visual, the chat reads labels and HTML from the call
    # arguments. Trimmed labels are returned so stream and history agree.
    return _panels_result(
        True,
        data={
            "title": title,
            "kind": VISUAL_PANELS_KIND,
            "labels": labels,
            "html_chars": html_chars,
        },
    )


def _panels_result(
    success: bool, *, data: dict[str, Any] | None = None, code: str | None = None
) -> str:
    """Serialize the result in the shared CNB visual-render envelope."""
    return json.dumps(
        {
            "action": VISUAL_RENDER_ACTION,
            "success": success,
            "data": data,
            "error_code": code,
        },
        ensure_ascii=False,
    )
