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
    """Retrieve both a field's specific phrases and its alternative local terminology."""
    segments = list(chain.from_iterable(partitions))
    postings = defaultdict(dict)
    tokens = [_tokens(segment.text) for segment in segments]
    token_text = [" " + " ".join(words) + " " for words in tokens]
    for index, words in enumerate(tokens):
        for term, count in Counter(words).items():
            postings[term][index] = count
    mean_length = sum(map(len, tokens)) / max(len(segments), 1) or 1
    rarity = {
        term: math.log1p((len(segments) - len(hits) + 0.5) / (len(hits) + 0.5))
        for term, hits in postings.items()
    }

    def rank(phrases):
        queries = dict.fromkeys(tuple(_tokens(phrase)) for phrase in phrases)
        relevance = Counter()
        alternatives = []
        for query in queries:
            scores = Counter()
            for term in dict.fromkeys(query):
                for index, count in postings.get(term, {}).items():
                    length = 0.75 + 0.25 * len(tokens[index]) / mean_length
                    scores[index] += rarity[term] * count / (count + 1.2 * length)
            if len(query) > 1:
                # A complete administrative phrase is stronger than a page
                # containing its common words in unrelated paragraphs.
                phrase = " " + " ".join(query) + " "
                for index in scores:
                    if phrase in token_text[index]:
                        scores[index] *= 2
            if scores:
                alternatives.append(scores.most_common(1)[0][0])
                relevance.update(scores)
        # A rare synonym can lead to the relevant table even when a general
        # discussion matches more terms. Keep room for both routes.
        anchors = [index for index, _ in relevance.most_common(4)]
        anchors.extend(alternatives)
        return list(dict.fromkeys(anchors))[:9]

    query_by_key = {query.key: query.terms for query in plan.queries}
    ranked = []
    for point in requirements:
        # Short Markdown blocks preserve the original locator. Bring the
        # adjacent block along to retain headings, table units and dates.
        selected = set()
        for index in rank(query_by_key.get(point["key"], [])):
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
