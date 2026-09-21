"""Persist reviewed funding choices and invalidate the previous review context."""

from __future__ import annotations

import logging
from copy import deepcopy
from datetime import UTC, datetime

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.concept_note_application_context import (
    ConceptNoteApplicationContextResponse,
)
from app.models.cnb.funding_catalogue import FundingSelectionRequest
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterValidation,
    ConceptNoteMatchedProject,
)
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.persistence.concept_notes.workspace import normalize_template_chapters
from app.services.cnb.application_context import ConceptNoteApplicationContextService
from app.services.cnb.funding_catalogue import load_funding_catalogue
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


async def save_funding_selection(
    session: AsyncSession,
    run: ConceptNoteRun,
    payload: FundingSelectionRequest,
    *,
    reference_factory: async_sessionmaker[AsyncSession] | None = None,
) -> ConceptNoteApplicationContextResponse:
    """Replace funding on an authorized, idle run without discarding its text.

    Reference invalidation commits first: if the workflow commit fails, the
    previous choice remains selected and its draft requires another review.
    """
    factory = reference_factory or get_cnb_reference_session_factory()
    context_service = ConceptNoteApplicationContextService(
        session_factory=factory, workflow_session=session
    )

    # Re-read under a lock so a second tab cannot overwrite a newer choice.
    await session.refresh(run, with_for_update=True)
    current = (run.funder_id, run.selected_funding_opportunity_id)
    requested = (payload.funder_id, payload.selected_funding_opportunity_id)
    if current == requested:
        return await context_service.load_for_run(run)
    if current != (payload.expected_funder_id, payload.expected_funding_opportunity_id):
        raise HTTPException(
            status_code=409, detail="Funding selection changed. Reload and try again."
        )
    summary = deepcopy(run.context_summary or {})
    if (
        summary.get("context_bundle", {}).get("status") == "building"
        or summary.get("draft_document", {}).get("status") == "running"
    ):
        raise HTTPException(
            status_code=409,
            detail="Wait for the current operation to finish before changing funding.",
        )

    # Resolve the hierarchy from trusted database records, never browser data.
    catalogue = await load_funding_catalogue(factory)
    funder = next(
        (item for item in catalogue.funders if item.id == payload.funder_id), None
    )
    if payload.funder_id is not None and funder is None:
        raise HTTPException(
            status_code=422, detail="The selected funder is no longer available."
        )
    opportunity = (
        next(
            (
                item
                for item in funder.opportunities
                if item.id == payload.selected_funding_opportunity_id
            ),
            None,
        )
        if funder
        else None
    )
    if payload.selected_funding_opportunity_id is not None and opportunity is None:
        raise HTTPException(
            status_code=422,
            detail="The selected programme does not belong to this funder.",
        )

    # Keep draft revisions, but revoke approvals and proposals for the old setup.
    async with factory() as reference, reference.begin():
        chapters = list(
            (
                await reference.scalars(
                    select(ConceptNoteChapter)
                    .where(
                        ConceptNoteChapter.run_id == run.run_id,
                        ConceptNoteChapter.status != "deleted",
                    )
                    .order_by(ConceptNoteChapter.position)
                    .with_for_update()
                )
            ).all()
        )
        proposals = list(
            (
                await reference.scalars(
                    select(ConceptNoteEditProposal)
                    .where(
                        ConceptNoteEditProposal.run_id == run.run_id,
                        ConceptNoteEditProposal.status.in_(
                            [
                                "processing",
                                "proposed",
                                "partially_applied",
                                "clarification_required",
                            ]
                        ),
                    )
                    .with_for_update()
                )
            ).all()
        )
        if any(proposal.status == "processing" for proposal in proposals):
            raise HTTPException(
                status_code=409,
                detail="Wait for the current edit to finish before changing funding.",
            )
        if chapters and not payload.acknowledge_draft_review:
            raise HTTPException(
                status_code=409,
                detail="Confirm that the existing draft will need review for the new funding setup.",
            )
        # A populated workspace cannot migrate unrelated sections without a
        # separate user decision about where each existing revision belongs.
        template_by_ref = None
        if chapters and opportunity and opportunity.template:
            try:
                template_chapters = normalize_template_chapters(
                    opportunity.template.chapter_schema
                )
            except ValueError:
                template_chapters = []
            template_by_ref = {
                chapter.chapter_ref: chapter for chapter in template_chapters
            }
            existing_refs = {
                chapter.template_section_id
                for chapter in chapters
                if chapter.template_section_id is not None
            }
            if existing_refs != template_by_ref.keys():
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "funding_template_incompatible",
                        "message": "This template has a different chapter structure. "
                        "Start a new concept note to use it without changing this draft.",
                    },
                )
        # Funding owns requirements; the run keeps its labels, guidance and order.
        for chapter in chapters:
            if template_by_ref is not None and chapter.template_section_id is not None:
                chapter.required = template_by_ref[chapter.template_section_id].required
            chapter.status = "needs_review"
            chapter.user_locked = False
            chapter.confirmed_revision_id = None
            chapter.updated_at = datetime.now(UTC)
        if chapters:
            await reference.execute(
                delete(ConceptNoteChapterValidation).where(
                    ConceptNoteChapterValidation.chapter_id.in_(
                        [chapter.chapter_id for chapter in chapters]
                    )
                )
            )
        for proposal in proposals:
            proposal.status = "stale"
            proposal.updated_at = datetime.now(UTC)
        await reference.execute(
            delete(ConceptNoteMatchedProject).where(
                ConceptNoteMatchedProject.run_id == run.run_id
            )
        )

    # Publish current funding context for Clima and subsequent chapter generation.
    run.funder_id, run.selected_funding_opportunity_id = requested
    run.updated_at = datetime.now(UTC)
    bundle = await session.get(ConceptNoteContextBundle, run.run_id)
    if bundle is None:
        bundle = ConceptNoteContextBundle(run_id=run.run_id, context_bundle={})
        session.add(bundle)
    bundle_payload = deepcopy(bundle.context_bundle or {})
    bundle_payload["funder_context"] = (
        {
            "funder": funder.model_dump(mode="json", exclude={"opportunities"}),
            "opportunity": opportunity.model_dump(mode="json", exclude={"template"})
            if opportunity
            else None,
            "template": opportunity.template.model_dump(mode="json")
            if opportunity and opportunity.template
            else None,
        }
        if funder
        else None
    )
    bundle_payload["similar_projects"] = []
    bundle.context_bundle = bundle_payload
    response = await context_service.load_for_run(run)
    await session.commit()
    logger.info("Updated funding selection for CNB run %s", run.run_id)
    return response
