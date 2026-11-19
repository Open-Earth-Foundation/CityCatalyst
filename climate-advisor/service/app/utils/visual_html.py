"""Detect CNB visual HTML that would be blank once the chat sanitizes it.

The chat strips scripts, links, forms, embedded frames and external resources
(see app/src/components/ConceptNoteWorkspace/chat-visual-frame.tsx). A document
whose only content lives in those parts renders as an empty card, so the tool
rejects it before reporting success. This is a cheap static check for obvious
cases; the browser re-checks the rendered result.
"""

from html.parser import HTMLParser

# Elements whose content is never shown: dropped by the sanitizer or not
# rendered. noscript, canvas and object keep fallback text in the chat, but
# that text ("enable JavaScript") is not the visual, so it does not count.
_HIDDEN_ELEMENTS = frozenset(
    {
        "script",
        "style",
        "noscript",
        "template",
        "title",
        "desc",
        "metadata",
        "foreignobject",  # The sanitizer drops it with its content.
        "iframe",
        "object",
        "embed",
        "canvas",  # Without scripts a canvas never gets drawn.
    }
)
# SVG shapes that draw without any text. <image> and <use> are absent: the
# sanitizer drops their href, so they render nothing.
_SVG_SHAPES = frozenset(
    {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
)
# HTML elements that show something without text content.
_SELF_VISIBLE = frozenset({"hr", "input", "select", "textarea", "meter", "progress"})


class _VisibleContentFinder(HTMLParser):
    """Stops at the first text or element the sanitized document would show."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found = False
        self._hidden_depth = 0
        self._svg_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _HIDDEN_ELEMENTS:
            self._hidden_depth += 1
            return
        if self._hidden_depth:
            return
        if tag == "svg":
            self._svg_depth += 1
        elif (self._svg_depth and tag in _SVG_SHAPES) or tag in _SELF_VISIBLE:
            self.found = True
        elif tag == "img":
            # The frame's CSP only loads data: images.
            src = (dict(attrs).get("src") or "").strip().lower()
            self.found = self.found or src.startswith("data:image/")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # Self-closing tags (<rect/>) open nothing, so skip the depth counters.
        if tag not in _HIDDEN_ELEMENTS and tag != "svg":
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in _HIDDEN_ELEMENTS:
            self._hidden_depth = max(0, self._hidden_depth - 1)
        elif tag == "svg" and not self._hidden_depth:
            self._svg_depth = max(0, self._svg_depth - 1)

    def handle_data(self, data: str) -> None:
        if not self._hidden_depth and data.strip():
            self.found = True


def has_visible_content(html: str) -> bool:
    """Return whether the visual keeps any text or drawing after sanitizing.

    Text inside links or forms counts: the sanitizer keeps it and drops only
    the element. Conservative by design; a False means the card would be blank.
    """
    finder = _VisibleContentFinder()
    finder.feed(html)
    finder.close()
    return finder.found
