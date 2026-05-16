"""Synchronous client for the upstream legal assessments API."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import LegalAssessmentRecord
from app.modules.prioritizer.models import ActionLegalAssessmentApiItem
from app.services.http_client import (
    UpstreamApiError,
    get_json_list_with_retries,
)

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
    """Fetch and map legal assessments from the upstream flat legal API."""

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
        """Fetch one country-scoped legal payload and map it by action ID."""
        legal_url = self._build_legal_assessments_url(country_code)

        # Fetch and validate the upstream response in one small, synchronous path.
        payload, http_status_code = get_json_list_with_retries(
            url=legal_url,
            operation_name="legal assessments API call",
            headers={"accept": "application/json"},
        )
        try:
            assessment_rows = [
                ActionLegalAssessmentApiItem.model_validate(item) for item in payload
            ]
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message="legal assessments API returned a payload that failed schema validation",
                upstream_status_code=http_status_code,
                url=legal_url,
            ) from error

        assessments_by_action_id: dict[str, LegalAssessmentRecord] = {}

        # Filter by country and fail fast on duplicate action IDs.
        for assessment in assessment_rows:
            if assessment.countryCode.strip().upper() != country_code.strip().upper():
                continue
            action_id = assessment.srcActionId
            if action_id in assessments_by_action_id:
                raise UpstreamApiError(
                    status_code=502,
                    message=(
                        "legal assessments API returned duplicate srcActionId values "
                        f"for countryCode={country_code.strip().upper()}"
                    ),
                    upstream_status_code=http_status_code,
                    url=legal_url,
                )
            assessment_raw = assessment.model_dump()
            assessments_by_action_id[action_id] = LegalAssessmentRecord.model_validate(
                {
                    "action_id": action_id,
                    "country_code": assessment.countryCode,
                    "gpc_sector": assessment.gpcSector,
                    "verdict_category": assessment.verdictCategory,
                    "verdict_score": assessment.verdictScore,
                    "ownership_category": assessment.ownershipCategory,
                    "ownership_score": assessment.ownershipScore,
                    "ownership_weight": assessment.ownershipWeight,
                    "ownership_description": assessment.ownershipDescription,
                    "restrictions_category": assessment.restrictionsCategory,
                    "restrictions_score": assessment.restrictionsScore,
                    "restrictions_weight": assessment.restrictionsWeight,
                    "restrictions_description": assessment.restrictionsDescription,
                    "legal_justification": assessment.legalJustification,
                    "analysis_date": assessment.analysisDate,
                    "generation_method": assessment.generationMethod,
                    "legal_references": assessment.legalReferences,
                    "release_id": assessment.releaseId,
                    "created_at": assessment.createdAt,
                    "updated_at": assessment.updatedAt,
                    "ownership_description_i18n": assessment.ownershipDescriptionI18n,
                    "restrictions_description_i18n": assessment.restrictionsDescriptionI18n,
                    "legal_justification_i18n": assessment.legalJustificationI18n,
                    "raw": assessment_raw,
                    "source_metadata": {
                        "mock_file_path": None,
                        "upstream_url": legal_url,
                        "upstream_endpoint": LEGAL_ASSESSMENTS_ENDPOINT_TEMPLATE,
                        "requested_country_code": country_code.strip().upper(),
                        "http_status_code": http_status_code,
                        "upstream_generated_at_utc": None,
                    },
                }
            )
        return assessments_by_action_id
