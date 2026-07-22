"""Typed access to curated CNB reference data used by similar-project matching."""

from __future__ import annotations

import logging
from typing import Protocol
from uuid import UUID

from app.models.cnb_similar_projects import CnbSimilarProjectCandidate

logger = logging.getLogger(__name__)


class CnbReferenceDataClient(Protocol):
    """Read reviewed funded-project candidates from the CNB reference corpus."""

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
        limit: int,
    ) -> list[CnbSimilarProjectCandidate]:
        """Return reviewed candidates, optionally restricted to one funder."""


class UnavailableCnbReferenceDataClient:
    """Safe default used before a production reference-data client is wired."""

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
        limit: int,
    ) -> list[CnbSimilarProjectCandidate]:
        """Return no candidates when reference data is not available yet."""
        scope = str(funder_id) if funder_id is not None else "all funders"
        logger.warning("CNB similar-project reference data is unavailable for %s.", scope)
        return []
