"""Browse the managed funding database without running funding research."""

from __future__ import annotations

import logging

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.models.cnb.funding_catalogue import (
    FundingCatalogueFunder,
    FundingCatalogueOpportunity,
    FundingCatalogueResponse,
)
from app.models.db.cnb_reference import (
    CnbFunder,
    CnbFunderTemplate,
    CnbFundingOpportunity,
)
from app.services.cnb.application_context import _template_response
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


async def load_funding_catalogue(
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> FundingCatalogueResponse:
    """Read every funder, including those with no opportunity or template.

    Three bulk reads avoid per-funder queries. Reference records are curated,
    shared data; callers must authorize the concept-note run before calling.
    """
    try:
        factory = session_factory or get_cnb_reference_session_factory()
        async with factory() as session:
            funders = (
                await session.scalars(
                    select(CnbFunder).order_by(
                        func.lower(CnbFunder.name), CnbFunder.funder_id
                    )
                )
            ).all()
            opportunities = (
                await session.scalars(
                    select(CnbFundingOpportunity).order_by(
                        func.lower(CnbFundingOpportunity.name),
                        CnbFundingOpportunity.funding_opportunity_id,
                    )
                )
            ).all()
            templates = (await session.scalars(select(CnbFunderTemplate))).all()

        # Join in memory, preserving funders whose prerequisite data is incomplete.
        templates_by_opportunity = {
            row.funding_opportunity_id: _template_response(row) for row in templates
        }
        funders_by_id = {
            row.funder_id: FundingCatalogueFunder(
                id=row.funder_id,
                name=row.name,
                funder_type=row.funder_type,
                country=row.country,
                region=row.region,
                profile=row.profile,
            )
            for row in funders
        }
        for row in opportunities:
            funder = funders_by_id.get(row.funder_id)
            if funder is None:
                continue
            funder.opportunities.append(
                FundingCatalogueOpportunity(
                    id=row.funding_opportunity_id,
                    name=row.name,
                    **{
                        key: getattr(row, key)
                        for key in (
                            "applicant_type",
                            "category",
                            "sector",
                            "region_scope",
                            "finance_route",
                            "instrument_type",
                            "min_award",
                            "max_award",
                            "currency",
                            "status",
                            "summary",
                            "hazards",
                            "interventions",
                            "known_gaps",
                        )
                    },
                    template=templates_by_opportunity.get(row.funding_opportunity_id),
                )
            )
        return FundingCatalogueResponse(funders=list(funders_by_id.values()))
    except Exception as exc:
        logger.exception("Failed to load the CNB funding catalogue")
        raise HTTPException(
            status_code=503, detail="Funding catalogue is unavailable"
        ) from exc
