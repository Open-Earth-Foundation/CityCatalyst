"""Synchronous client for the climate-finance opportunities catalogue."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import (
    ClimateFinanceOpportunitiesFetchResult,
    ClimateFinanceOpportunityRecord,
)
from app.modules.prioritizer.models import ClimateFinanceOpportunitiesApiResponse
from app.services.action_financial_feasibility_scores_api import (
    get_action_financial_feasibility_scores_base_url,
)
from app.services.http_client import UpstreamApiError, get_json_with_retries

CLIMATE_FINANCE_OPPORTUNITIES_ENDPOINT = "GET /api/v1/climate-finance/opportunities"
REPORT_FINANCE_ROWS_LIMIT = 5
REPORT_FINANCE_SCREENING_LIMIT = 50


@dataclass
class ClimateFinanceOpportunitiesApiService:
    """Fetch and screen report-ready climate-finance opportunities."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the shared Global API host when the caller omits it."""
        if self.base_url is None:
            self.base_url = get_action_financial_feasibility_scores_base_url()

    def get_opportunities(
        self,
        *,
        country_code: str,
        sector: str | None,
        route: str | None = None,
        limit: int = REPORT_FINANCE_ROWS_LIMIT,
    ) -> ClimateFinanceOpportunitiesFetchResult:
        """Fetch, validate, and screen one opportunities-catalogue response."""
        normalized_sector = (sector or "").strip()
        if not normalized_sector:
            return ClimateFinanceOpportunitiesFetchResult(
                source_metadata={
                    "upstream_url": None,
                    "upstream_endpoint": CLIMATE_FINANCE_OPPORTUNITIES_ENDPOINT,
                    "http_status_code": None,
                    "requested_country_code": country_code.strip().upper(),
                    "requested_sector": None,
                    "fetch_skipped_reason": "missing_action_sector",
                },
                warning=(
                    "Finance opportunities were not fetched because the selected "
                    "action's sector is unavailable."
                ),
            )

        opportunities_url = self._build_url(
            country_code=country_code,
            sector=normalized_sector,
        )

        # Fetch and validate this endpoint independently from other catalogues.
        payload, http_status_code = get_json_with_retries(
            url=opportunities_url,
            operation_name="climate finance opportunities API call",
            headers={"accept": "application/json"},
        )
        try:
            response = ClimateFinanceOpportunitiesApiResponse.model_validate(payload)
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message=(
                    "climate finance opportunities API returned a payload "
                    "that failed schema validation"
                ),
                upstream_status_code=http_status_code,
                url=opportunities_url,
            ) from error

        opportunities = _screen_report_opportunities(
            [
                ClimateFinanceOpportunityRecord.model_validate(
                    opportunity.model_dump(mode="json")
                )
                for opportunity in response.data
            ],
            route=route,
            limit=limit,
        )
        current_count = sum(
            opportunity.report_category == "current" for opportunity in opportunities
        )
        monitoring_count = sum(
            opportunity.report_category == "monitor" for opportunity in opportunities
        )
        return ClimateFinanceOpportunitiesFetchResult(
            opportunities=opportunities,
            source_metadata={
                "upstream_url": opportunities_url,
                "upstream_endpoint": CLIMATE_FINANCE_OPPORTUNITIES_ENDPOINT,
                "http_status_code": http_status_code,
                "upstream_generated_at_utc": response.meta.generated_at_utc,
                "fetched_count": len(response.data),
                "selected_count": len(opportunities),
                "current_count": current_count,
                "monitoring_count": monitoring_count,
                "selection_scope": (
                    "Catalogue candidates screened by country, sector, municipal "
                    "eligibility, availability, climate relevance, municipal "
                    "application route, and the selected action's finance route. "
                    "Closed programmes are retained only for monitoring when the "
                    "catalogue marks them as recurring; candidates are not matched "
                    "to the selected action."
                ),
                "datasources": [
                    source.model_dump(mode="json", exclude_none=True)
                    for source in response.meta.datasources
                ],
            },
        )

    def _build_url(self, *, country_code: str, sector: str) -> str:
        """Build the municipality-relevant opportunities URL."""
        query = {
            "country_code": country_code.strip().upper(),
            "sector": sector.strip(),
            "eligible_actor": "municipality",
            "limit": str(REPORT_FINANCE_SCREENING_LIMIT),
        }
        return (
            f"{self.base_url.rstrip('/')}/api/v1/climate-finance/opportunities?"
            f"{urlencode(query)}"
        )


def _screen_report_opportunities(
    opportunities: list[ClimateFinanceOpportunityRecord],
    *,
    route: str | None,
    limit: int,
) -> list[ClimateFinanceOpportunityRecord]:
    """Select current candidates and recurring closed programmes to monitor."""
    inactive_statuses = {"closed", "cancelled", "expired"}
    active = [
        opportunity
        for opportunity in opportunities
        if (opportunity.status or "").strip().lower() not in inactive_statuses
    ]
    normalized_route = (route or "").strip().lower().replace("_", " ")
    if "technical assistance" in normalized_route:
        technical_assistance = [
            opportunity
            for opportunity in active
            if opportunity.instrument == "technical_assistance"
        ]
        if technical_assistance:
            active = technical_assistance

    recurring_values = {"annual", "periodic", "recurring", "sporadic"}
    monitoring = [
        opportunity
        for opportunity in opportunities
        if (opportunity.status or "").strip().lower() == "closed"
        and (opportunity.recurrence or "").strip().lower() in recurring_values
    ]

    def priority(opportunity: ClimateFinanceOpportunityRecord) -> tuple[int, int, int]:
        """Favor explicit climate relevance and direct municipal application."""
        applications = {
            value.strip().lower()
            for value in opportunity.city_application
            if value.strip()
        }
        return (
            0 if opportunity.climate_relevance == "explicit" else 1,
            0 if "direct" in applications else 1,
            0 if opportunity.instrument == "technical_assistance" else 1,
        )

    current_rows = [
        opportunity.model_copy(update={"report_category": "current"})
        for opportunity in sorted(active, key=priority)[:limit]
    ]
    monitoring_rows = [
        opportunity.model_copy(update={"report_category": "monitor"})
        for opportunity in sorted(monitoring, key=priority)[:limit]
    ]
    return current_rows + monitoring_rows
