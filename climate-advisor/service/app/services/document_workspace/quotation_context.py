"""Attach bounded, source-verifiable context to reviewed application citations."""

from __future__ import annotations

import re
from functools import cache

from app.services.cnb.source_quote_context import recover_quotation_context
from app.services.document_workspace.evidence_review import citation_order

CONTEXT_VERSION = 1
MAX_CONTEXT_CHARS = 1200
_TABLE_RULE = re.compile(r"\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*")
_CAPTION = re.compile(r"^[\s#_*]*(?:tab(?:le|ela|\.)|figure|ryc\.)\s+\d", re.I)
_ITEM = re.compile(
    r"(?m)^\s*(?:[-*+•◦▪‣–—−\uf0b7\uf02d\uf0fc\uf0d8]|\d{1,3}[.)]|[A-Za-z]\))\s+"
)
_END = re.compile(r"""[.!?…:;][\])"'’”]*\s*$""")
_OCR_COLUMNS = re.compile(r"\S {3,}\S")
_DEMONSTRATIVE = re.compile(
    r"^(?:this|these|those|it|its|they|their|both|each|ten|ta|te|to|tych|tego|tym)\b",
    re.I,
)
_NUMBERED_LABEL = re.compile(r"\b[^\W\d_]+\s+\d+\s*:")


def _previous_line(text: str, start: int) -> tuple[int, str]:
    end = max(0, start - 1)
    beginning = text.rfind("\n", 0, end) + 1
    return beginning, text[beginning:end].strip()


def _table_excerpt(text: str, start: int, end: int) -> str:
    """Include only the cited rows and an immediately adjoining header or caption."""
    rule_start, rule = _previous_line(text, start)
    if _TABLE_RULE.fullmatch(rule):
        header_start, header = _previous_line(text, rule_start)
        if header.count("|") >= 2:
            start = header_start
    caption_start, caption = _previous_line(text, start)
    if not caption and caption_start:
        caption_start, caption = _previous_line(text, caption_start)
    if _CAPTION.match(caption):
        start = caption_start
    return text[start:end].strip()


def _antecedent(text: str, quote_start: int) -> str:
    """A demonstrative can rely on an earlier sentence in the same named paragraph."""
    left = max(0, quote_start - MAX_CONTEXT_CHARS)
    boundary = list(re.finditer(r"\n[ \t\r]*\n", text[left:quote_start]))
    if left and not boundary:
        return ""
    paragraph_start = left + boundary[-1].end() if boundary else left
    prior = text[paragraph_start:quote_start]
    if _ITEM.search(prior) or "|" in prior or "#" in prior:
        return ""
    heading_start, heading = _previous_line(text, paragraph_start)
    if not heading and heading_start:
        heading_start, heading = _previous_line(text, heading_start)
    if re.match(r"^#{1,6}\s", heading):
        paragraph_start = heading_start
    return text[paragraph_start:quote_start]


def _prose_excerpt(text: str, quote: str, cited_lines: str, start: int) -> str:
    """Keep a governing sentence or list introduction without adding another row."""
    if _OCR_COLUMNS.search(cited_lines):
        return quote
    candidate = recover_quotation_context(text, quote)
    before, _, after = candidate.partition(quote)
    if _DEMONSTRATIVE.match(quote):
        before = _antecedent(text, start) or before
    if _END.search(quote):
        after = ""
    elif stop := re.search(r"(?<=\w)\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])", after):
        after = after[: stop.end()]
    added = before + "\n" + after
    if (
        _OCR_COLUMNS.search(added)
        or re.search(r"\n[ \t]{12,}\S|\.{5,}|(?m:^\s*\d{1,3}\s*$)", added)
        or (";" in added and "\n" in candidate)
        or (_NUMBERED_LABEL.search(quote) and _NUMBERED_LABEL.search(added))
        or re.search(
            r"(?m)^\s*[A-ZĄĆĘŁŃÓŚŹŻ][^\n.!?:;]{2,55}\n\s*[A-ZĄĆĘŁŃÓŚŹŻ]", after
        )
        or (after.strip() and not _END.search(after))
        or len(_ITEM.findall(before + quote + after))
        > max(1, len(_ITEM.findall(cited_lines)))
        or not re.search(r"[^\W\d_]{3,}", added)
    ):
        return quote
    return before + quote + after


def enclosing_quotation(text: str, quote: str) -> str | None:
    """Return one longer exact substring, or no context when its location is ambiguous."""
    if not quote.strip() or len(quote) >= MAX_CONTEXT_CHARS:
        return None
    start = text.find(quote)
    if start < 0 or text.find(quote, start + 1) >= 0:
        return None
    first = text.rfind("\n", 0, start) + 1
    end = start + len(quote)
    last = text.find("\n", end) if not quote.endswith("\n") else end
    if last < 0:
        last = len(text)
    cited_lines = text[first:last]
    table = any(
        line.count("|") >= 2 or "\t" in line.strip()
        for line in cited_lines.splitlines()
    )
    candidate = (
        _table_excerpt(text, first, last)
        if table
        else _prose_excerpt(text, quote, cited_lines, start)
    )
    limit = min(MAX_CONTEXT_CHARS, max(480, len(quote) * 3))
    if (
        candidate != quote
        and len(candidate) <= limit
        and quote in candidate
        and candidate in text
    ):
        return candidate
    return None


def _with_context(citation, value):
    item = {k: v for k, v in citation.items() if k != "quote_context"}
    if value:
        item["quote_context"] = value
    return item


def citation_enricher(unit_text: dict[str, str]):
    """Cache context per original page/block and core for the lifetime of one source read."""

    @cache
    def context(anchor, core):
        text = unit_text.get(anchor)
        return enclosing_quotation(text, core) if text else None

    def enrich(citations):
        updated = []
        for citation in citations:
            core = citation["quote"]
            anchor = (
                citation.get("source_anchor") or f"page-{citation.get('page_number')}"
            )
            updated.append(_with_context(citation, context(anchor, core)))
        return updated

    return enrich


def copy_citation_context(existing, enriched):
    """Retain previously stored order, core and annotations, including legacy fingerprints."""

    contexts = {citation_order(c): c.get("quote_context") for c in enriched}
    return [_with_context(c, contexts.get(citation_order(c))) for c in existing]
