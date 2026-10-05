"""Add a funder, programme and template to the CNB catalogue.

Values typed by a user become ordinary ``funders``, ``funding_opportunities``
and ``funder_templates`` rows.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from uuid import uuid4

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.funding_catalogue import MANUAL_SOURCE_PREFIX
from app.models.cnb.funder_import import (
    FunderCreateRequest,
    FunderCreateResponse,
    TemplateChapterFields,
    TemplateFields,
)
from app.models.db.cnb_reference import (
    CnbFunder,
    CnbFunderTemplate,
    CnbFundingOpportunity,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.workspace import normalize_template_chapters
from app.services.cnb.source_analysis import markdown_heading_slug
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)

OPPORTUNITY_FIELDS = (
    "applicant_type",
    "category",
    "sector",
    "hazards",
    "interventions",
    "finance_route",
    "instrument_type",
    "region_scope",
    "min_award",
    "max_award",
    "currency",
    "status",
    "summary",
)


async def create_funder(
    run: ConceptNoteRun,
    payload: FunderCreateRequest,
    *,
    reference_factory: async_sessionmaker[AsyncSession] | None = None,
) -> FunderCreateResponse:
    """Insert reviewed catalogue rows; selection stays with the funding endpoint."""
    factory = reference_factory or get_cnb_reference_session_factory()

    # Step 1: store chapters in the shape drafting and validation expect.
    template = payload.template.model_copy(
        update={"chapter_schema": normalize_chapters(payload.template.chapter_schema)}
    )
    chapter_schema = [chapter.model_dump(mode="json") for chapter in template.chapter_schema]
    normalize_template_chapters(chapter_schema)

    # Step 2: write funder, programme and template in one transaction.
    funder_id, opportunity_id = uuid4(), uuid4()
    async with factory() as reference, reference.begin():
        reference.add(
            CnbFunder(
                funder_id=funder_id,
                name=payload.funder.name.strip(),
                funder_type=payload.funder.funder_type,
                country=payload.funder.country,
                region=payload.funder.region,
                profile=payload.funder.profile.model_dump(mode="json"),
            )
        )
        await reference.flush()
        reference.add(
            CnbFundingOpportunity(
                funding_opportunity_id=opportunity_id,
                source_run_id=f"{MANUAL_SOURCE_PREFIX}{run.run_id}",
                source_record_ref=str(opportunity_id),
                funder_id=funder_id,
                name=payload.opportunity.name.strip(),
                **payload.opportunity.model_dump(include={*OPPORTUNITY_FIELDS, "known_gaps"}),
            )
        )
        await reference.flush()
        reference.add(
            CnbFunderTemplate(
                funding_opportunity_id=opportunity_id,
                template_name=template.template_name.strip(),
                output_format=template.output_format,
                chapter_schema=chapter_schema,
                required_fields=template_required_fields(template),
            )
        )
    logger.info(
        "Added CNB funder run_id=%s funder_id=%s opportunity_id=%s",
        run.run_id,
        funder_id,
        opportunity_id,
    )
    return FunderCreateResponse(
        funder_id=funder_id, funding_opportunity_id=opportunity_id
    )


def normalize_chapters(
    chapters: Sequence[TemplateChapterFields],
) -> list[TemplateChapterFields]:
    """Give every chapter a unique slug ref and clean required-field names."""
    normalized: list[TemplateChapterFields] = []
    seen: set[str] = set()
    for index, chapter in enumerate(chapters, start=1):
        base = markdown_heading_slug(chapter.chapter_ref or chapter.title)
        if base == "section":
            base = f"chapter-{index}"
        ref, suffix = base, 2
        while ref in seen:
            ref, suffix = f"{base}-{suffix}", suffix + 1
        seen.add(ref)
        normalized.append(
            chapter.model_copy(
                update={
                    "chapter_ref": ref,
                    "title": chapter.title.strip(),
                    "required_fields": _clean_list(chapter.required_fields),
                }
            )
        )
    return normalized


def template_required_fields(template: TemplateFields) -> list[str]:
    """Build the template inventory from chapter fields so each has an owner."""
    return list(
        dict.fromkeys(
            field for chapter in template.chapter_schema for field in chapter.required_fields
        )
    )


def _clean_list(values: Sequence[str]) -> list[str]:
    """Strip, drop blanks and keep the first copy of each value."""
    return list(dict.fromkeys(stripped for value in values if (stripped := value.strip())))
