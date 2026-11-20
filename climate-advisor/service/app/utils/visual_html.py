"""Detect CNB visual HTML that would be blank once the chat sanitizes it.

The chat strips scripts, links, forms, embedded frames and external resources
(see app/src/components/ConceptNoteWorkspace/chat-visual-frame.tsx). A document
whose only content lives in those parts renders as an empty card, so the tool
rejects it before reporting success. This is a cheap static check for obvious
cases; the browser re-checks the rendered result.
"""

import re
from html.parser import HTMLParser
from typing import NamedTuple

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


# Plain numbers or px only. em, %, rem and keywords such as "small" do not match.
_PX_VALUE = re.compile(r"(\d*\.?\d+)(?:px)?")
_CSS_FONT_SIZE = re.compile(r"font-size\s*:\s*([^;}]+)")
_CSS_RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
# Style rules whose selector names text, tspan or svg can size SVG text.
_SVG_TEXT_SELECTOR = re.compile(r"\b(?:text|tspan|svg)\b")
_SVG_TEXT_ELEMENTS = frozenset({"text", "tspan", "textpath"})
# Mini charts sit two to a row in the chat, so a phone draws each one about
# 140 px wide. A top-level viewBox up to 200 wide is treated as a mini chart;
# wider svgs fill the full column.
MINI_CHART_MAX_VIEWBOX = 200
MINI_CHART_PX = 140


class _OpenElement(NamedTuple):
    """One open element: its font size and where it sits relative to svg."""

    tag: str
    font_px: float | None  # Own or inherited size; None when unknown.
    in_svg: bool
    svg_width: float | None  # viewBox width of the top-level svg, if any.


def _to_px(value: str | None) -> float | None:
    """Parse a plain number or px length; any other value gives None."""
    if value is None:
        return None
    match = _PX_VALUE.fullmatch(value.replace("!important", "").strip().lower())
    return float(match.group(1)) if match else None


def _declared_px(declarations: str) -> float | None:
    """Return the font-size that wins in a declaration block (the last one)."""
    values = _CSS_FONT_SIZE.findall(declarations)
    return _to_px(values[-1]) if values else None


def _viewbox_width(viewbox: str | None) -> float | None:
    """Return the width from a viewBox, or None when it is missing or invalid."""
    if not viewbox:
        return None
    parts = re.split(r"[\s,]+", viewbox.strip())
    if len(parts) != 4:
        return None
    width = _to_px(parts[2])
    return width if width else None


def _rendered_px(size: float, svg_width: float | None, column_px: int) -> float:
    """Scale a font size by how far its top-level svg shrinks where it is drawn.

    A mini chart (viewBox up to MINI_CHART_MAX_VIEWBOX wide) is drawn
    MINI_CHART_PX wide. Any other svg fills the column_px wide chat column.
    Each svg scales by min(1, draw_px / viewBox width). A narrower viewBox is
    not enlarged here, so this can understate the drawn size but never
    overstate it.
    """
    if svg_width is None:
        return size
    draw_px = MINI_CHART_PX if svg_width <= MINI_CHART_MAX_VIEWBOX else column_px
    return size * min(draw_px, svg_width) / svg_width


def _style_default_px(css: str) -> float | None:
    """Return the smallest font-size in style rules that can size SVG text."""
    sizes = []
    for selector, body in _CSS_RULE.findall(_CSS_COMMENT.sub("", css)):
        if _SVG_TEXT_SELECTOR.search(selector.lower()):
            px = _declared_px(body)
            if px is not None:
                sizes.append(px)
    return min(sizes, default=None)


class _SmallestSvgTextFinder(HTMLParser):
    """Walks the element tree and collects the rendered size of SVG text."""

    def __init__(self, column_px: int) -> None:
        super().__init__(convert_charrefs=True)
        self._column_px = column_px
        self._stack: list[_OpenElement] = []
        self._in_style = False
        self._css: list[str] = []
        # Rendered sizes of SVG text whose font-size is known.
        self._sized: list[float] = []
        # Scale factors of SVG text with no font-size; <style> may supply one.
        self._unsized_factors: list[float] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "style":
            self._in_style = True
            return
        self._open(tag, dict(attrs), push=True)

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        # Self-closing tags hold no text and never close later, so never push them.
        if tag != "style":
            self._open(tag, dict(attrs), push=False)

    def handle_endtag(self, tag: str) -> None:
        if tag == "style":
            self._in_style = False
            return
        # Close back to the matching open tag; a stray end tag is ignored.
        for index in range(len(self._stack) - 1, -1, -1):
            if self._stack[index].tag == tag:
                del self._stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if self._in_style:
            self._css.append(data)
            return
        if not data.strip() or not self._stack:
            return
        # Only text inside an svg text element is drawn at its scaled size.
        if not any(e.tag in _SVG_TEXT_ELEMENTS and e.in_svg for e in self._stack):
            return
        current = self._stack[-1]
        if current.font_px is None:
            self._unsized_factors.append(
                _rendered_px(1.0, current.svg_width, self._column_px)
            )
        else:
            self._sized.append(
                _rendered_px(current.font_px, current.svg_width, self._column_px)
            )

    def smallest_px(self) -> float | None:
        """Return the smallest rendered text size, or None when none is known."""
        sizes = list(self._sized)
        # Text without its own size takes the stylesheet default, if there is one.
        if self._unsized_factors:
            default_px = _style_default_px("".join(self._css))
            if default_px is not None:
                sizes.append(default_px * min(self._unsized_factors))
        return min(sizes, default=None)

    def _open(self, tag: str, attrs: dict[str, str | None], push: bool) -> None:
        # Font size and svg scale inherit from the parent unless set here.
        parent = self._stack[-1] if self._stack else None
        in_svg = parent.in_svg if parent else False
        svg_width = parent.svg_width if parent else None
        if tag == "svg" and not in_svg:
            # Only the outermost svg sets the scale; nested svgs keep it.
            in_svg = True
            svg_width = _viewbox_width(attrs.get("viewbox"))
        # An inline style beats the font-size attribute, as in the browser.
        own_px = _declared_px(attrs.get("style") or "")
        if own_px is None:
            own_px = _to_px(attrs.get("font-size"))
        font_px = own_px if own_px is not None else (parent.font_px if parent else None)
        if push:
            self._stack.append(_OpenElement(tag, font_px, in_svg, svg_width))


def smallest_svg_text_px(html: str, column_px: int = 320) -> float | None:
    """Return the smallest SVG text size in px as drawn in the chat column.

    Text takes its size from a font-size attribute or inline style on it or an
    ancestor. Text with no size takes the smallest font-size from <style>
    rules that name text, tspan or svg. Each size is scaled by the shrink
    factor of its top-level svg: a mini chart (viewBox up to 200 wide) is drawn
    140 px wide, and any other svg fills a column_px wide column. Returns None
    when no SVG text has a known size, so the caller skips the check.
    """
    finder = _SmallestSvgTextFinder(column_px)
    finder.feed(html)
    finder.close()
    return finder.smallest_px()
