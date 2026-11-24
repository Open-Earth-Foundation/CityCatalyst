"""Detect CNB visual HTML that would be blank once the chat sanitizes it.

The chat strips scripts, links, forms, embedded frames and external resources
(see app/src/components/ConceptNoteWorkspace/chat-visual-frame.tsx). A document
whose only content lives in those parts renders as an empty card, so the tool
rejects it before reporting success. This is a cheap static check for obvious
cases; the chat re-checks the sanitized document.
"""

import re
from collections.abc import Iterator
from html.parser import HTMLParser
from typing import Any

import html5lib

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
# SVG shapes that draw without any text. <image> is absent: the sanitizer
# drops its external or data: href, so it renders nothing. <use> counts only
# with a local "#id" href, the one kind the sanitizer keeps.
_SVG_SHAPES = frozenset(
    {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
)
# HTML elements that show something without text content.
_SELF_VISIBLE = frozenset({"hr", "input", "select", "textarea", "meter", "progress"})
_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_HEADINGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})
# A CSS content value that draws text, e.g. a bar label in ::after.
_CSS_CONTENT = re.compile(r"(?<![-\w])content\s*:\s*([^;}]+)")
_EMPTY_CONTENT = frozenset({'""', "''", "none", "normal"})
_CSS_BACKGROUND = re.compile(r"(?<![-\w])background(?:-color)?\s*:\s*([^;]+)")
_CSS_SIZE = re.compile(r"(?<![-\w])(?:width|height)\s*:")
_NO_BACKGROUND = frozenset({"", "none", "transparent", "initial", "inherit", "unset"})


def _draws_css_content(css: str) -> bool:
    """Return whether a stylesheet writes text with a non-empty content value."""
    # Only declaration blocks: a selector such as .content:hover is no value.
    blocks = re.findall(r"\{([^{}]*)\}", _CSS_COMMENT.sub("", css))
    return any(
        value.replace("!important", "").strip().lower() not in _EMPTY_CONTENT
        for block in blocks
        for value in _CSS_CONTENT.findall(block)
    )


def _is_css_box(style: str) -> bool:
    """Return whether an inline style draws a coloured box (a CSS-only bar)."""
    backgrounds = _CSS_BACKGROUND.findall(style.lower())
    return bool(
        backgrounds
        and backgrounds[-1].replace("!important", "").strip() not in _NO_BACKGROUND
        and _CSS_SIZE.search(style.lower())
    )


class _VisibleContentFinder(HTMLParser):
    """Records whether the sanitized document would show any text or drawing."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found = False
        # Heading text alone does not count next to a canvas: that is a
        # library chart whose drawing never runs, only its title shows.
        self.heading_text = False
        self.canvas = False
        self._hidden_depth = 0
        self._svg_depth = 0
        self._heading_depth = 0
        self._in_style = False
        self._css: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _HIDDEN_ELEMENTS:
            self._hidden_depth += 1
            self.canvas = self.canvas or tag == "canvas"
            self._in_style = tag == "style"
            return
        if self._hidden_depth:
            return
        values = dict(attrs)
        if tag == "svg":
            self._svg_depth += 1
        elif tag in _HEADINGS:
            self._heading_depth += 1
        elif (self._svg_depth and tag in _SVG_SHAPES) or tag in _SELF_VISIBLE:
            self.found = True
        elif tag == "use" and self._svg_depth:
            href = values.get("href") or values.get("xlink:href") or ""
            self.found = self.found or href.strip().startswith("#")
        elif tag == "img":
            # The frame's CSP only loads data: images.
            src = (values.get("src") or "").strip().lower()
            self.found = self.found or src.startswith("data:image/")
        if _is_css_box(values.get("style") or ""):
            self.found = True

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # Self-closing tags (<rect/>) open nothing, so skip the depth counters.
        if tag == "canvas":
            self.canvas = True
        elif tag not in _HIDDEN_ELEMENTS and tag not in _HEADINGS and tag != "svg":
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in _HIDDEN_ELEMENTS:
            self._hidden_depth = max(0, self._hidden_depth - 1)
            self._in_style = False
        elif self._hidden_depth:
            return
        elif tag == "svg":
            self._svg_depth = max(0, self._svg_depth - 1)
        elif tag in _HEADINGS:
            self._heading_depth = max(0, self._heading_depth - 1)

    def handle_data(self, data: str) -> None:
        if self._in_style:
            self._css.append(data)
        elif not self._hidden_depth and data.strip():
            if self._heading_depth:
                self.heading_text = True
            else:
                self.found = True

    def visible(self) -> bool:
        """Return the verdict once the whole document has been read."""
        return (
            self.found
            or (self.heading_text and not self.canvas)
            or _draws_css_content("".join(self._css))
        )


def has_visible_content(html: str) -> bool:
    """Return whether the visual keeps any text or drawing after sanitizing.

    Text inside links or forms counts: the sanitizer keeps it and drops only
    the element. So do CSS-only marks: a <style> content value (a label in
    ::after) and an inline-styled box with a background and a width or
    height. A canvas with only a heading beside it is blank. Conservative by
    design; a False means the card would be blank.
    """
    finder = _VisibleContentFinder()
    finder.feed(html)
    finder.close()
    return finder.visible()


class _Node:
    """One element in a lightweight parse tree."""

    __slots__ = ("tag", "attrs", "children", "texts")

    def __init__(self, tag: str, attrs: dict[str, str | None]) -> None:
        self.tag = tag
        self.attrs = attrs
        self.children: list[_Node] = []
        self.texts: list[str] = []

    def walk(self) -> Iterator["_Node"]:
        """Yield this node and every descendant in document order."""
        # Iterative, so unclosed tags nested thousands deep cannot overflow.
        pending = [self]
        while pending:
            node = pending.pop()
            yield node
            pending.extend(reversed(node.children))


# HTML elements that never have content, so they are never left open.
_VOID_ELEMENTS = frozenset(
    {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
)


class _TreeBuilder(HTMLParser):
    """Builds a _Node tree; stray end tags are ignored, unclosed tags stay open."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _Node("#root", {})
        self._stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = _Node(tag, dict(attrs))
        self._stack[-1].children.append(node)
        if tag not in _VOID_ELEMENTS:
            self._stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._stack[-1].children.append(_Node(tag, dict(attrs)))

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self._stack) - 1, 0, -1):
            if self._stack[index].tag == tag:
                del self._stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self._stack[-1].texts.append(data)


def _parse_tree(html: str) -> _Node:
    builder = _TreeBuilder()
    builder.feed(html)
    builder.close()
    return builder.root


# The first word(s) of Mermaid source. Case-sensitive like Mermaid itself, and
# strict enough that prose such as "Pie chart of sectors" does not match.
_MERMAID_START = re.compile(
    r"(?:graph|flowchart)\s+(?:TD|TB|BT|RL|LR)\b"
    r"|(?:sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram)\b"
    r"|gantt\s*(?:\n|title\b|dateFormat\b|section\b)"
    r"|pie(?:\s+showData)?\s*(?:\n|title\b)"
)


def needs_svg(html: str) -> bool:
    """Return whether the visual relies on a script library instead of SVG.

    Scripts never run in the chat. A <canvas> stays empty, so any canvas is
    flagged (Chart.js and similar). Mermaid source shows as plain text, so an
    element with class mermaid (or language-mermaid), or a pre/code/div block that
    starts like Mermaid source, is flagged when the document has no <svg>.
    """
    nodes = list(_parse_tree(html).walk())
    if any(node.tag == "canvas" for node in nodes):
        return True
    if any(node.tag == "svg" for node in nodes):
        return False
    for node in nodes:
        if node.tag in ("script", "style"):
            continue
        classes = (node.attrs.get("class") or "").lower().split()
        if any(name == "mermaid" or name.endswith("-mermaid") for name in classes):
            return True
        # Source is judged in code blocks and bare divs, not in prose, so a
        # paragraph that starts with a keyword ("classDiagram is ...") passes.
        if node.tag in ("pre", "code", "div") and any(
            _MERMAID_START.match(text.lstrip()) for text in node.texts
        ):
            return True
    return False


# The sanitizer removes these, leaving a chart frozen at its start state.
_SVG_ANIMATION_TAGS = {
    "animate": "animate",
    "animatetransform": "animateTransform",
    "animatemotion": "animateMotion",
    "set": "set",
}


def svg_animation_elements(html: str) -> list[str]:
    """Return the SVG animation element names the visual uses, sorted."""
    found = {
        _SVG_ANIMATION_TAGS[node.tag]
        for node in _parse_tree(html).walk()
        if node.tag in _SVG_ANIMATION_TAGS
    }
    return sorted(found)


_SVG_NS = "{http://www.w3.org/2000/svg}"
_XLINK_HREF = "{http://www.w3.org/1999/xlink}href"
# Same rule as the chat (chat-visual-frame.tsx): at most this many <use>, and
# each one points at a single plain SVG element in the same document.
MAX_USE_REFERENCES = 300
_LOCAL_REFERENCE = re.compile(r"#[A-Za-z_][\w.:-]*")


def use_reference_problem(html: str) -> str | None:
    """Return why the SVG <use> references are unsafe to render, else None.

    A <use> that points at another <use>, or at a group holding one, copies
    it again; nested a few levels deep that freezes the browser. html5lib
    builds the same tree the browser will, so unclosed tags cannot hide a
    <use> from this check.
    """
    root = html5lib.parse(html, namespaceHTMLElements=False)
    uses = list(root.iter(f"{_SVG_NS}use"))
    if len(uses) > MAX_USE_REFERENCES:
        return f"more than {MAX_USE_REFERENCES} <use> elements"
    ids: dict[str, list[Any]] = {}
    for node in root.iter():
        if isinstance(node.get("id"), str):
            ids.setdefault(node.get("id"), []).append(node)
    checked: set[str] = set()
    for use in uses:
        refs = [
            (use.get(name) or "").strip()
            for name in ("href", _XLINK_HREF)
            if use.get(name) is not None
        ]
        if not refs or not all(_LOCAL_REFERENCE.fullmatch(ref) for ref in refs):
            return '<use> without a local href="#id"'
        for ref in set(refs) - checked:
            checked.add(ref)
            targets = ids.get(ref[1:], [])
            if len(targets) != 1 or not str(targets[0].tag).startswith(_SVG_NS):
                return f"<use> target {ref} is missing, repeated or not SVG"
            if any(node.tag == f"{_SVG_NS}use" for node in targets[0].iter()):
                return f"<use> target {ref} is or contains a <use>"
    return None


_EMBEDDED_FRAMES = frozenset({"iframe", "frame", "object", "embed"})
# Inputs that work without scripts; every other type does nothing in the chat.
_STATIC_INPUTS = frozenset({"radio", "checkbox", "hidden"})
# Elements that load a file through src (or href for SVG <image>).
_RESOURCE_TAGS = frozenset({"img", "source", "video", "audio", "image"})
_EVENT_HANDLER = re.compile(r"on[a-z]+")
# A URL that needs the network: anything but data: or a local #id.
_EXTERNAL_URL = re.compile(r"\s*(?!data:|#)\S", re.I)
_CSS_EXTERNAL = re.compile(r"@import\b|url\(\s*['\"]?\s*(?!data:|#)[^'\")\s]", re.I)
_CSS_TARGET = re.compile(r":target\b", re.I)


def unsupported_html_features(html: str) -> list[str]:
    """Return the parts of a visual that show but cannot work in the chat.

    The chat frame runs no scripts and loads nothing from the network: a
    script leaves its placeholder text, a button or slider does nothing, a
    :target tab never switches (links are removed), foreignObject labels
    vanish and an external image, font or stylesheet stays empty. Popover and
    dialog buttons (popovertarget, commandfor) work. A cheap check for the
    obvious cases; it does not parse CSS.
    """
    found: set[str] = set()
    css: list[str] = []
    for node in _parse_tree(html).walk():
        tag, attrs = node.tag, node.attrs
        if tag == "script" or any(_EVENT_HANDLER.fullmatch(name) for name in attrs):
            found.add("script")
        if tag in _EMBEDDED_FRAMES:
            found.add("embedded frame")
        elif tag == "foreignobject":
            found.add("foreignObject")
        elif tag == "button" and not (
            "popovertarget" in attrs or "commandfor" in attrs
        ):
            found.add("button")
        elif tag == "input":
            kind = (attrs.get("type") or "text").strip().lower()
            if kind not in _STATIC_INPUTS:
                found.add(f"input type={kind}")
        elif tag == "link" or (
            tag in _RESOURCE_TAGS
            and _EXTERNAL_URL.match(
                attrs.get("src") or attrs.get("href") or attrs.get("xlink:href") or ""
            )
        ):
            found.add("external resource")
        if tag == "style":
            css.extend(node.texts)
        if attrs.get("style"):
            css.append(attrs["style"] or "")
    stylesheet = _CSS_COMMENT.sub("", "\n".join(css))
    if _CSS_TARGET.search(stylesheet):
        found.add(":target")
    if _CSS_EXTERNAL.search(stylesheet):
        found.add("external resource")
    return sorted(found)
