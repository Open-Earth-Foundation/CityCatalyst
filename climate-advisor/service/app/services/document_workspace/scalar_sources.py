"""Retain exact labelled-line repeats of independently reviewed profile scalars."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Callable

from app.services.cnb.source_analysis import SourcePage, SourceUnit, source_unit_anchor
from app.services.document_workspace.evidence_review import citation_order

SCALAR_SOURCES_VERSION = 1
MAX_SCALAR_LOCATIONS = 24


def _scalar_value(value: object) -> bool:
    """Accept short names or alphanumeric codes, excluding dated quantities and contacts."""
    if not isinstance(value, str) or not 1 <= len(value) <= 120:
        return False
    if len(value.split()) > 12 or not any(c.isalpha() for c in value):
        return False
    if any(c in value for c in "\n\r@:/;%") or re.search(r"\b(?:19|20)\d{2}\b", value):
        return False
    if any(c.isdigit() for c in value):
        return len(value) <= 32 and bool(re.fullmatch(r"[A-Za-z0-9-]+", value))
    return True


def _value_cell(line: str) -> str | None:
    """Read a complete value from an unambiguous two-cell labelled line."""
    if "|" in line:
        cells = line.strip().strip("|").split("|")
    elif "\t" in line:
        cells = line.strip().split("\t")
    elif line.count(":") == 1:
        cells = line.split(":")
    else:
        return None
    if len(cells) != 2:
        return None
    label, value = (cell.strip() for cell in cells)
    if not 2 <= len(label) <= 120 or not label[0].isalpha():
        return None
    return value if _scalar_value(value) else None


def scalar_source_enricher(
    units: list[SourceUnit], source_label: str, definitions: list[dict] | None = None
) -> Callable[[dict, object, list[dict], str | None], list[dict]]:
    """Index one immutable source; derive locations only from full reviewed body lines.

    The caller must bind the units to the candidate's exact upload/SHA and setup
    scope. Derived citations are discarded and recomputed, never used as seeds.
    Edge lines abstain because isolated headings or footers are ambiguous.
    """
    eligible = definitions is None or any(
        p.get("city_field")
        and p.get("kind", "fact") == "fact"
        and p.get("answer_type") == "text"
        for p in definitions
    )
    indexed_units = units if eligible else []
    # Index complete body lines once; duplicate anchors lack a trustworthy locator.
    anchors = Counter(source_unit_anchor(unit) for unit in indexed_units)
    bodies: dict[str, set[str]] = {}
    locations: dict[str, list[dict]] = {}
    for unit in indexed_units:
        anchor = source_unit_anchor(unit)
        if anchors[anchor] != 1:
            continue
        lines = [line.strip() for line in unit.text.splitlines() if line.strip()]
        body = {line for line in lines[1:-1] if _value_cell(line)}
        bodies[anchor] = body
        pages = re.findall(r"(?:^|/)page-([1-9][0-9]*)(?=/|$)", anchor)
        page = (
            unit.number
            if isinstance(unit, SourcePage)
            else int(pages[-1])
            if pages
            else None
        )
        for line in body:
            locations.setdefault(line, []).append(
                {
                    "source_label": source_label,
                    "quote": line,
                    "source_anchor": anchor,
                    "page_number": page,
                }
            )

    def enrich(
        definition: dict, value: object, citations: list[dict], support: str | None
    ) -> list[dict]:
        """Preserve raw citations and append bounded, explicitly derived repeat locations."""
        original = [dict(c) for c in citations if not c.get("repeated_from_anchor")]
        if (
            support != "full"
            or not definition.get("city_field")
            or definition.get("kind", "fact") != "fact"
            or definition.get("answer_type") != "text"
            or not _scalar_value(value)
        ):
            return original

        # Only a complete, reviewed original line may establish an equivalence.
        seeds: dict[str, list[str]] = {}
        for citation in original:
            anchor = (
                citation.get("source_anchor") or f"page-{citation.get('page_number')}"
            )
            quote = citation["quote"]
            if (
                citation.get("source_label") == source_label
                and quote in bodies.get(anchor, set())
                and _value_cell(quote) == value
            ):
                seeds.setdefault(quote, []).append(anchor)

        # Keep genuine citations when a derived location collides, including legacy PDF locators.
        def location(citation: dict) -> tuple:
            return (
                citation.get("source_anchor") or f"page-{citation.get('page_number')}",
                citation.get("page_number"),
                citation["quote"],
                citation.get("source_label"),
            )

        seen = {location(citation) for citation in original}
        derived = []
        for quote, seed_anchors in sorted(seeds.items()):
            matches = locations.get(quote, [])
            if len(matches) > MAX_SCALAR_LOCATIONS:
                continue
            for citation in sorted(matches, key=citation_order):
                if len(original) + len(derived) >= MAX_SCALAR_LOCATIONS:
                    break
                if location(citation) in seen:
                    continue
                seen.add(location(citation))
                derived.append({**citation, "repeated_from_anchor": min(seed_anchors)})
        return [*original, *derived]

    return enrich
