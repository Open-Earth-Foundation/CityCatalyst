"""Strict persisted inline style metadata without arbitrary HTML, CSS or links."""

from __future__ import annotations

import re
from html.parser import HTMLParser

from app.models.cnb.concept_note_edits import SelectionFormatting

STYLE_VALUES = {
    "data-cc-font": {"default", "serif", "mono"},
    "data-cc-bold": {"true", "false"},
    "data-cc-italic": {"true", "false"},
}
SPAN_OPEN = re.compile(r'<span(?: data-cc-(?:font|bold|italic)="[^"]*")+>')
STRONG_MARK = re.compile(r"(\*\*|__)(?=\S)([\s\S]*?\S)\1")
ITALIC_MARK = re.compile(
    r"(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)(?<!\*)\*(?!\*)|(?<![\w_])_(?!_)(?=\S)([\s\S]*?\S)(?<!_)_(?![\w_])"
)


def style_span(attributes: dict[str, str]) -> str:
    """Serialize only canonical allowlisted attributes in font/bold/italic order."""
    if not attributes or any(
        key not in STYLE_VALUES or value not in STYLE_VALUES[key]
        for key, value in attributes.items()
    ):
        raise ValueError("Unsupported inline formatting attribute or font")
    return (
        "<span"
        + "".join(
            f' {key}="{attributes[key]}"' for key in STYLE_VALUES if key in attributes
        )
        + ">"
    )


class _FormattingParser(HTMLParser):
    """Validate balanced style spans and optionally remove overridden inner attributes."""

    def __init__(self, removed: set[str] | None = None) -> None:
        """Retain raw text and canonical formatting tokens without interpreting facts."""
        super().__init__(convert_charrefs=False)
        self.removed = removed or set()
        self.stack: list[bool] = []
        self.parts: list[str] = []
        self.tokens: list[str] = []
        self.styles: list[dict[str, str]] = []

    def feed(self, data: str) -> None:
        """Keep closing syntax identical to the strict renderer's span parser."""
        if any(
            token.group() != "</span>"
            for token in re.finditer(r"</\s*span\b[^>]*>", data, re.IGNORECASE)
        ):
            raise ValueError("Use exact balanced </span> formatting markers")
        super().feed(data)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Accept only strict span syntax with unique, enumerated style attributes."""
        raw = self.get_starttag_text()
        values = dict(attrs)
        if tag != "span" or not SPAN_OPEN.fullmatch(raw) or len(values) != len(attrs):
            raise ValueError("Only allowlisted inline style spans are supported")
        style_span(values)
        self.tokens.append(raw)
        retained = {
            key: value for key, value in values.items() if key not in self.removed
        }
        self.stack.append(bool(retained))
        self.styles.append(values)
        if retained:
            self.parts.append(style_span(retained))

    def handle_endtag(self, tag: str) -> None:
        """Reject unmatched tags and preserve retained span nesting."""
        if tag != "span" or not self.stack:
            raise ValueError("Inline style spans must be balanced")
        self.tokens.append("</span>")
        self.styles.pop()
        if self.stack.pop():
            self.parts.append("</span>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Reject self-closing markup, which cannot format selected text."""
        raise ValueError("Inline style spans must enclose selected text")

    def handle_data(self, data: str) -> None:
        """Retain original Markdown text verbatim."""
        self.parts.append(data)

    def handle_entityref(self, name: str) -> None:
        """Retain existing named character references without decoding them."""
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        """Retain existing numeric character references without decoding them."""
        self.parts.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        """Do not silently remove hidden markup from a formatting selection."""
        raise ValueError("Comments cannot be included in a formatting selection")

    def handle_decl(self, decl: str) -> None:
        """Reject declarations instead of interpreting or stripping them."""
        raise ValueError("Declarations cannot be included in a formatting selection")

    def handle_pi(self, data: str) -> None:
        """Reject processing instructions instead of changing hidden content."""
        raise ValueError(
            "Processing instructions cannot be included in a formatting selection"
        )

    def close(self) -> None:
        """Require a complete, balanced fragment before formatting or validation."""
        super().close()
        if self.stack:
            raise ValueError(
                "Select complete style wrappers or text within one formatted run"
            )


def formatting_tokens(markdown: str) -> list[str]:
    """Validate style markup and retain exact enclosing metadata for AI preservation."""
    parser = _FormattingParser()
    parser.feed(markdown)
    parser.close()
    return [
        *parser.tokens,
        *(match.group(1) for match in STRONG_MARK.finditer(markdown)),
        *("italic" for _ in ITALIC_MARK.finditer(markdown)),
    ]


def enclosing_formatting(markdown: str, offset: int) -> list[dict[str, str]]:
    """Expose inherited allowlisted styles when an edit window starts inside a span."""
    parser = _FormattingParser()
    parser.feed(markdown[:offset])
    return parser.styles


def require_style_run_edit(body: str, start: int, before: str, after: str) -> None:
    """Allow AI prose edits only inside one existing styled or plain-text run.

    Nonempty anchors cannot consume style delimiters; replacements also cannot
    insert delimiters, escapes or code fences that reinterpret existing markers.
    """
    boundary = re.compile(r"</?span\b[^>]*>|(?<!\\)(?:\*\*|__|\*|(?<!\w)_(?!\w))")
    end = start + len(before)
    prefix_marks = re.findall(r"\*\*|__|(?<!\*)\*(?!\*)|(?<!\w)_(?!\w)", body[:start])
    styled = bool(enclosing_formatting(body, start)) or any(
        prefix_marks.count(mark) % 2 for mark in set(prefix_marks)
    )
    if styled and any(char in after for char in "\r\n"):
        raise ValueError(
            "Keep styled prose inline; line or paragraph breaks cannot split an existing formatting run"
        )
    if (
        not before
        or boundary.search(after)
        or "\\" in after
        or "`" in after
        or any(
            token.start() < end and start < token.end()
            for token in boundary.finditer(body)
        )
    ):
        raise ValueError(
            "Preserve formatting markers in place. Search and replace inner prose within each styled or plain-text run."
        )


def require_preserved_formatting(before: str, after: str) -> None:
    """Forbid a wording model from silently dropping or changing stored styles."""
    if formatting_tokens(before) != formatting_tokens(after):
        raise ValueError(
            "Preserve existing font, bold and italic formatting in selected-text edits"
        )


def format_selection(markdown: str, formatting: SelectionFormatting) -> str:
    """Wrap exact selected Markdown with explicit styles, retaining unrelated styles."""
    paragraphs = re.split(r"(\n[ \t]*\n)", markdown)
    if len(paragraphs) > 1:
        return "".join(
            part
            if index % 2 or not part.strip()
            else format_selection(part, formatting)
            for index, part in enumerate(paragraphs)
        )
    attributes = {
        f"data-cc-{key}": str(value).lower() if isinstance(value, bool) else value
        for key, value in formatting.model_dump(exclude_none=True).items()
    }
    parser = _FormattingParser(set(attributes))
    parser.feed(markdown)
    parser.close()
    result = style_span(attributes) + "".join(parser.parts) + "</span>"
    if re.sub(r"</?span\b[^>]*>", "", result) != re.sub(
        r"</?span\b[^>]*>", "", markdown
    ):
        raise ValueError("Formatting must preserve the selected Markdown text exactly")
    return result
