"""Deprecated guard for the obsolete upstream legal assessments API."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.parse import quote

from app.modules.prioritizer.internal_models import LegalAssessmentRecord
from app.services.http_client import UpstreamApiError

logger = logging.getLogger(__name__)

DEFAULT_LEGAL_ASSESSMENTS_BASE_URL = "https://ccglobal.openearth.dev"
LEGAL_ASSESSMENTS_ENDPOINT_TEMPLATE = (
    "GET /api/v1/action-legal-assessments?countryCode={country_code}"
)


def get_legal_assessments_base_url() -> str:
    """Return the configured shared Global API host."""
    raw_value = os.getenv("CCGLOBAL_API_BASE_URL")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_LEGAL_ASSESSMENTS_BASE_URL
    return raw_value.strip()


@dataclass
class ActionLegalAssessmentsApiService:
    """Deprecated public legal API client that fails before any HTTP request."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the upstream legal assessments host from config when omitted."""
        if self.base_url is None:
            self.base_url = get_legal_assessments_base_url()

    def _build_legal_assessments_url(self, country_code: str) -> str:
        """Return the full upstream legal assessments URL for one country code."""
        normalized_country_code = country_code.strip().upper()
        encoded_country_code = quote(normalized_country_code, safe="")
        return (
            f"{self.base_url.rstrip('/')}/api/v1/action-legal-assessments"
            f"?countryCode={encoded_country_code}"
        )

    def get_assessments_by_action_id(
        self, country_code: str
    ) -> dict[str, LegalAssessmentRecord]:
        """Raise because legal assessments now come from the internal S3 source."""
        logger.error(
            "Deprecated legal assessments API client called country_code=%s; "
            "use HIAP_MEED_LEGAL_DATA_SOURCE=s3",
            country_code.strip().upper(),
        )
        raise UpstreamApiError(
            status_code=503,
            message=(
                "The public legal assessments API is deprecated; legal assessments "
                "now come from the internal S3 legal source."
            ),
            url=None,
        )
