"""Read each partition once for all configured points and verify every returned quote."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from hashlib import sha256

from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.db.concept_note import ConceptNoteContextBundle
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentNeed,
    DocumentPoint,
    DocumentSetupSnapshot,
)
from app.services.cnb.source_analysis import (
    SourceUnit,
    partition_source_pages,
    prompt_token_count,
    render_partition,
    run_agent,
    segment_source_anchor,
    source_unit_anchor,
)
from app.services.document_workspace.evidence_review import (
    QuotedFinding,
    SourceFindings,
    citation_context,
    citation_order,
    locate_quote,
    review_findings,
)
from app.services.document_workspace.field_search import search_field_findings
from app.services.document_workspace.narrative_synthesis import synthesize_narratives
from app.services.document_workspace.quotation_context import (
    CONTEXT_VERSION,
    citation_enricher,
    copy_citation_context,
)
from app.services.document_workspace.reader_contract import (
    REQUIREMENTS_PER_READ,
    point_partition_tokens,
    point_reader_contract,
    point_reader_model,
)
from app.services.document_workspace.requirements import (
    fingerprint,
    template_definitions,
    validate_value,
)
from app.services.document_workspace.scalar_sources import (
    SCALAR_SOURCES_VERSION,
    scalar_source_enricher,
)
from app.services.document_workspace.targeted_search import (
    SourceSearchPlan,
    targeted_passages,
)
from fastapi import HTTPException
from sqlalchemy import select

logger = logging.getLogger(__name__)


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


async def read_setup_source(
    points, source, *, settings, client, runner, scope=None, scalar_enricher=None
):
    """Return verified full and contextual evidence using bounded, complete partitions."""
    if not points:
        return {}
    model = point_reader_model(settings)
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
        "chapter_refs",
        "section_context",
    )

    def requirement_fields(point):
        return {k: point[k] for k in fields if point.get(k)}

    def requirements_question(targets):
        return json.dumps(
            {
                "scope": scope or {},
                "requirements": [requirement_fields(p) for p in targets],
            },
            ensure_ascii=False,
        )

    groups = [
        points[n : n + REQUIREMENTS_PER_READ]
        for n in range(0, len(points), REQUIREMENTS_PER_READ)
    ]
    question = requirements_question(points)

    # Partition with the same full-form framing for ordinary forms. Very large
    # forms still fit because each real primary request carries only one group.
    def token_count(text):
        return prompt_token_count(
            prompt, text, model=model.name, fallback_encoding=budget.tokenizer_encoding
        )

    partition_budget = point_partition_tokens(settings)
    whole_form_fits = (
        await asyncio.to_thread(token_count, question) < partition_budget // 2
    )
    if whole_form_fits:
        framing = question
    else:
        framing = await asyncio.to_thread(
            max, (requirements_question(g) for g in groups), key=token_count
        )
    partitions = await asyncio.to_thread(
        partition_source_pages,
        source.units,
        prompt=prompt,
        model=model.name,
        max_tokens=partition_budget,
        fallback_encoding=budget.tokenizer_encoding,
        question=framing,
        source_label=source.source.source_label,
    )
    original_units = {source_unit_anchor(unit): unit.text for unit in source.units}
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
            quote = locate_quote(segment.text, item.quote)
            if not quote:
                continue
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
            original = original_units[segment_source_anchor(segment)]
            verified.append(
                QuotedFinding(
                    item.key,
                    item.support,
                    value,
                    {
                        "source_label": source.source.source_label,
                        "quote": quote,
                        "page_number": page,
                        "source_anchor": segment.anchor,
                    },
                    citation_context(original, segment.text, quote),
                )
            )
        return verified

    async def focused_reads():
        if len(partitions) < 2:
            return []
        search_prompt = settings.llm.prompts.get_prompt("document_setup_search")
        search_input = json.dumps(
            {
                "requirements": json.loads(question),
                "source_sample": "".join(unit.text for unit in source.units[:8])[:2500],
            },
            ensure_ascii=False,
        )
        search_tokens = await asyncio.to_thread(
            prompt_token_count,
            search_prompt,
            search_input,
            model=model.name,
            fallback_encoding=budget.tokenizer_encoding,
        )
        if search_tokens > partition_budget:
            return []
        async with semaphore:
            plan = await run_agent(
                name="Document requirement search terms",
                prompt=search_prompt,
                model_config=model,
                output_type=SourceSearchPlan,
                input_text=search_input,
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

    async def optional_focused_reads():
        try:
            return await focused_reads()
        except Exception as exc:  # noqa: BLE001 -- the complete primary pass remains available
            logger.warning(
                "Additional requirement search unavailable (%s)", type(exc).__name__
            )
            return []

    # Assign a bounded set of requirements to each reader so that a dense
    # source table or a late chapter cannot crowd out earlier form fields.
    async with asyncio.TaskGroup() as tasks:
        targeted = tasks.create_task(optional_focused_reads())
        reads = [
            tasks.create_task(read(partition, group))
            for partition in partitions
            for group in groups
        ]
        reads.append(targeted)
    findings = [item for job in reads for item in job.result()]
    if len(partitions) > 1 and budget.cnb_sources.independent_field_search_enabled:
        # A primary reader has not independently established completeness yet.
        # Search every field before the single source-grounded support decision.
        try:
            findings.extend(
                await search_field_findings(
                    points,
                    source,
                    scope=scope or {},
                    settings=settings,
                    client=client,
                    runner=runner,
                    semaphore=semaphore,
                    invoke=run_agent,
                )
            )
        except Exception as exc:  # noqa: BLE001 -- optional discovery must never discard a complete primary read
            logger.warning(
                "Additional field search unavailable (%s)", type(exc).__name__
            )
    reviewed = await review_findings(
        findings,
        [[requirement_fields(p) for p in group] for group in groups],
        scope=scope or {},
        source_label=source.source.source_label,
        prompt=settings.llm.prompts.get_prompt("document_evidence_review"),
        model=model,
        semaphore=semaphore,
        client=client,
        runner=runner,
        invoke=run_agent,
    )
    assembled = await synthesize_narratives(
        reviewed,
        [requirement_fields(p) for p in points],
        scope=scope or {},
        source_label=source.source.source_label,
        settings=settings,
        client=client,
        runner=runner,
        semaphore=semaphore,
        invoke=run_agent,
    )
    return await asyncio.to_thread(
        enrich_source_findings,
        assembled,
        points,
        source.units,
        source.source.source_label,
        scalar_enricher,
    )


def enrich_source_findings(
    findings: dict,
    definitions: list[dict],
    units: list[SourceUnit],
    source_label: str,
    scalar_enricher: Callable[[dict, object, list[dict], str | None], list[dict]]
    | None = None,
) -> dict:
    """Recover exact scalar repeats, then attach context without another model call."""
    scalar = scalar_enricher or scalar_source_enricher(units, source_label, definitions)
    by_key = {point["key"]: point for point in definitions}
    recovered = {
        key: {
            (support, value): scalar(by_key.get(key, {}), value, citations, support)
            for (support, value), citations in answers.items()
        }
        for key, answers in findings.items()
    }
    return enrich_findings(recovered, {source_unit_anchor(u): u.text for u in units})


def enrich_findings(findings, original_units):
    """Only the finished proposals gain presentation context; review inputs stay stable."""
    enrich = citation_enricher(original_units)
    return {
        key: {answer: enrich(citations) for answer, citations in answers.items()}
        for key, answers in findings.items()
    }


def ordered_point_definitions(points, pinned_snapshot):
    """Read form order and section meaning from the original pin, including old runs."""
    fields = (
        template_definitions(ApplicationContextTemplate.model_validate(pinned_snapshot))
        if pinned_snapshot.get("chapter_schema") and pinned_snapshot.get("id")
        else []
    )
    ordered = {field["key"]: (position, field) for position, field in enumerate(fields)}
    definitions = []
    for point in sorted(
        points,
        key=lambda item: (
            ordered.get(item.semantic_key, (len(ordered), {}))[0],
            item.semantic_key,
        ),
    ):
        definition = dict(point.definition)
        if not definition.get("section_context") and point.semantic_key in ordered:
            context = ordered[point.semantic_key][1].get("section_context")
            if context:
                definition["section_context"] = context
        if "section_context" in definition:
            sections = [
                section
                for section in (definition["section_context"] or [])
                if isinstance(section, dict)
                and (
                    section.get("description")
                    or section.get("field_description")
                    or section.get("title")
                    not in {None, "", section.get("chapter_ref")}
                )
            ]
            if sections:
                definition["section_context"] = sections
            else:
                definition.pop("section_context")
        definitions.append(definition)
    return definitions


def source_text_fingerprint(units):
    """Fence re-OCR and changed physical locations even when the PDF hash is unchanged."""
    digest = sha256()
    for unit in units:
        for part in (source_unit_anchor(unit), unit.text):
            data = part.encode("utf-8")
            digest.update(len(data).to_bytes(8, "big"))
            digest.update(data)
    return digest.hexdigest()


def candidate_signature(value, citations, identity, support):
    core = _core_citations(citations)
    return fingerprint([value, sorted(core, key=citation_order), identity, support])


def _core_citations(citations):
    return [
        {
            k: v
            for k, v in c.items()
            if k not in {"quote_context", "repeated_from_anchor"}
        }
        for c in citations
        if not c.get("repeated_from_anchor")
    ]


def candidate_support(candidate: DocumentCandidate, identity: dict) -> str | None:
    """Recover reviewed support from its unchanged canonical or legacy fingerprint."""
    core = _core_citations(candidate.citations)
    for support in ("full", "partial"):
        if candidate.fingerprint in {
            fingerprint([candidate.value, core, identity, support]),
            candidate_signature(candidate.value, core, identity, support),
        }:
            return support
    return None


def compatible_candidates(previous, identity):
    """Compare old citation ordering and prefer an existing human disposition."""
    status_order = {"accepted": 0, "dismissed": 1, "pending": 2, "context": 2}
    compatible = {}
    for old in sorted(
        previous.values(),
        key=lambda c: (status_order.get(c.status, 3), str(c.candidate_id)),
    ):
        compatible.setdefault(old.fingerprint, old)
        for support in ("full", "partial"):
            if (
                fingerprint(
                    [old.value, _core_citations(old.citations), identity, support]
                )
                == old.fingerprint
            ):
                key = candidate_signature(old.value, old.citations, identity, support)
                compatible.setdefault(key, old)
                break
    return compatible


async def _refresh_citation_context(session, state, need, doc, identity, points, units):
    """Backfill source-derived evidence once, preserving IDs and human dispositions."""
    if (
        doc.get("citation_context_version") == CONTEXT_VERSION
        and doc.get("scalar_sources_version") == SCALAR_SOURCES_VERSION
    ):
        return
    candidates = [
        candidate
        for candidate in await session.scalars(
            select(DocumentCandidate).where(
                DocumentCandidate.point_id.in_([p.point_id for p in points]),
                DocumentCandidate.source_identity["upload_id"].as_string()
                == identity["upload_id"],
            )
        )
        if candidate.source_identity == identity
    ]
    stored = [c.citations for c in candidates]

    def refresh():
        enrich = citation_enricher({source_unit_anchor(u): u.text for u in units})
        definitions = {p.point_id: p.definition for p in points}
        scalar = scalar_source_enricher(
            units, doc["source_label"], list(definitions.values())
        )
        return [
            enrich(
                scalar(
                    definitions[c.point_id],
                    c.value,
                    citations,
                    candidate_support(c, identity),
                )
            )
            for c, citations in zip(candidates, stored, strict=True)
        ]

    updated = await asyncio.to_thread(refresh)
    if updated != stored:
        for candidate, citations in zip(candidates, updated, strict=True):
            candidate.citations = citations
        state.revision += 1
    need.documents = [
        {
            **d,
            "citation_context_version": CONTEXT_VERSION,
            "scalar_sources_version": SCALAR_SOURCES_VERSION,
        }
        if d["upload_id"] == doc["upload_id"]
        else d
        for d in need.documents
    ]


async def read_and_store_setup_source(
    service, run, source, points, *, settings, client, runner
):
    """Commit candidates and the completed file category together for one pinned setup."""
    text_hash = await asyncio.to_thread(source_text_fingerprint, source.units)
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
    async with service.session_factory() as session, session.begin():
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
        pinned_snapshot = snapshot.snapshot
        setup = pinned_snapshot["document_setup"]
        definitions = ordered_point_definitions(points, pinned_snapshot)
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
                text_hash,
                definitions,
                pin,
                scope,
                source.source.source_label,
                source.source.source_format,
                point_reader_contract(settings),
            ]
        )
        upload_id = str(source.source.upload_id)
        identity = {"upload_id": upload_id, "sha256": source.source.sha256}
        ready = next(
            (
                doc
                for doc in (need.documents if need else [])
                if doc.get("reading_fingerprint") == digest
                and doc["upload_id"] == upload_id
            ),
            None,
        )
        if ready:
            await _refresh_citation_context(
                session, state, need, ready, identity, points, source.units
            )
            return
    scalar = await asyncio.to_thread(
        scalar_source_enricher, source.units, source.source.source_label, definitions
    )
    found = await read_setup_source(
        definitions,
        source,
        scope=scope,
        settings=settings,
        client=client,
        runner=runner,
        scalar_enricher=scalar,
    )
    enrich_previous = citation_enricher(
        {source_unit_anchor(u): u.text for u in source.units}
    )
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
            compatible = compatible_candidates(previous, identity)
            seen = set()
            for (support, value), citations in found.get(
                current.semantic_key, {}
            ).items():
                candidate_hash = candidate_signature(
                    value, citations, identity, support
                )
                status = "pending" if support == "full" else "context"
                existing = compatible.get(candidate_hash)
                if existing:
                    seen.add(existing.fingerprint)
                    enriched = enrich_previous(
                        scalar(
                            current.definition,
                            existing.value,
                            copy_citation_context(existing.citations, citations),
                            support,
                        )
                    )
                    if existing.citations != enriched:
                        existing.citations = enriched
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
                if old_hash in seen:
                    continue
                # OCR may have changed independently of the underlying PDF. Keep the
                # original decision and core; only exact context at this locator survives.
                old.citations = enrich_previous(
                    scalar(
                        current.definition,
                        old.value,
                        old.citations,
                        candidate_support(old, identity),
                    )
                )
                if old.status in {"context", "pending"}:
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
                "citation_context_version": CONTEXT_VERSION,
                "scalar_sources_version": SCALAR_SOURCES_VERSION,
            }
        ]
        state.revision += 1
