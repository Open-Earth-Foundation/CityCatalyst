"""Rank literal source windows with terminology, table-of-contents and optional semantic matches."""

import itertools
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass

from app.services.cnb.source_analysis import (
    prompt_token_count,
    source_unit_anchor,
    source_unit_page,
)

PAGE = re.compile(r"(?:^|/)page-([1-9][0-9]*)(?=/|$)")
CONTENTS = re.compile(r"^\s*(.{4,155}?\S)(?:\s*\.{2,}\s*|[ \t]{3,})(\d{1,4})\s*$")


def words(text):
    folded = unicodedata.normalize("NFKD", text.casefold().replace("ł", "l"))
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return [w[:6] for w in re.findall(r"\w+", folded) if len(w) > 2 and not w.isdigit()]


def slices(text, target=1900):
    """Return original substrings, breaking at line ends before word boundaries."""
    start = 0
    while start < len(text):
        stop = min(len(text), start + target)
        if stop < len(text):
            middle = start + target // 2
            cut = text.rfind("\n", middle, stop)
            if cut < 0:
                cut = text.rfind(" ", middle, stop)
            if cut >= 0:
                stop = cut + 1
        if text[start:stop].strip():
            yield text[start:stop]
        start = stop


@dataclass(frozen=True)
class Window:
    text: str
    original: str
    page: int | None
    anchor: str | None
    zone: object
    table: bool


class SourceIndex:
    def __init__(self, units):
        self.windows = []
        self.by_page = defaultdict(list)
        self.by_unit = defaultdict(list)
        self.contents = []
        self.postings = defaultdict(dict)
        self.tokens = []
        self.headers = defaultdict(set)
        self.contents_windows = set()
        self.costs = {}
        offsets = Counter()
        for position, unit in enumerate(units):
            raw_page = source_unit_page(unit)
            anchor = None if raw_page is not None else source_unit_anchor(unit)
            heading_pages = PAGE.findall(anchor or "")
            page = (
                raw_page
                if raw_page is not None
                else (int(heading_pages[-1]) if heading_pages else None)
            )
            zone = page if page is not None else (anchor or "").rsplit("/block-", 1)[0]
            lines = [line.strip() for line in unit.text.splitlines() if line.strip()]
            if page and lines:
                for line in (lines[0], lines[-1]):
                    if (
                        len(line) <= 6
                        and line.isdecimal()
                        and abs(page - int(line)) < 25
                    ):
                        offsets[page - int(line)] += 1
            for text in slices(unit.text):
                index = len(self.windows)
                self.by_unit[position].append(index)
                table = bool(
                    re.search(r"\S\s*\|\s*\S|\S[ \t]{2,}\S", text)
                    and re.search(r"\d", text)
                )
                self.windows.append(Window(text, unit.text, page, anchor, zone, table))
                if page:
                    self.by_page[page].append(index)
                tokens = words(text)
                self.tokens.append(tokens)
                for token, count in Counter(tokens).items():
                    self.postings[token][index] = count
                nonempty = [line.strip() for line in text.splitlines() if line.strip()]
                if nonempty:
                    self.headers[index].update(words(" ".join(nonempty[:2])[:220]))
                entries = []
                for line in nonempty:
                    match = CONTENTS.match(line)
                    if match and int(match[2]) > 0 and len(words(match[1])) >= 2:
                        entries.append((match[1].strip(), int(match[2])))
                # Do not mistake ordinary numeric ledger rows for navigation.
                dotted = any(re.search(r"\.{3,}", line) for line in nonempty)
                if entries and (
                    dotted
                    or (
                        len(entries) >= 4
                        and all(a[1] <= b[1] for a, b in itertools.pairwise(entries))
                    )
                ):
                    self.contents.extend(entries)
                    self.contents_windows.add(index)
        self.offset = (
            offsets.most_common(1)[0][0]
            if offsets and max(offsets.values()) >= 3
            else 0
        )
        self.contents = list(dict.fromkeys(self.contents))
        self.idf = {
            word: math.log1p((len(self.windows) + 0.5) / (len(hits) + 0.5))
            for word, hits in self.postings.items()
        }
        self.mean = sum(map(len, self.tokens)) / max(1, len(self.tokens))

    def rank(self, probe, municipality):
        terms = list(dict.fromkeys(words(probe.phrase)))
        scores = Counter()
        matches = Counter()
        for term in terms:
            for index, count in self.postings.get(term, {}).items():
                norm = 0.45 + 0.55 * len(self.tokens[index]) / max(1, self.mean)
                scores[index] += self.idf[term] * count / (count + 1.3 * norm)
                matches[index] += 1
        for index in scores:
            window = self.windows[index]
            scores[index] *= 1 + matches[index] / max(1, len(terms))
            if len(terms) > 1 and " ".join(terms) in " ".join(self.tokens[index]):
                scores[index] *= 1.5
            if probe.kind == "table" and window.table:
                scores[index] *= 1.4
            if (
                probe.kind in {"role", "procedure"}
                and len(self.headers[index].intersection(terms)) >= 2
            ):
                scores[index] *= 1.2
            if municipality.intersection(self.tokens[index]):
                scores[index] *= 1.12
            if index in self.contents_windows:
                scores[index] *= 0.08
        ranked = [index for index, _ in scores.most_common()]
        navigation = []
        destinations = []
        for title, printed in self.contents:
            title_terms = set(words(title))
            hit = sum(self.idf.get(t, 0) for t in title_terms.intersection(terms))
            if hit:
                destinations.append(
                    (
                        hit / max(1, len(title_terms)) ** 0.25,
                        printed + self.offset,
                        title_terms,
                    )
                )
        for _, page, title_terms in sorted(destinations, key=lambda row: -row[0])[:3]:
            candidates = list(self.by_page.get(page, []))
            # The printed page does not always equal the physical page. Find the
            # running heading near the destination if a cover shifts the numbering.
            nearby = [
                i
                for n in range(page - 4, page + 5)
                for i in self.by_page.get(n, [])
                if i not in self.contents_windows
            ]
            if nearby:
                target = max(
                    nearby,
                    key=lambda i: (
                        len(title_terms & self.headers[i]) / len(title_terms),
                        -abs((self.windows[i].page or page) - page),
                    ),
                )
                if len(title_terms & self.headers[target]) >= min(2, len(title_terms)):
                    candidates = [
                        target,
                        *self.by_page.get(self.windows[target].page, []),
                        *candidates,
                    ]
            # Within the target chapter opening, choose an operative passage
            # matching the query before surrounding heading/continuation rows.
            if candidates:
                best = max(candidates, key=lambda i: scores.get(i, 0))
                navigation.extend([best, candidates[0]])
        return ranked, list(dict.fromkeys(navigation))

    def order(self, probes, scope, semantic_units=()):
        city = scope.get("municipality") or {}
        municipality = set(
            words(str(city.get("name", "") if isinstance(city, dict) else city))
        )
        routes = []
        for probe in probes:
            direct, nav = self.rank(probe, municipality)
            diverse = []
            seen = set()
            for i in direct:
                zone = self.windows[i].zone
                if zone not in seen:
                    seen.add(zone)
                    diverse.append(i)
                if len(diverse) == 7:
                    break
            routes.append(
                list(dict.fromkeys([*diverse[:2], *nav[:2], *diverse[2:], *direct]))
            )
        seeds = []
        seen_seeds = set()
        for depth in range(max(map(len, routes), default=0)):
            for route in routes:
                if depth < len(route) and route[depth] not in seen_seeds:
                    seeds.append(route[depth])
                    seen_seeds.add(route[depth])
        if not semantic_units:
            return seeds
        # Rank fusion gives both methods protected places even when their
        # candidate sets do not overlap. Unit positions refer to this exact file.
        positions = {i: n for n, i in enumerate(seeds)}
        semantic = []
        seen_semantic = set()
        tails = []
        for position in semantic_units:
            windows = self.by_unit.get(position, ())
            if windows:
                best = min(
                    windows,
                    key=lambda i: (
                        positions.get(i, len(seeds)),
                        i in self.contents_windows,
                        i,
                    ),
                )
                if best not in seen_semantic:
                    semantic.append(best)
                    seen_semantic.add(best)
                tails.extend(i for i in windows if i != best)
        semantic = list(dict.fromkeys([*semantic, *tails]))
        fused = Counter()
        for route in (seeds, semantic):
            for rank, i in enumerate(route):
                fused[i] += 1 / (20 + rank)
        head = []
        for n in range(2):
            head.extend(route[n] for route in (seeds, semantic) if n < len(route))
        combined = list(dict.fromkeys(head))
        emitted = set(combined)
        # A common hit gets a fusion vote while each independent ranking
        # keeps a slot. Do not stop after the first few semantic matches.
        streams = [iter(i for i, _ in fused.most_common()), iter(seeds), iter(semantic)]
        while streams:
            for stream in streams.copy():
                for index in stream:
                    if index not in emitted:
                        combined.append(index)
                        emitted.add(index)
                        break
                else:
                    streams.remove(stream)
        return combined

    def token_cost(self, i, model, encoding):
        key = (i, model, encoding)
        if key not in self.costs:
            win = self.windows[i]
            self.costs[key] = prompt_token_count(
                "",
                encoded({"index": 999, "page": win.page, "text": win.text}),
                model=model,
                fallback_encoding=encoding,
            )
        return self.costs[key]


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def scan_payload(index, seeds, base, *, model, encoding, prompt, max_tokens):
    def view(ids):
        return {
            **base,
            "sections": [
                {
                    "index": n,
                    "page": index.windows[i].page,
                    "text": index.windows[i].text,
                }
                for n, i in enumerate(sorted(ids))
            ],
        }

    ids = []
    # Prioritise different search routes, then retain neighbouring blocks within
    # each physical page or native heading (including headings and table units).
    head = seeds[:8]
    candidates = [*head]
    for seed in head:
        for i in (seed - 1, seed + 1):
            if 0 <= i < len(index.windows):
                other = index.windows[i]
                current = index.windows[seed]
                if other.zone == current.zone or (
                    other.page and current.page and abs(other.page - current.page) == 1
                ):
                    candidates.append(i)
    candidates.extend(seeds[8:])
    # Accumulate cached-size approximations, then verify the exact JSON token
    # count. Removing the least-preferred window never relabels another page.
    cost = prompt_token_count(
        prompt, encoded(view([])), model=model, fallback_encoding=encoding
    )
    seen_text = set()
    for i in dict.fromkeys(candidates):
        win = index.windows[i]
        identity = " ".join(win.text.split())
        if identity in seen_text:
            continue
        extra = index.token_cost(i, model, encoding)
        if cost + extra <= max_tokens:
            ids.append(i)
            seen_text.add(identity)
            cost += extra
        if max_tokens - cost < 20:
            break
    while (
        ids
        and prompt_token_count(
            prompt, encoded(view(ids)), model=model, fallback_encoding=encoding
        )
        > max_tokens
    ):
        ids.pop()
    return encoded(view(ids)), [index.windows[i] for i in sorted(ids)]
