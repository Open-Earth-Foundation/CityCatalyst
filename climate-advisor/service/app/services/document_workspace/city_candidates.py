"""Offer city-profile values as attributed candidates before anyone confirms them."""

from __future__ import annotations

from app.models.db.concept_note import ConceptNoteContextBundle
from app.models.db.document_workspace import DocumentCandidate, DocumentPoint
from app.services.document_workspace.requirements import fingerprint, validate_value
from app.utils.city_point_source import city_field_evidence
from fastapi import HTTPException
from sqlalchemy import select


async def sync_city_candidates(service, reference, workflow, state):
    """Synchronize scalar fields declared by the pinned setup; preserve accepted values."""
    if workflow is None or not (state.setup or {}).get("catalogue_version"):
        return
    bundle = await workflow.scalar(
        select(ConceptNoteContextBundle.context_bundle).where(
            ConceptNoteContextBundle.run_id == state.run_id
        )
    )
    context = (bundle or {}).get("cc_context") or {}
    for point in await reference.scalars(
        select(DocumentPoint).where(
            DocumentPoint.run_id == state.run_id, DocumentPoint.active.is_(True)
        )
    ):
        field = point.definition.get("city_field")
        if not field:
            continue
        fact = city_field_evidence(context, field)
        if not fact:
            continue
        try:
            value = validate_value(point.definition, fact["value"])
        except HTTPException:
            continue
        identity = {
            "kind": "city_context",
            "run_id": str(state.run_id),
            "field": field,
            "sha256": fact["sha256"],
        }
        candidate_hash = fingerprint(identity)
        exists = await reference.scalar(
            select(DocumentCandidate.candidate_id).where(
                DocumentCandidate.point_id == point.point_id,
                DocumentCandidate.fingerprint == candidate_hash,
            )
        )
        if exists:
            continue
        citation = {
            "source_label": "CityCatalyst · City profile",
            "source_anchor": field,
            "page_number": None,
            "quote": fact["quote"],
        }
        reference.add(
            DocumentCandidate(
                point_id=point.point_id,
                fingerprint=candidate_hash,
                value=value,
                citations=[citation],
                source_identity=identity,
                status="pending",
            )
        )
        point.version += 1
        state.revision += 1
        service._history(reference, point, "system", "city_candidate", {"field": field})
