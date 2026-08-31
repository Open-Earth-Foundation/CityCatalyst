"""Validate run funding references against the managed CNB database."""

from __future__ import annotations

import logging
from typing import Protocol
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Uuid, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.cnb_reference import get_cnb_reference_session_factory


logger = logging.getLogger(__name__)


class FundingReferenceValidator(Protocol):
    """Validate external funder and selected-opportunity identifiers."""

    async def validate(
        self,
        *,
        funder_id: UUID | None,
        selected_funding_opportunity_id: UUID | None,
    ) -> None:
        """Raise when supplied identifiers are unavailable or inconsistent."""


class PostgresFundingReferenceValidator:
    """Read authoritative funding identifiers from managed CNB tables."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        """Accept an optional session factory for tests and dependency injection."""
        self._session_factory = session_factory

    async def validate(
        self,
        *,
        funder_id: UUID | None,
        selected_funding_opportunity_id: UUID | None,
    ) -> None:
        """Require supplied references to exist and share the requested funder."""
        if funder_id is None:
            return

        try:
            session_factory = (
                self._session_factory or get_cnb_reference_session_factory()
            )
            async with session_factory() as session:
                await self._require_funder(session, funder_id)
                if selected_funding_opportunity_id is not None:
                    await self._require_funding_opportunity(
                        session,
                        funder_id=funder_id,
                        funding_opportunity_id=selected_funding_opportunity_id,
                    )
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("CNB funding-reference validation failed")
            raise HTTPException(
                status_code=503,
                detail="Funding reference data is unavailable",
            ) from exc

    async def _require_funder(self, session: AsyncSession, funder_id: UUID) -> None:
        """Require one canonical funder row."""
        result = await session.execute(
            text(
                "SELECT funder_id FROM funders WHERE funder_id = :funder_id"
            ).bindparams(bindparam("funder_id", type_=Uuid(as_uuid=True))),
            {"funder_id": funder_id},
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=422, detail="Unknown funder_id")

    async def _require_funding_opportunity(
        self,
        session: AsyncSession,
        *,
        funder_id: UUID,
        funding_opportunity_id: UUID,
    ) -> None:
        """Require one funding opportunity owned by the supplied funder."""
        result = await session.execute(
            text(
                "SELECT funder_id FROM funding_opportunities "
                "WHERE funding_opportunity_id = :funding_opportunity_id"
            ).bindparams(
                bindparam("funding_opportunity_id", type_=Uuid(as_uuid=True))
            ),
            {"funding_opportunity_id": funding_opportunity_id},
        )
        opportunity_funder_id = result.scalar_one_or_none()
        if opportunity_funder_id is None:
            raise HTTPException(
                status_code=422,
                detail="Unknown selected_funding_opportunity_id",
            )
        if UUID(str(opportunity_funder_id)) != funder_id:
            raise HTTPException(
                status_code=422,
                detail="selected_funding_opportunity_id does not belong to funder_id",
            )
