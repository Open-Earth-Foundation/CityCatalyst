"""Recover short, contiguous source context for already verified quotations."""

from __future__ import annotations

import re
from bisect import bisect_right

QUOTE_CONTEXT_VERSION = "sentence-and-list-context-v1"
MAX_CONTEXT_CHARS = 1000
_ITEM = re.compile(r"^\s*(?:[-*+•◦▪‣–—−]|\(?\d{1,3}[.)]|\([a-zA-Z]\)|[a-zA-Z]\))\s+")
_HEADING = re.compile(r"^\s*#{1,6}\s+")
_END = re.compile(r"""[.!?…]+[”’"')\]]*(?=\s|$)""")


def _heading(line: str) -> bool:
    value = line.strip()
    return bool(
        _HEADING.match(value)
        or (2 <= len(value.split()) <= 12 and value.isupper())
        or re.match(r"^\d+(?:\.\d+)+\s+\S", value)
    )


def _table(line: str) -> bool:
    line = line.strip()
    return (
        line.count("|") >= 2
        or "\t" in line
        or (
            re.search(r"\S {2,}\S", line) is not None
            and any(char.isdigit() for char in line)
        )
    )


def _lead(line: str) -> bool:
    """An introduction or explicit heading that can actually govern a list."""
    value = line.strip()
    return bool(
        value and not _table(value) and (value.endswith((":", "：")) or _heading(value))
    )


def _sentence_bounds(text: str, start: int, end: int) -> tuple[int, int]:
    scan_from, scan_to = (
        max(0, start - MAX_CONTEXT_CHARS),
        min(len(text), end + MAX_CONTEXT_CHARS),
    )
    left = 0 if scan_from == 0 else start
    right = len(text) if scan_to == len(text) else end
    has_start, has_end = scan_from == 0, scan_to == len(text)
    for mark in _END.finditer(text, scan_from, scan_to):
        if mark.group().startswith(".") and mark.end() < len(text):
            prefix = text[max(0, mark.start() - 30) : mark.start()].rsplit(maxsplit=1)
            token = prefix[-1] if prefix else ""
            if (token.isalpha() and len(token) <= 2) or re.fullmatch(
                r"(?:\w\.)+\w", token
            ):
                continue
        if mark.end() <= start:
            left = mark.end()
            has_start = True
        elif mark.end() >= end:
            right = mark.end()
            has_end = True
            break
    return (left, right) if has_start and has_end else (start, end)


def _item_intro(lines: list[str], starts: list[int], item: int, end: int) -> int | None:
    """Walk only the same list and return the closest governing introduction."""
    for i in range(item - 1, -1, -1):
        raw = lines[i].strip()
        if end - starts[i] > MAX_CONTEXT_CHARS or _table(raw):
            break
        if _lead(raw):
            return starts[i]
        if _ITEM.match(lines[i]):
            continue
        if not raw:
            # Markdown frequently has one blank line between a lead and its list.
            if i and _lead(lines[i - 1]) and end - starts[i - 1] <= MAX_CONTEXT_CHARS:
                return starts[i - 1]
            break
        # A wrapped list item has a marker above its continuation. A prose
        # paragraph without a list marker cannot lead us to an older heading.
        if lines[i][:1].isspace():
            continue
        break
    return None


def _paragraph_lines(
    lines: list[str], starts: list[int], first: int, last: int, start: int
) -> tuple[int, int] | None:

    # An item can have wrapped lines, but its siblings are different statements.
    lo, hi = first, last
    while lo > 0 and not _ITEM.match(lines[lo]):
        prev = lines[lo - 1]
        if (
            not prev.strip()
            or _heading(prev)
            or _table(prev)
            or _END.search(prev.strip()[-3:])
        ):
            break
        if start - starts[lo - 1] > MAX_CONTEXT_CHARS:
            return None
        lo -= 1
    while hi + 1 < len(lines):
        following = lines[hi + 1]
        if (
            not following.strip()
            or _heading(following)
            or _ITEM.match(following)
            or _table(following)
        ):
            break
        if starts[hi + 1] - start > MAX_CONTEXT_CHARS:
            break
        hi += 1
    return lo, hi


def recover_quotation_context(section: str, quote: str) -> str:
    """Return an original sentence or introduced list fragment within one page/block.

    Leave complete, ambiguous, tabular or unlocatable quotations as supplied.
    Expansions remain exact, contiguous substrings and never exceed 1,000 chars.
    """
    start = section.find(quote)
    if (
        not quote.strip()
        or len(quote) >= MAX_CONTEXT_CHARS
        or start < 0
        or section.find(quote, start + 1) >= 0
    ):
        return quote
    end = start + len(quote)
    lines = section.splitlines(keepends=True)
    starts, offset = [], 0
    for line in lines:
        starts.append(offset)
        offset += len(line)
    first = bisect_right(starts, start) - 1
    last = bisect_right(starts, end - 1) - 1
    if any(_table(line) or _heading(line) for line in lines[first : last + 1]):
        return quote
    if (
        first < last
        and _lead(lines[first])
        and any(_ITEM.match(line) for line in lines[first + 1 : last + 1])
    ):
        return quote
    prefix = section[starts[first] : start].strip()
    if (
        quote[:1].isupper()
        and _END.search(quote[-3:])
        and prefix.endswith(":")
        and len(prefix.split()) == 1
    ):
        return quote
    bounds = _paragraph_lines(lines, starts, first, last, start)
    if bounds is None:
        return quote
    lo, hi = bounds
    base = starts[lo]
    paragraph = section[base : starts[hi] + len(lines[hi])].rstrip()
    left, right = _sentence_bounds(paragraph, start - base, end - base)
    original = section[base + left : base + right].strip()
    if _ITEM.match(lines[lo]):
        # A complete independent sentence already conveys its subject.
        item_text = _ITEM.sub("", lines[lo], count=1).strip()
        complete = (
            quote[:1].isupper()
            and quote.rstrip().endswith((".", "!", "?"))
            and len(quote.split()) >= 6
        )
        if complete and quote.strip() == item_text:
            return quote
        intro = _item_intro(lines, starts, lo, base + right)
        if intro is not None:
            original = section[intro : base + right].strip()
    return (
        original if quote in original and len(original) <= MAX_CONTEXT_CHARS else quote
    )
