"""Synchronous client for upstream action financial feasibility scores."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.parse import quote, urlencode

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import (
    ActionFinancialFeasibilityScoreRecord,
    ActionFinancialFeasibilityScoresFetchResult,
    ClimateFinanceOpportunityRecord,
    ClimateFinanceProjectRecord,
    ClimateFinanceReportEvidenceFetchResult,
)
from app.modules.prioritizer.models import (
    ActionFinancialFeasibilityScoresApiResponse,
    ClimateFinanceOpportunitiesApiResponse,
    ClimateFinanceProjectsApiResponse,
)
from app.services.http_client import UpstreamApiError, get_json_with_retries

logger = logging.getLogger(__name__)

DEFAULT_ACTION_FINANCIAL_FEASIBILITY_SCORES_BASE_URL = (
    "https://ccglobal.openearth.dev"
)
ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE = (
    "GET /api/v1/cities/{locode}/climate-finance/feasibility"
)
CLIMATE_FINANCE_OPPORTUNITIES_ENDPOINT = "GET /api/v1/climate-finance/opportunities"
CLIMATE_FINANCE_PROJECTS_ENDPOINT = "GET /api/v1/climate-finance/projects"
REPORT_FINANCE_ROWS_LIMIT = 5
REPORT_FINANCE_SCREENING_LIMIT = 50


def get_action_financial_feasibility_scores_base_url() -> str:
    """Return the configured shared Global API host."""
    raw_value = os.getenv("CCGLOBAL_API_BASE_URL")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_ACTION_FINANCIAL_FEASIBILITY_SCORES_BASE_URL
    return raw_value.strip()


@dataclass
class ActionFinancialFeasibilityScoresApiService:
    """Fetch and map city-scoped financial feasibility scores."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the upstream financial feasibility host from config when omitted."""
        if self.base_url is None:
            self.base_url = get_action_financial_feasibility_scores_base_url()

    def _build_action_financial_feasibility_scores_url(
        self, locode: str, country_code: str
    ) -> str:
        """Return the full upstream financial feasibility scores URL for one city."""
        normalized_locode = locode.strip().upper()
        normalized_country_code = country_code.strip().upper()
        encoded_locode = quote(normalized_locode, safe="")
        query = urlencode({"country_code": normalized_country_code})
        return (
            f"{self.base_url.rstrip('/')}/api/v1/cities/{encoded_locode}/"
            f"climate-finance/feasibility?{query}"
        )

    def _base_source_metadata(
        self,
        *,
        locode: str,
        country_code: str,
        url: str,
        http_status_code: int | None,
        upstream_generated_at_utc: str | None,
    ) -> dict[str, object]:
        """Return artifact-friendly source metadata for one request."""
        return {
            "mock_file_path": None,
            "upstream_url": url,
            "upstream_endpoint": ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
            "requested_locode": locode.strip().upper(),
            "requested_country_code": country_code.strip().upper(),
            "http_status_code": http_status_code,
            "upstream_generated_at_utc": upstream_generated_at_utc,
        }

    def get_scores_by_action_id(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Fetch one city-scoped payload and map it by action ID."""
        scores_url = self._build_action_financial_feasibility_scores_url(
            locode,
            country_code,
        )
        try:
            payload, http_status_code = get_json_with_retries(
                url=scores_url,
                operation_name="action financial feasibility scores API call",
                headers={"accept": "application/json"},
            )
        except UpstreamApiError as error:
            if error.status_code != 404:
                raise
            warning = (
                "action financial feasibility scores API returned 404; continuing "
                f"with empty scores for locode={locode.strip().upper()}"
            )
            logger.warning(warning)
            return ActionFinancialFeasibilityScoresFetchResult(
                scores_by_action_id={},
                source_metadata=self._base_source_metadata(
                    locode=locode,
                    country_code=country_code,
                    url=scores_url,
                    http_status_code=error.upstream_status_code,
                    upstream_generated_at_utc=None,
                ),
                upstream_meta={},
                warning=warning,
            )

        try:
            response = ActionFinancialFeasibilityScoresApiResponse.model_validate(
                payload
            )
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message=(
                    "action financial feasibility scores API returned a payload "
                    "that failed schema validation"
                ),
                upstream_status_code=http_status_code,
                url=scores_url,
            ) from error

        source_metadata = self._base_source_metadata(
            locode=locode,
            country_code=country_code,
            url=scores_url,
            http_status_code=http_status_code,
            upstream_generated_at_utc=response.meta.generated_at_utc,
        )
        scores_by_action_id: dict[str, ActionFinancialFeasibilityScoreRecord] = {}
        for score in response.data:
            action_id = score.action_id
            if action_id in scores_by_action_id:
                raise UpstreamApiError(
                    status_code=502,
                    message=(
                        "action financial feasibility scores API returned duplicate "
                        f"action_id values for locode={locode.strip().upper()}"
                    ),
                    upstream_status_code=http_status_code,
                    url=scores_url,
                )
            score_raw = score.model_dump(mode="json")
            scores_by_action_id[action_id] = (
                ActionFinancialFeasibilityScoreRecord.model_validate(
                    {
                        "action_id": action_id,
                        "action_name": score.action_name,
                        "sector": score.sector,
                        "financial_feasibility": score.financial_feasibility,
                        "route": score.route,
                        "reason": score.reason,
                        "inputs": score.inputs,
                        "links": score.links,
                        "raw": score_raw,
                        "source_metadata": source_metadata,
                    }
                )
            )

        return ActionFinancialFeasibilityScoresFetchResult(
            scores_by_action_id=scores_by_action_id,
            source_metadata=source_metadata,
            upstream_meta=response.meta.model_dump(mode="json"),
            warning=None,
        )

    def get_report_evidence(
        self,
        *,
        action_id: str,
        country_code: str,
        sector: str | None,
        route: str | None = None,
        limit: int = REPORT_FINANCE_ROWS_LIMIT,
    ) -> ClimateFinanceReportEvidenceFetchResult:
        """Fetch a compact set of named funds and precedents for one report."""
        opportunities_url = self._build_catalogue_url(
            path="/api/v1/climate-finance/opportunities",
            query={
                "country_code": country_code.strip().upper(),
                "sector": sector,
                "eligible_actor": "municipality",
            },
            limit=REPORT_FINANCE_SCREENING_LIMIT,
        )
        projects_url = self._build_catalogue_url(
            path="/api/v1/climate-finance/projects",
            query={
                "country_code": country_code.strip().upper(),
                "action_id": action_id,
            },
            limit=limit,
        )

        # Fetch only the selected action's compact report evidence.
        opportunities_payload, opportunities_status = get_json_with_retries(
            url=opportunities_url,
            operation_name="climate finance opportunities API call",
            headers={"accept": "application/json"},
        )
        projects_payload, projects_status = get_json_with_retries(
            url=projects_url,
            operation_name="climate finance projects API call",
            headers={"accept": "application/json"},
        )
        try:
            opportunities_response = ClimateFinanceOpportunitiesApiResponse.model_validate(
                opportunities_payload
            )
            projects_response = ClimateFinanceProjectsApiResponse.model_validate(
                projects_payload
            )
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message="climate finance report evidence failed schema validation",
                url=opportunities_url,
            ) from error

        screened_opportunities = _screen_report_opportunities(
            [
                ClimateFinanceOpportunityRecord.model_validate(
                    opportunity.model_dump(mode="json")
                )
                for opportunity in opportunities_response.data
            ],
            route=route,
            limit=limit,
        )
        current_count = sum(
            opportunity.report_category == "current"
            for opportunity in screened_opportunities
        )
        monitoring_count = sum(
            opportunity.report_category == "monitor"
            for opportunity in screened_opportunities
        )
        return ClimateFinanceReportEvidenceFetchResult(
            opportunities=screened_opportunities,
            projects=[
                ClimateFinanceProjectRecord.model_validate(project.model_dump(mode="json"))
                for project in projects_response.data
            ],
            source_metadata={
                "opportunities": {
                    "upstream_url": opportunities_url,
                    "upstream_endpoint": CLIMATE_FINANCE_OPPORTUNITIES_ENDPOINT,
                    "http_status_code": opportunities_status,
                    "upstream_generated_at_utc": (
                        opportunities_response.meta.generated_at_utc
                    ),
                    "fetched_count": len(opportunities_response.data),
                    "selected_count": len(screened_opportunities),
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
                        for source in opportunities_response.meta.datasources
                    ],
                },
                "projects": {
                    "upstream_url": projects_url,
                    "upstream_endpoint": CLIMATE_FINANCE_PROJECTS_ENDPOINT,
                    "http_status_code": projects_status,
                    "upstream_generated_at_utc": projects_response.meta.generated_at_utc,
                    "total": projects_response.meta.total,
                    "datasources": [
                        source.model_dump(mode="json", exclude_none=True)
                        for source in projects_response.meta.datasources
                    ],
                },
            },
        )

    def _build_catalogue_url(
        self,
        *,
        path: str,
        query: dict[str, str | None],
        limit: int,
    ) -> str:
        """Build one climate-finance catalogue URL without empty filters."""
        normalized_query = {
            key: value.strip() if isinstance(value, str) else value
            for key, value in query.items()
            if value is not None and (not isinstance(value, str) or value.strip())
        }
        normalized_query["limit"] = str(limit)
        return f"{self.base_url.rstrip('/')}{path}?{urlencode(normalized_query)}"


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
            value.strip().lower() for value in opportunity.city_application if value.strip()
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
