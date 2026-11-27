"""Locate additional source passages for a small group of form requirements."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from itertools import chain

from pydantic import BaseModel, Field


class PointSearchTerms(BaseModel):
    key: str
    terms: list[str] = Field(max_length=12)


class SourceSearchPlan(BaseModel):
    queries: list[PointSearchTerms]


def _tokens(text):
    # Prefixes match common inflections in municipal Polish and English.
    return [
        word[:6] for word in re.findall(r"[^\W\d_]+", text.casefold()) if len(word) >= 3
    ]


def targeted_passages(partitions, requirements, plan):
    """Rank exact source segments by rarity and term coverage without gold data."""
    segments = list(chain.from_iterable(partitions))
    postings = defaultdict(dict)
    for index, segment in enumerate(segments):
        for term, count in Counter(_tokens(segment.text)).items():
            postings[term][index] = count
    query_by_key = {query.key: query.terms for query in plan.queries}
    ranked = []
    for point in requirements:
        terms = set(_tokens(" ".join(query_by_key.get(point["key"], []))))
        scores = Counter()
        for term in terms:
            hits = postings.get(term, {})
            importance = math.log1p(len(segments) / (1 + len(hits)))
            for index, count in hits.items():
                scores[index] += importance * (1 + 0.3 * min(count - 1, 3))
        # Short Markdown blocks preserve the original locator. Bring the
        # adjacent block along to retain headings, table units and dates.
        selected = set()
        for index, _ in scores.most_common(4):
            selected.add(index)
            if len(segments[index].text) < 300 and index + 1 < len(segments):
                selected.add(index + 1)
        ranked.append((point, selected))
    batches = []
    # At most three form requirements compete for attention in a focused read.
    for start in range(0, len(ranked), 3):
        group = [(point, ids) for point, ids in ranked[start : start + 3] if ids]
        if group:
            targets = [point for point, _ in group]
            indices = sorted(set.union(*(ids for _, ids in group)))
            selected = []
            size = 0
            for index in indices:
                segment = segments[index]
                if selected and size + len(segment.text) > 18_000:
                    batches.append((targets, selected))
                    selected, size = [], 0
                selected.append(segment)
                size += len(segment.text)
            if selected:
                batches.append((targets, selected))
    return batches
