"""Read each partition once for all configured points and verify every returned quote."""

from __future__ import annotations

import asyncio
import json
import re
from collections import defaultdict
from typing import Literal

from app.models.db.concept_note import ConceptNoteContextBundle
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentNeed,
    DocumentPoint,
    DocumentSetupSnapshot,
)
from app.services.cnb.source_analysis import (
    partition_source_pages,
    render_partition,
    run_agent,
)
from app.services.document_workspace.requirements import fingerprint, validate_value
from app.services.document_workspace.targeted_search import (
    SourceSearchPlan,
    targeted_passages,
)
from fastapi import HTTPException
from pydantic import BaseModel, Field, StrictFloat, StrictInt
from sqlalchemy import select


class SourceFinding(BaseModel):
    key: str
    section: int = Field(ge=0)
    quote: str = Field(min_length=1, max_length=2000)
    applies_to: Literal["applicant", "shared_with_applicant", "other_or_unknown"]
    support: Literal["full", "partial"]
    value: str | StrictInt | StrictFloat


class SourceFindings(BaseModel):
    findings: list[SourceFinding]


def file_category(categories, filename, title_text):
    """Match configured phrases in filename first, then the source's own heading."""
    for sample in (filename, title_text[:3000]):
        normalized = re.sub(r"[^\w]+|_", " ", sample.casefold())
        scores = [
            (
                sum(
                    len(term)
                    for term in row["keywords"]
                    if term.casefold() in normalized
                ),
                row["key"],
            )
            for row in categories
        ]
        scores.sort(reverse=True)
        if (
            scores
            and scores[0][0]
            and (len(scores) == 1 or scores[0][0] > scores[1][0])
        ):
            return scores[0][1]
    return "other"


async def read_setup_source(points, source, *, settings, client, runner, scope=None):
    """Return verified full and contextual evidence using bounded, complete partitions."""
    model = settings.llm.models.cnb_source_reader
    budget = settings.llm.generation.prompt_budget
    prompt = settings.llm.prompts.get_prompt("document_setup_reading")
    definitions = {point["key"]: point for point in points}
    fields = (
        "key",
        "label",
        "description",
        "kind",
        "answer_type",
        "choices",
        "unit",
        "usual_document",
    )

    def requirements_question(targets):
        return json.dumps(
            {
                "scope": scope or {},
                "requirements": [
                    {k: p[k] for k in fields if p.get(k)} for p in targets
                ],
            },
            ensure_ascii=False,
        )

    question = requirements_question(points)
    partitions = await asyncio.to_thread(
        partition_source_pages,
        source.units,
        prompt=prompt,
        model=model.name,
        max_tokens=min(budget.cnb_sources.max_partition_tokens, 20_000),
        fallback_encoding=budget.tokenizer_encoding,
        question=question,
        source_label=source.source.source_label,
    )
    semaphore = asyncio.Semaphore(budget.cnb_sources.max_concurrency)

    async def read(partition, targets):
        permitted = {point["key"] for point in targets}
        payload = json.loads(
            render_partition(
                partition,
                question=requirements_question(targets),
                source_label=source.source.source_label,
            )
        )
        for index, section in enumerate(payload["sections"]):
            section["index"] = index
        async with semaphore:
            output = await run_agent(
                name="Document setup source reader",
                prompt=prompt,
                model_config=model,
                output_type=SourceFindings,
                input_text=json.dumps(payload, ensure_ascii=False),
                client=client,
                runner=runner,
            )
        verified = []
        for item in output.findings:
            if (
                item.applies_to == "other_or_unknown"
                or item.key not in permitted
                or item.section >= len(partition)
            ):
                continue
            segment = partition[item.section]
            quote = item.quote.strip()
            if not quote:
                continue
            if quote not in segment.text:
                # Restore the actual text, including the original table spacing
                # and line wraps, when the reader normalized whitespace.
                words = quote.split()
                if not words:
                    continue
                match = re.search(
                    r"\s+".join(re.escape(word) for word in words), segment.text
                )
                if match is None:
                    continue
                quote = match.group(0)
            try:
                value = (
                    validate_value(definitions[item.key], item.value)
                    if item.support == "full"
                    else str(item.value)
                )
            except HTTPException:
                continue
            # Page-preserving transcriptions keep their physical page as a
            # Markdown heading (not as the ordinal of a Markdown block).
            heading_pages = re.findall(
                r"(?:^|/)page-([1-9][0-9]*)(?=/|$)", segment.anchor or ""
            )
            page = segment.page or (int(heading_pages[-1]) if heading_pages else None)
            verified.append(
                (
                    item.key,
                    item.support,
                    value,
                    {
                        "source_label": source.source.source_label,
                        "quote": quote,
                        "page_number": page,
                        "source_anchor": segment.anchor,
                    },
                )
            )
        return verified

    async def focused_reads():
        if len(partitions) < 2:
            return []
        async with semaphore:
            plan = await run_agent(
                name="Document requirement search terms",
                prompt=settings.llm.prompts.get_prompt("document_setup_search"),
                model_config=model,
                output_type=SourceSearchPlan,
                input_text=json.dumps(
                    {
                        "requirements": json.loads(question),
                        "source_sample": "".join(
                            unit.text for unit in source.units[:8]
                        )[:2500],
                    },
                    ensure_ascii=False,
                ),
                client=client,
                runner=runner,
            )
        batches = await asyncio.to_thread(targeted_passages, partitions, points, plan)
        async with asyncio.TaskGroup() as tasks:
            reads = [
                tasks.create_task(read(segments, targets))
                for targets, segments in batches
            ]
        return [item for job in reads for item in job.result()]

    async with asyncio.TaskGroup() as tasks:
        targeted = tasks.create_task(focused_reads())
        reads = [tasks.create_task(read(partition, points)) for partition in partitions]
        reads.append(targeted)
    found = defaultdict(dict)
    for task in reads:
        for key, support, value, citation in task.result():
            result = found[key].setdefault((support, value), [])
            if citation not in result:
                result.append(citation)
    return found


async def read_and_store_setup_source(
    service, run, source, points, *, settings, client, runner
):
    """Commit candidates and the completed file category together for one pinned setup."""
    city = {}
    if service.workflow_session_factory:
        async with service.workflow_session_factory() as workflow:
            bundle = await workflow.scalar(
                select(ConceptNoteContextBundle.context_bundle).where(
                    ConceptNoteContextBundle.run_id == run.run_id
                )
            )
            profile = ((bundle or {}).get("cc_context") or {}).get("city") or {}
            city = {k: profile[k] for k in ("name", "country") if profile.get(k)}
    async with service.session_factory() as session:
        state = await service._state(session, run.run_id)
        pin = state.setup_fingerprint
        snapshot = await session.scalar(
            select(DocumentSetupSnapshot).where(
                DocumentSetupSnapshot.run_id == run.run_id,
                DocumentSetupSnapshot.version == state.setup_version,
            )
        )
        if not snapshot or "document_setup" not in snapshot.snapshot:
            return
        setup = snapshot.snapshot["document_setup"]
        scope = {"municipality": city, "document": setup["name"]}
        category_key = file_category(
            setup["file_categories"],
            source.source.filename,
            source.units[0].text if source.units else "",
        )
        need = await session.scalar(
            select(DocumentNeed).where(
                DocumentNeed.run_id == run.run_id,
                DocumentNeed.semantic_key == category_key,
            )
        )
        digest = fingerprint(
            [
                source.source.sha256,
                pin,
                scope,
                settings.llm.prompts.get_prompt("document_setup_reading"),
                settings.llm.prompts.get_prompt("document_setup_search"),
                settings.llm.models.cnb_source_reader.model_dump(mode="json"),
            ]
        )
        upload_id = str(source.source.upload_id)
        if need and any(
            doc.get("reading_fingerprint") == digest and doc["upload_id"] == upload_id
            for doc in need.documents
        ):
            return
    found = await read_setup_source(
        [point.definition for point in points],
        source,
        scope=scope,
        settings=settings,
        client=client,
        runner=runner,
    )
    identity = {"upload_id": upload_id, "sha256": source.source.sha256}
    async with service.session_factory() as session, session.begin():
        state = await service._state(session, run.run_id)
        if state.setup_fingerprint != pin:
            raise RuntimeError(
                "Document setup changed during the read; retry with current requirements"
            )
        need = await session.scalar(
            select(DocumentNeed).where(
                DocumentNeed.run_id == run.run_id,
                DocumentNeed.semantic_key == category_key,
            )
        )
        if any(
            doc.get("reading_fingerprint") == digest and doc["upload_id"] == upload_id
            for doc in need.documents
        ):
            return
        for point in points:
            current = await session.get(DocumentPoint, point.point_id)
            if (
                current is None
                or not current.active
                or current.definition != point.definition
            ):
                raise RuntimeError("Document requirements changed during the read")
            changed = False
            previous = {
                candidate.fingerprint: candidate
                for candidate in await session.scalars(
                    select(DocumentCandidate).where(
                        DocumentCandidate.point_id == current.point_id
                    )
                )
                if candidate.source_identity == identity
            }
            seen = set()
            for (support, value), citations in found.get(
                current.semantic_key, {}
            ).items():
                candidate_hash = fingerprint([value, citations, identity, support])
                seen.add(candidate_hash)
                status = "pending" if support == "full" else "context"
                existing = previous.get(candidate_hash)
                if existing:
                    if existing.status == "superseded":
                        existing.status = status
                        changed = True
                    continue
                session.add(
                    DocumentCandidate(
                        point_id=current.point_id,
                        fingerprint=candidate_hash,
                        value=value,
                        citations=citations,
                        source_identity=identity,
                        status=status,
                    )
                )
                changed = True
            for old_hash, old in previous.items():
                if old_hash not in seen and old.status in {"context", "pending"}:
                    old.status = "superseded"
                    changed = True
            if changed:
                current.version += 1
                service._history(
                    session,
                    current,
                    "system",
                    "source_candidates",
                    {"source_upload_id": upload_id},
                )
        need.documents = [
            doc for doc in need.documents if doc["upload_id"] != upload_id
        ] + [
            {
                "upload_id": upload_id,
                "source_label": source.source.source_label,
                "filename": source.source.filename,
                "source_format": source.source.source_format,
                "ready": True,
                "reading_fingerprint": digest,
            }
        ]
        state.revision += 1
