"""Review each verified citation and retain only its explicitly selected support."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from app.services.document_workspace.reader_contract import (
    REVIEW_BATCH_CHARS,
    REVIEW_CONTEXT_CHARS,
)
from pydantic import BaseModel, Field, StrictFloat, StrictInt

logger = logging.getLogger(__name__)


class SourceFinding(BaseModel):
    key: str
    section: StrictInt = Field(ge=0)
    quote: str = Field(min_length=1, max_length=2000)
    applies_to: Literal["applicant", "shared_with_applicant", "other_or_unknown"]
    support: Literal["full", "partial"]
    value: str | StrictInt | StrictFloat


class SourceFindings(BaseModel):
    findings: list[SourceFinding]


def locate_quote(text, quote):
    quote = quote.strip()
    if not quote:
        return None
    if quote in text:
        return quote
    match = re.search(r"\s+".join(map(re.escape, quote.split())), text)
    return match.group(0) if match else None


class EvidenceSelection(BaseModel):
    key: str
    direct: list[StrictInt]
    components: list[StrictInt]


class ReviewedEvidence(BaseModel):
    selections: list[EvidenceSelection]


@dataclass
class QuotedFinding:
    key: str
    support: str
    value: str | int | float
    citation: dict
    context: str | None


def citation_context(original, segment, quote, limit=REVIEW_CONTEXT_CHARS):
    """Extract a contiguous paragraph or table row from this exact page/block."""
    start = segment.find(quote)
    if start < 0 or segment.find(quote, start + 1) >= 0:
        return None
    offset = original.find(segment)
    if offset < 0 or original.find(segment, offset + 1) >= 0:
        original = segment
        offset = 0
    start += offset
    end = start + len(quote)
    line_start = original.rfind("\n", 0, start) + 1
    line_end = original.find("\n", end)
    if line_end < 0:
        line_end = len(original)
    row = original[line_start:line_end]
    if "|" in row or "\t" in row or re.search(r"\S {2,}\S", row):
        left, right = line_start, line_end
    else:
        blank = re.compile(r"\r?\n[ \t]*\r?\n")
        left = max((m.end() for m in blank.finditer(original, 0, start)), default=0)
        after = blank.search(original, end)
        right = after.start() if after else len(original)
    if right - left > limit:
        room = max(0, limit - len(quote))
        left = max(left, min(start - room // 2, right - limit))
        right = min(right, max(end, left + limit))
    context = original[left:right].strip()
    return context if context != quote else None


def citation_order(citation):
    return (
        citation.get("page_number") or 0,
        citation.get("source_anchor") or "",
        citation["quote"],
        citation["source_label"],
    )


def review_batches(findings, groups, *, char_budget=REVIEW_BATCH_CHARS):
    """Keep each cited location independently selectable and bound the review input."""
    keyed = defaultdict(dict)
    for finding in findings:
        identity = (
            finding.support,
            json.dumps(finding.value, ensure_ascii=False),
            citation_order(finding.citation),
        )
        previous = keyed[finding.key].get(identity)
        context = finding.context or ""
        old_context = (previous.context or "") if previous else ""
        if previous is None or (len(context), context) > (
            len(old_context),
            old_context,
        ):
            keyed[finding.key][identity] = finding
    for group in groups:
        batch = {}
        size = 0
        for requirement in group:
            entries = keyed.get(requirement["key"], {})
            for identity in sorted(entries):
                finding = entries[identity]
                candidate_size = len(
                    json.dumps(
                        [finding.value, finding.citation, finding.context],
                        ensure_ascii=False,
                    )
                )
                if requirement["key"] not in batch:
                    candidate_size += len(json.dumps(requirement, ensure_ascii=False))
                if batch and size + candidate_size > char_budget:
                    yield batch
                    batch, size = {}, 0
                    candidate_size += len(json.dumps(requirement, ensure_ascii=False))
                if requirement["key"] not in batch:
                    batch[requirement["key"]] = (requirement, [])
                batch[requirement["key"]][1].append(finding)
                size += candidate_size
        if batch:
            yield batch


def keep_selections(batch, selections):
    expected = set(batch)
    if len(selections) != len(expected) or {r.key for r in selections} != expected:
        raise ValueError("Evidence review did not cover the requested points")
    retained = []
    for row in selections:
        entries = batch[row.key][1]
        direct, components = set(row.direct), set(row.components)
        if direct & components:
            raise ValueError(
                "Evidence review gave conflicting support for one citation"
            )
        if any(i < 0 or i >= len(entries) for i in direct | components):
            raise ValueError("Evidence review referenced an unknown candidate")
        for i in sorted(direct | components):
            finding = entries[i]
            support = finding.support if i in direct else "partial"
            retained.append((row.key, support, finding.value, finding.citation))
    return retained


async def review_findings(
    findings,
    groups,
    *,
    scope,
    source_label,
    prompt,
    model,
    semaphore,
    client,
    runner,
    invoke,
):
    """Review local indices, then merge selected locations under their typed value."""

    async def review(batch):
        points = []
        for requirement, entries in batch.values():
            candidates = []
            for index, finding in enumerate(entries):
                citation = dict(finding.citation)
                if finding.context:
                    citation["context"] = finding.context
                candidates.append(
                    {
                        "index": index,
                        "support": finding.support,
                        "value": finding.value,
                        "citations": [citation],
                    }
                )
            points.append({"requirement": requirement, "candidates": candidates})
        try:
            async with semaphore:
                checked = await invoke(
                    name="Review evidence for application requirements",
                    prompt=prompt,
                    model_config=model,
                    output_type=ReviewedEvidence,
                    client=client,
                    runner=runner,
                    input_text=json.dumps(
                        {"scope": scope, "source": source_label, "points": points},
                        ensure_ascii=False,
                    ),
                )
            return keep_selections(batch, checked.selections)
        except Exception as exc:  # noqa: BLE001 -- independent review must not discard original source material
            logger.warning("Source support review unavailable (%s)", type(exc).__name__)
            return [
                (key, "partial", item.value, item.citation)
                for key, (_, items) in batch.items()
                for item in items
            ]

    async with asyncio.TaskGroup() as tasks:
        reviews = [
            tasks.create_task(review(batch))
            for batch in review_batches(findings, groups)
        ]
    result = {}
    for task in reviews:
        for key, support, value, citation in task.result():
            citations = result.setdefault(key, {}).setdefault((support, value), [])
            if citation not in citations:
                citations.append(citation)
    for values in result.values():
        for citations in values.values():
            citations.sort(key=citation_order)
    return result
