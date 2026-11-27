"""Retrieve additional, directly quoted evidence for one field at a time in long sources."""

import asyncio
import logging
from typing import Literal

from app.services.cnb.source_analysis import prompt_token_count, run_agent
from app.services.document_workspace.evidence_review import (
    QuotedFinding,
    SourceFindings,
    citation_context,
    locate_quote,
)
from app.services.document_workspace.passage_index import (
    SourceIndex,
    encoded,
    scan_payload,
)
from app.services.document_workspace.reader_contract import (
    FIELD_SEARCH_TOKENS,
    PUBLIC_FIELDS,
    SEARCH_PLAN_INPUT_TOKENS,
    SEARCH_PLAN_TOTAL_TOKENS,
    point_reader_model,
)
from app.services.document_workspace.requirements import validate_value
from app.services.document_workspace.semantic_passages import rank_units
from fastapi import HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class Probe(BaseModel):
    kind: Literal["text", "role", "table", "procedure"]
    phrase: str = Field(min_length=1, max_length=180)


class FieldPlan(BaseModel):
    key: str
    probes: list[Probe] = Field(max_length=4)


class FilePlan(BaseModel):
    fields: list[FieldPlan]


def public(point):
    return {k: point[k] for k in PUBLIC_FIELDS if point.get(k) is not None}


def verified_rows(output, windows, point, label):
    rows = []
    seen = set()
    for item in output.findings:
        if item.key != point["key"] or item.applies_to == "other_or_unknown":
            continue
        found = None
        if 0 <= item.section < len(windows):
            window = windows[item.section]
            if quote := locate_quote(window.text, item.quote):
                found = window, quote
        if found is None:
            matches = [
                (w, q) for w in windows if (q := locate_quote(w.text, item.quote))
            ]
            if len(matches) != 1:
                continue
            found = matches[0]
        window, quote = found
        try:
            value = (
                validate_value(point, item.value)
                if item.support == "full"
                else str(item.value)
            )
        except HTTPException:
            continue
        sig = (item.key, item.support, value, window.page, window.anchor, quote)
        if sig in seen:
            continue
        seen.add(sig)
        citation = {
            "source_label": label,
            "quote": quote,
            "page_number": window.page,
            "source_anchor": window.anchor,
        }
        rows.append(
            QuotedFinding(
                item.key,
                item.support,
                value,
                citation,
                citation_context(window.original, window.text, quote),
            )
        )
    return rows


async def search_field_findings(
    points,
    source,
    *,
    scope,
    settings,
    client,
    runner,
    invoke=run_agent,
    semaphore=None,
    max_tokens=FIELD_SEARCH_TOKENS,
):
    """Find additional unreviewed QuotedFinding objects with at most 1+N calls."""
    active = [public(p) for p in points]
    if not active or not source.units:
        return []
    if not 0 < max_tokens <= FIELD_SEARCH_TOKENS:
        raise ValueError("Maximum source scan budget is 8000 input tokens")
    prompt = settings.llm.prompts.get_prompt("document_field_search")
    model = point_reader_model(settings)
    budget = settings.llm.generation.prompt_budget
    token_encoding = budget.tokenizer_encoding
    max_tokens = min(max_tokens, budget.cnb_sources.max_partition_tokens)
    local = asyncio.Semaphore(
        min(3, settings.llm.generation.prompt_budget.cnb_sources.max_concurrency)
    )
    label = source.source.source_label
    index = await asyncio.to_thread(SourceIndex, source.units)
    if not index.windows:
        return []

    async def call(name, output, payload):
        kwargs = {
            "name": name,
            "prompt": prompt,
            "model_config": model,
            "output_type": output,
            "input_text": payload,
            "client": client,
            "runner": runner,
        }
        async with local:
            if semaphore is not None:
                async with semaphore:
                    return await invoke(**kwargs)
            return await invoke(**kwargs)

    plan_points = [
        {
            "key": p["key"],
            "label": p.get("label"),
            "description": str(p.get("description", ""))[:260],
            "section_titles": [
                s.get("title")
                for s in (p.get("section_context") or [])
                if isinstance(s, dict)
            ],
            "answer_type": p.get("answer_type"),
            "unit": p.get("unit"),
        }
        for p in active
    ]
    plan_payload = encoded(
        {
            "mode": "plan",
            "scope": scope,
            "source": label,
            "requirements": plan_points,
            "language_sample": " ".join(w.text for w in index.windows[:3])[:1200],
            "contents": [t for t, _ in index.contents[:28]],
        }
    )
    plan_tokens = await asyncio.to_thread(
        prompt_token_count,
        prompt,
        plan_payload,
        model=model.name,
        fallback_encoding=token_encoding,
    )
    if (
        plan_tokens
        > min(SEARCH_PLAN_INPUT_TOKENS, budget.cnb_sources.max_partition_tokens)
        or plan_tokens + len(active) * 72 > SEARCH_PLAN_TOTAL_TOKENS
    ):
        logger.info(
            "Skipped optional retrieval: planning request exceeds the input/output token allowance"
        )
        return []
    try:
        plan = await call("Plan independent field retrieval", FilePlan, plan_payload)
    except Exception as exc:  # noqa: BLE001 -- optional retrieval must not invalidate primary findings
        logger.warning(
            "Skipped optional retrieval after planning failed (%s)", type(exc).__name__
        )
        return []
    by_key = {f.key: f.probes for f in plan.fields}
    semantic_positions = {}
    embedding_model = settings.llm.models.cnb_point_embedding_model
    if embedding_model:
        try:
            semantic_positions = await rank_units(
                source,
                active,
                client,
                model=embedding_model,
                concurrency=min(
                    3, settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
                ),
            )
        except Exception as exc:  # noqa: BLE001 -- lexical ranking works with clients that do not serve embeddings
            logger.warning(
                "Using lexical field search after embedding service failed (%s)",
                type(exc).__name__,
            )

    async def scan(point):
        probes = by_key.get(point["key"]) or [
            Probe(kind="text", phrase=point.get("label", point["key"])[:180])
        ]
        unit_ids = semantic_positions.get(point["key"], ())

        def select():
            seeds = index.order(
                probes,
                scope,
                unit_ids,
            )
            return scan_payload(
                index,
                seeds,
                {
                    "mode": "read",
                    "scope": scope,
                    "source": label,
                    "requirement": point,
                    "probes": [probe.model_dump() for probe in probes],
                },
                model=model.name,
                encoding=token_encoding,
                prompt=prompt,
                max_tokens=max_tokens,
            )

        async with local:
            payload, windows = await asyncio.to_thread(select)
        if not windows:
            return []
        output = await call(
            "Independently read one application field", SourceFindings, payload
        )
        return verified_rows(output, windows, point, label)

    async def optional_scan(point):
        try:
            return await scan(point)
        except Exception as exc:  # noqa: BLE001 -- keep unaffected fields and all primary findings
            logger.warning("Skipped optional field scan after %s", type(exc).__name__)
            return []

    async with asyncio.TaskGroup() as tasks:
        reads = [tasks.create_task(optional_scan(p)) for p in active]
    return [finding for task in reads for finding in task.result()]
