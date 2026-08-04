"""Synchronous client for the climate-finance projects catalogue."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import (
    ClimateFinanceProjectRecord,
    ClimateFinanceProjectsFetchResult,
)
from app.modules.prioritizer.models import ClimateFinanceProjectsApiResponse
from app.services.action_financial_feasibility_scores_api import (
    get_action_financial_feasibility_scores_base_url,
)
from app.services.http_client import UpstreamApiError, get_json_with_retries

CLIMATE_FINANCE_PROJECTS_ENDPOINT = "GET /api/v1/climate-finance/projects"
REPORT_FINANCE_PROJECTS_LIMIT = 5


@dataclass
class ClimateFinanceProjectsApiService:
    """Fetch report-ready projects matched to one action."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the shared Global API host when the caller omits it."""
        if self.base_url is None:
            self.base_url = get_action_financial_feasibility_scores_base_url()

    def get_projects(
        self,
        *,
        action_id: str,
        country_code: str,
        limit: int = REPORT_FINANCE_PROJECTS_LIMIT,
    ) -> ClimateFinanceProjectsFetchResult:
        """Fetch and validate one action-filtered projects-catalogue response."""
        projects_url = self._build_url(
            action_id=action_id,
            country_code=country_code,
            limit=limit,
        )

        # Fetch and validate this endpoint independently from other catalogues.
        payload, http_status_code = get_json_with_retries(
            url=projects_url,
            operation_name="climate finance projects API call",
            headers={"accept": "application/json"},
        )
        try:
            response = ClimateFinanceProjectsApiResponse.model_validate(payload)
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message=(
                    "climate finance projects API returned a payload "
                    "that failed schema validation"
                ),
                upstream_status_code=http_status_code,
                url=projects_url,
            ) from error

        return ClimateFinanceProjectsFetchResult(
            projects=[
                ClimateFinanceProjectRecord.model_validate(
                    project.model_dump(mode="json")
                )
                for project in response.data
            ],
            source_metadata={
                "upstream_url": projects_url,
                "upstream_endpoint": CLIMATE_FINANCE_PROJECTS_ENDPOINT,
                "http_status_code": http_status_code,
                "upstream_generated_at_utc": response.meta.generated_at_utc,
                "total": response.meta.total,
                "datasources": [
                    source.model_dump(mode="json", exclude_none=True)
                    for source in response.meta.datasources
                ],
            },
        )

    def _build_url(
        self,
        *,
        action_id: str,
        country_code: str,
        limit: int,
    ) -> str:
        """Build the action-filtered projects URL."""
        query = urlencode(
            {
                "country_code": country_code.strip().upper(),
                "action_id": action_id.strip(),
                "limit": str(limit),
            }
        )
        return f"{self.base_url.rstrip('/')}/api/v1/climate-finance/projects?{query}"
