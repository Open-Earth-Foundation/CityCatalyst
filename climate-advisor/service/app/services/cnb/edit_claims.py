"""Deterministic comparison of factual and semantic text changes."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

FactToken = tuple[str, str]

FACT_PATTERN = re.compile(
    r"(?P<prefix>EUR|USD|GBP|€|\$|£)?\s*"
    r"(?P<number>\d(?:[\d.,]*\d)?)"
    r"(?:\s*(?P<scale>million|billion|thousand|bn|m)\b)?"
    r"(?:\s*(?P<suffix>EUR|USD|GBP|%))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ClaimDelta:
    """One normalized comparison reused by provenance and consistency checks."""

    added_facts: Counter[FactToken]
    removed_facts: Counter[FactToken]
    meaning_changed: bool

    @classmethod
    def between(cls, before: str, after: str) -> ClaimDelta:
        """Analyze both sides of one proposed replacement once."""
        before_facts = Counter(fact_tokens(before))
        after_facts = Counter(fact_tokens(after))
        return cls(
            added_facts=after_facts - before_facts,
            removed_facts=before_facts - after_facts,
            meaning_changed=(
                before_facts != after_facts
                or commitment_tokens(before) != commitment_tokens(after)
                or entity_tokens(before) != entity_tokens(after)
            ),
        )


def fact_tokens(value: str) -> list[FactToken]:
    """Canonicalize valid monetary values, percentages, and plain numbers."""
    result: list[FactToken] = []
    for match in FACT_PATTERN.finditer(value):
        number = normalized_decimal(match["number"])
        if number is None:
            continue
        scale = {
            "million": 1_000_000,
            "m": 1_000_000,
            "billion": 1_000_000_000,
            "bn": 1_000_000_000,
            "thousand": 1_000,
        }.get((match["scale"] or "").lower(), 1)
        currency = (match["prefix"] or match["suffix"] or "number").upper()
        currency = {"€": "EUR", "$": "USD", "£": "GBP"}.get(currency, currency)
        result.append((currency, str((number * scale).normalize())))
    return result


def normalized_decimal(raw: str) -> Decimal | None:
    """Parse supported number punctuation without raising on malformed user text."""
    if "," in raw and "." in raw:
        decimal_mark = "," if raw.rfind(",") > raw.rfind(".") else "."
        raw = raw.replace("." if decimal_mark == "," else ",", "").replace(
            decimal_mark, "."
        )
    elif "," in raw:
        parts = raw.split(",")
        raw = raw.replace(",", "" if all(len(part) == 3 for part in parts[1:]) else ".")
    elif raw.count(".") > 1:
        parts = raw.split(".")
        if not all(len(part) == 3 for part in parts[1:]):
            return None
        raw = "".join(parts)
    try:
        return Decimal(raw)
    except InvalidOperation:
        return None


def normalize_polarity(value: str) -> str:
    """Expand negative contractions consistently before comparing polarity."""
    normalized = value.casefold().replace("’", "'").replace("‘", "'")
    special = {
        "can't": "can not",
        "won't": "will not",
        "shan't": "shall not",
        "ain't": "is not",
        "cannot": "can not",
    }
    return re.sub(
        r"\b(?:can't|won't|shan't|ain't|cannot|[a-z]+n't)\b",
        lambda match: special.get(match.group(), match.group()[:-3] + " not"),
        normalized,
    )


def commitment_tokens(value: str) -> list[str]:
    """Extract commitment and negation words that alter claim strength."""
    return re.findall(
        r"\b(?:shall|will|would|may|must|can|could|should|not|no|never|guarantee(?:d|s)?)\b",
        normalize_polarity(value),
    )


def entity_tokens(value: str) -> list[str]:
    """Conservatively extract title-cased organizations and places."""
    if re.fullmatch(r"[A-Z][a-z]{2,}", value.strip()):
        return [value.strip()]
    return re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", value)


def claim_words(value: str) -> str:
    """Normalize harmless syntax while retaining negation and commitments."""
    return " ".join(
        word
        for word in re.findall(r"\w+", normalize_polarity(value))
        if word not in {"a", "an", "the", "is", "are", "was", "were"}
    )
