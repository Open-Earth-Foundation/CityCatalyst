"""Assemble complementary contributions to narrative form fields from one file."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from app.services.cnb.source_analysis import run_agent
from app.services.document_workspace.evidence_review import citation_order
from app.services.document_workspace.reader_contract import (
    NARRATIVE_INPUT_CHARS,
    NARRATIVE_SECTION_ITEMS,
    point_reader_model,
)
from pydantic import BaseModel, StrictInt

Support = Literal["full", "partial"]
Dimension = Literal[
    "general",
    "measures",
    "costs",
    "funding",
    "instruments",
    "participants",
    "responsibilities",
    "timing",
    "methods",
    "targets",
    "outcomes",
]
MAX_ANSWER_CHARS = 20_000
logger = logging.getLogger(__name__)


class NarrativeItem(BaseModel):
    value: StrictInt
    equivalent: list[StrictInt]


class NarrativeSection(BaseModel):
    dimension: Dimension
    items: list[NarrativeItem]


class NarrativeAnswer(BaseModel):
    support: Support
    sections: list[NarrativeSection]


class NarrativeLayout(BaseModel):
    answers: list[NarrativeAnswer]
    excluded: list[StrictInt]


@dataclass(frozen=True)
class Contribution:
    support: Support
    value: str
    citations: list[dict]

    def model_input(self, index):
        citation = self.citations[0]
        return {
            "index": index,
            "support": self.support,
            "value": self.value,
            "quotation": {
                "quote": citation["quote"],
                "page": citation.get("page_number"),
            },
        }


def contribution_batches(entries, source_label):
    rows = []
    for (support, value), citations in entries.items():
        if not isinstance(value, str) or not value.strip() or not citations:
            raise ValueError(
                "Narrative synthesis requires verified text and its original citations"
            )
        if any(citation["source_label"] != source_label for citation in citations):
            raise ValueError("Narrative synthesis requires exactly one source file")
        rows.append(Contribution(support, value, sorted(citations, key=citation_order)))
    rows.sort(
        key=lambda row: (citation_order(row.citations[0]), row.value, row.support)
    )
    batch, size = [], 0
    for item in rows:
        extra = len(json.dumps(item.model_input(len(batch)), ensure_ascii=False))
        if batch and size + extra > NARRATIVE_INPUT_CHARS:
            yield batch
            batch, size = [], 0
        batch.append(item)
        size += extra
    if batch:
        yield batch


def check_layout(layout, count):
    """The model can only place or explicitly reject an existing contribution."""
    indices = list(layout.excluded)
    for answer in layout.answers:
        if not answer.sections or any(not section.items for section in answer.sections):
            raise ValueError("Empty narrative answer or section")
        for section in answer.sections:
            for item in section.items:
                indices.extend([item.value, *item.equivalent])
    if sorted(indices) != list(range(count)):
        raise ValueError("Narrative layout must account for every index exactly once")


NUMBER = re.compile(r"(?<!\w)[+−-]?\d+(?:[.,]\d+)*")


def competing_numbers(left, right):
    """Identical claims with a different quantity cannot become a single answer."""
    left = " ".join(left.casefold().split())
    right = " ".join(right.casefold().split())
    left_numbers, right_numbers = NUMBER.findall(left), NUMBER.findall(right)
    return (
        len(left_numbers) == len(right_numbers)
        and sum(a != b for a, b in zip(left_numbers, right_numbers)) == 1
        and NUMBER.sub("#", left) == NUMBER.sub("#", right)
    )


def annotated_citations(items):
    citations = {}
    for value, sources in items:
        for row in sources:
            for citation in row.citations:
                key = citation_order(citation), row.support
                if key not in citations:
                    citations[key] = {
                        **citation,
                        "component_support": row.support,
                        "component_values": [],
                    }
                if value not in citations[key]["component_values"]:
                    citations[key]["component_values"].append(value)
    return [citations[key] for key in sorted(citations)]


def rendered_sections(sections):
    """Keep thematic breaks and limit the number of bullets in each paragraph."""
    blocks = []
    for dimension, items in sections:
        for start in range(0, len(items), NARRATIVE_SECTION_ITEMS):
            subset = items[start : start + NARRATIVE_SECTION_ITEMS]
            title = (
                dimension.capitalize() + "\n"
                if dimension != "general"
                and (len(sections) > 1 or len(items) > NARRATIVE_SECTION_ITEMS)
                else ""
            )
            text = title + "\n".join("• " + value for value, _ in subset)
            blocks.append((text, subset))
    return blocks


def render_answer(answer, rows, *, split_input, max_chars):
    sections, separate = [], []
    chosen = []
    for section in answer.sections:
        items = []
        for item in section.items:
            main = rows[item.value]
            sources = [main]
            for i in item.equivalent:
                other = rows[i]
                if NUMBER.findall(main.value) != NUMBER.findall(other.value):
                    separate.append(other)
                else:
                    sources.append(other)
            if any(competing_numbers(main.value, prior.value) for prior in chosen):
                separate.extend(sources)
                continue
            chosen.append(main)
            items.append((main.value, sources))
        if items:
            sections.append((section.dimension, items))
    for row in separate:
        support = (
            "full"
            if row.support == answer.support == "full" and not split_input
            else "partial"
        )
        yield support, row.value, annotated_citations([(row.value, [row])])
    if not sections:
        return
    all_items = [item for _, items in sections for item in items]
    full = answer.support == "full" and any(
        row.support == "full" for _, rows in all_items for row in rows
    )
    support = "full" if full and not split_input else "partial"
    if len(all_items) == 1:
        yield support, all_items[0][0], annotated_citations(all_items)
        return
    blocks = rendered_sections(sections)
    value = "\n\n".join(text for text, _ in blocks)
    if len(value) <= max_chars:
        yield support, value, annotated_citations(all_items)
        return
    # A long section is a component of the complete answer. Keep every row;
    # offering the separate sections as competing complete values would be misleading.
    for text, items in blocks:
        if len(text) <= max_chars:
            yield "partial", text, annotated_citations(items)
        else:
            for value, sources in items:
                yield "partial", value, annotated_citations([(value, sources)])


def apply_layout(rows, layout, *, split_input=False, max_chars=MAX_ANSWER_CHARS):
    check_layout(layout, len(rows))
    result = {}
    for answer in layout.answers:
        for support, value, citations in render_answer(
            answer, rows, split_input=split_input, max_chars=max_chars
        ):
            dest = result.setdefault((support, value), [])
            dest.extend(c for c in citations if c not in dest)
    return result


async def synthesize_narratives(
    reviewed,
    definitions,
    *,
    scope,
    source_label,
    settings,
    client,
    runner,
    semaphore=None,
    invoke=run_agent,
):
    """Assemble one file's reviewed multiline proposals, preserving each source and support level."""
    semaphore = semaphore or asyncio.Semaphore(
        settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
    )
    result = dict(reviewed)
    prompt = settings.llm.prompts.get_prompt("document_narrative_synthesis")
    model = point_reader_model(settings)

    async def arrange(point, rows, split_input):
        try:
            async with semaphore:
                layout = await invoke(
                    name="Synthesize narrative evidence for one requirement",
                    prompt=prompt,
                    model_config=model,
                    output_type=NarrativeLayout,
                    client=client,
                    runner=runner,
                    input_text=json.dumps(
                        {
                            "source": source_label,
                            "scope": scope,
                            "requirement": point,
                            "items": [row.model_input(i) for i, row in enumerate(rows)],
                        },
                        ensure_ascii=False,
                    ),
                )
            return apply_layout(rows, layout, split_input=split_input)
        except Exception as exc:  # noqa: BLE001 -- any optional composition failure must retain reviewed evidence.
            # Presentation is optional. Keep verified proposals if the provider
            # cannot group this batch or returns ambiguous/unknown indices.
            logger.warning(
                "Retained %d reviewed contributions after narrative grouping failed (%s)",
                len(rows),
                type(exc).__name__,
            )
            return {(row.support, row.value): row.citations for row in rows}

    work = defaultdict(list)
    async with asyncio.TaskGroup() as tasks:
        for point in definitions:
            key = point["key"]
            if point.get("answer_type") != "multiline" or key not in reviewed:
                continue
            batches = list(contribution_batches(reviewed[key], source_label))
            if (
                len(batches) == 1
                and len(batches[0]) == 1
                and batches[0][0].support == "full"
            ):
                continue
            for rows in batches:
                work[key].append(
                    tasks.create_task(arrange(point, rows, len(batches) > 1))
                )
    for key, tasks in work.items():
        retained = {}
        for task in tasks:
            for value, citations in task.result().items():
                dest = retained.setdefault(value, [])
                dest.extend(c for c in citations if c not in dest)
        if retained:
            result[key] = retained
        else:
            result.pop(key, None)
    return result
