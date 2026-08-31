from __future__ import annotations

import json
from hashlib import sha256
from uuid import UUID

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.context_bundle import ConceptNoteContextBundle
from app.models.cnb.concept_note_application_context import (
    ApplicationContextFunder,
    ApplicationContextIncludedSources,
    ApplicationContextOpportunity,
    ApplicationContextTemplate,
    ConceptNoteApplicationContextResponse,
)
from app.models.db.cnb_reference import (
    CnbFunder,
    CnbFunderTemplate,
    CnbFundingOpportunity,
)
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import ConceptNoteRun
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


class ConceptNoteApplicationContextService:
    """Load reviewed funding-reference context for one authorized run."""

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        workflow_session: AsyncSession | None = None,
    ) -> None:
        """Store optional reference-data and workflow session overrides."""
        self._session_factory = session_factory
        self._workflow_session = workflow_session

    async def load_for_run(
        self,
        run: ConceptNoteRun,
        *,
        included_sources: ApplicationContextIncludedSources | None = None,
    ) -> ConceptNoteApplicationContextResponse:
        """Return the run envelope plus any reviewed funder, programme, and template."""
        response = ConceptNoteApplicationContextResponse(
            run_id=run.run_id,
            city_id=UUID(run.city_id),
            included_sources=(
                included_sources
                if included_sources is not None
                else await self._load_included_sources(run.run_id)
            ),
        )
        if run.funder_id is None:
            return response

        # Resolve the managed reference rows only when the run stores a funder.
        session_factory = self._session_factory or get_cnb_reference_session_factory()
        async with session_factory() as session:
            funder = await self._load_funder(session, run.funder_id)
            if funder is None:
                return response

            opportunity = await self._load_opportunity(
                session,
                funder_id=funder.funder_id,
                funding_opportunity_id=run.selected_funding_opportunity_id,
            )
            template = await self._load_template(
                session,
                funding_opportunity_id=(
                    opportunity.funding_opportunity_id
                    if opportunity is not None
                    else None
                ),
            )

        # Assemble the stable public contract after the reference read succeeds.
        response.funder = ApplicationContextFunder(
            id=funder.funder_id,
            name=funder.name,
        )
        if opportunity is not None:
            response.opportunity = ApplicationContextOpportunity(
                id=opportunity.funding_opportunity_id,
                name=opportunity.name,
            )
        if template is not None:
            response.template = ApplicationContextTemplate(
                id=template.template_id,
                name=template.template_name,
                output_format=template.output_format,
                chapter_schema=template.chapter_schema,
                required_fields=template.required_fields,
            )
        return response

    async def _load_included_sources(
        self,
        run_id: UUID,
    ) -> ApplicationContextIncludedSources:
        """Report only CityCatalyst sections actually persisted for this run."""
        if self._workflow_session is None:
            return ApplicationContextIncludedSources()

        bundle_row = await self._workflow_session.get(
            ConceptNoteContextBundleRow,
            run_id,
        )
        bundle = ConceptNoteContextBundle.model_validate(
            bundle_row.context_bundle if bundle_row is not None else {}
        )
        return included_sources_from_bundle(bundle)

    async def _load_funder(
        self,
        session: AsyncSession,
        funder_id: UUID,
    ) -> CnbFunder | None:
        """Return the managed funder row when it still exists."""
        return await session.get(CnbFunder, funder_id)

    async def _load_opportunity(
        self,
        session: AsyncSession,
        *,
        funder_id: UUID,
        funding_opportunity_id: UUID | None,
    ) -> CnbFundingOpportunity | None:
        """Return the selected opportunity only when it belongs to the run funder."""
        if funding_opportunity_id is None:
            return None
        opportunity = await session.get(
            CnbFundingOpportunity,
            funding_opportunity_id,
        )
        if opportunity is None or opportunity.funder_id != funder_id:
            return None
        return opportunity

    async def _load_template(
        self,
        session: AsyncSession,
        *,
        funding_opportunity_id: UUID | None,
    ) -> CnbFunderTemplate | None:
        """Return the single template attached to the selected opportunity."""
        if funding_opportunity_id is None:
            return None

        statement = select(CnbFunderTemplate).where(
            CnbFunderTemplate.funding_opportunity_id == funding_opportunity_id
        )
        return await session.scalar(statement)


def included_sources_from_bundle(
    bundle: ConceptNoteContextBundle,
) -> ApplicationContextIncludedSources:
    """Derive source-presence flags from one persisted bundle snapshot."""
    context = bundle.cc_context
    return ApplicationContextIncludedSources(
        city=context.city is not None,
        project=context.project is not None,
        ghgi=context.ghgi is not None,
        ccra=context.ccra is not None,
        hiap=context.hiap is not None,
    )


def calculate_application_template_fingerprint(
    template: ApplicationContextTemplate,
) -> str:
    """Hash every application-template field supplied to chapter validation."""
    canonical = json.dumps(
        template.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return sha256(canonical.encode("utf-8")).hexdigest()
