"""Extract typed candidates only from exact verified source quotations."""

from __future__ import annotations

import json
import logging
from typing import Any

from agents import Runner
from fastapi import HTTPException
from sqlalchemy import select

from app.config.settings import Settings, get_settings
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentNeed,
    DocumentPoint,
    DocumentSourceReading,
)
from app.models.document_workspace.contracts import PointExtraction
from app.services.cnb.source_analysis import (
    query_document,
    resolve_analysis_client,
    run_agent,
    source_unit_anchor,
    verified_excerpts,
)
from app.services.cnb.source_impact_review import RevalidationSource
from app.services.document_workspace.requirements import fingerprint, validate_value
from app.services.document_workspace.service import DocumentWorkspaceService

logger = logging.getLogger(__name__)


async def extract_source_candidates(
    run: ConceptNoteRun,
    sources: list[RevalidationSource],
    *,
    service: DocumentWorkspaceService | None = None,
    settings: Settings | None = None,
    query_fn: Any = query_document,
    runner: Any = Runner,
    client: Any = None,
) -> None:
    """Read sources for every active point; success is checkpointed per schema.

    Inputs are verified units from the existing OCR/bundle handoff. Reading and
    extraction use the configured source reader. IDs, paths and source locators
    never enter the extractor prompt; evidence positions are restored in code.
    A source failure raises so the existing durable source job remains queued.
    """
    service = service or DocumentWorkspaceService()
    settings = settings or get_settings()
    await service.load(run)
    async with service.session_factory() as session:
        points = list(
            await session.scalars(
                select(DocumentPoint).where(
                    DocumentPoint.run_id == run.run_id, DocumentPoint.active.is_(True)
                )
            )
        )
    if not points or not sources:
        return
    client, owns_client = resolve_analysis_client(settings, client)
    try:
        for source in sources:
            unit_text = {source_unit_anchor(unit): unit.text for unit in source.units}
            for point in points:
                reading_hash = fingerprint(
                    {
                        "sha256": source.source.sha256,
                        "definition": point.definition,
                        "prompt": settings.llm.prompts.get_prompt(
                            "document_point_extraction"
                        ),
                        "reader": settings.llm.models.cnb_source_reader.model_dump(
                            mode="json"
                        ),
                    }
                )
                async with service.session_factory() as session:
                    if await session.scalar(
                        select(DocumentSourceReading.reading_id).where(
                            DocumentSourceReading.point_id == point.point_id,
                            DocumentSourceReading.fingerprint == reading_hash,
                        )
                    ):
                        continue
                evidence = await query_fn(
                    upload_id=source.source.upload_id,
                    source_label=source.source.source_label,
                    question=point.definition["description"],
                    source_format=source.source.source_format,
                    pages=source.units,
                    settings=settings,
                    client=client,
                    runner=runner,
                )
                verified = verified_excerpts(evidence.excerpts, unit_text)
                result = PointExtraction()
                if verified:
                    result = await run_agent(
                        name="Document point candidate extractor",
                        prompt=settings.llm.prompts.get_prompt(
                            "document_point_extraction"
                        ),
                        model_config=settings.llm.models.cnb_source_reader,
                        output_type=PointExtraction,
                        input_text=json.dumps(
                            {
                                "point": {
                                    key: point.definition.get(key)
                                    for key in (
                                        "key",
                                        "label",
                                        "description",
                                        "answer_type",
                                        "choices",
                                        "minimum",
                                        "maximum",
                                        "unit",
                                    )
                                },
                                "evidence": [
                                    {"position": index, "quote": excerpt.text}
                                    for index, excerpt in enumerate(verified)
                                ],
                            },
                            ensure_ascii=False,
                        ),
                        client=client,
                        runner=runner,
                    )
                candidates = []
                for candidate in result.candidates:
                    try:
                        value = validate_value(point.definition, candidate.value)
                    except HTTPException:
                        logger.warning(
                            "Discarded invalid typed candidate point_key=%s",
                            point.semantic_key,
                        )
                        continue
                    # A single invalid reference rejects the candidate, rather
                    # than pretending a partial citation supports the value.
                    if any(
                        index < 0 or index >= len(verified)
                        for index in candidate.evidence_positions
                    ):
                        continue
                    citations = [
                        {
                            "source_label": source.source.source_label,
                            "quote": verified[index].text,
                            "page_number": verified[index].page,
                            "source_anchor": verified[index].anchor,
                        }
                        for index in dict.fromkeys(candidate.evidence_positions)
                    ]
                    candidates.append((value, citations))
                async with service.session_factory() as session, session.begin():
                    state = await service._state(session, run.run_id)
                    current = await session.get(DocumentPoint, point.point_id)
                    if (
                        current is None
                        or not current.active
                        or current.definition != point.definition
                    ):
                        continue
                    if await session.scalar(
                        select(DocumentSourceReading.reading_id).where(
                            DocumentSourceReading.point_id == point.point_id,
                            DocumentSourceReading.fingerprint == reading_hash,
                        )
                    ):
                        continue
                    changed = False
                    for value, citations in candidates:
                        identity = {
                            "upload_id": str(source.source.upload_id),
                            "sha256": source.source.sha256,
                        }
                        candidate_hash = fingerprint(
                            {"value": value, "citations": citations, "source": identity}
                        )
                        existing = await session.scalar(
                            select(DocumentCandidate.candidate_id).where(
                                DocumentCandidate.point_id == point.point_id,
                                DocumentCandidate.fingerprint == candidate_hash,
                            )
                        )
                        if existing:
                            continue
                        session.add(
                            DocumentCandidate(
                                point_id=point.point_id,
                                fingerprint=candidate_hash,
                                value=value,
                                citations=citations,
                                source_identity=identity,
                                status="pending",
                            )
                        )
                        changed = True
                    for need in await session.scalars(
                        select(DocumentNeed).where(
                            DocumentNeed.run_id == run.run_id,
                            DocumentNeed.active.is_(True),
                        )
                    ):
                        if (
                            current.semantic_key in need.definition["point_keys"]
                            and candidates
                        ):
                            document = {
                                "upload_id": str(source.source.upload_id),
                                "source_label": source.source.source_label,
                                "filename": source.source.filename,
                                "source_format": source.source.source_format,
                                "ready": True,
                            }
                            if not any(
                                item["upload_id"] == document["upload_id"]
                                for item in need.documents
                            ):
                                need.documents = [*need.documents, document]
                                changed = True
                    session.add(
                        DocumentSourceReading(
                            point_id=point.point_id, fingerprint=reading_hash
                        )
                    )
                    if changed:
                        current.version += 1
                        state.revision += 1
                        service._history(
                            session,
                            current,
                            "system",
                            "source_candidates",
                            {"source_upload_id": str(source.source.upload_id)},
                        )
    finally:
        if owns_client:
            await client.close()
