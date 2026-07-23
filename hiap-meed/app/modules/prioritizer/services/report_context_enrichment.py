"""Live enrichment service for output-plan report context."""

from __future__ import annotations

import logging

from app.modules.prioritizer.internal_models import (
    Action,
    ClimateFinanceOpportunitiesFetchResult,
    ClimateFinanceProjectsFetchResult,
    ClimateFinanceReportEvidenceFetchResult,
)
from app.modules.prioritizer.models import CityActionReportApiRequest
from app.modules.prioritizer.report_context import (
    build_report_context,
    validate_report_snapshot,
)
from app.modules.prioritizer.report_models import ReportContext
from app.services.data_clients import (
    ApiActionFinancialFeasibilityScoresDataApiClient,
    ApiActionMitigationFeasibilityScoresDataApiClient,
    ApiActionPathwaysDataApiClient,
    ApiActionPolicyScoresDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    MockActionFinancialFeasibilityScoresDataApiClient,
    MockActionMitigationFeasibilityScoresDataApiClient,
    MockActionPathwaysDataApiClient,
    MockActionPolicyScoresDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    S3LegalDataApiClient,
    describe_legal_data_source,
)
from app.services.http_client import UpstreamApiError

logger = logging.getLogger(__name__)


def build_report_context_with_live_enrichment(
    *,
    request: CityActionReportApiRequest,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient,
    action_pathways_data_api_client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient,
    legal_data_api_client: MockLegalDataApiClient | ApiLegalDataApiClient | S3LegalDataApiClient,
    action_policy_scores_data_api_client: MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient,
    action_mitigation_feasibility_scores_data_api_client: MockActionMitigationFeasibilityScoresDataApiClient
    | ApiActionMitigationFeasibilityScoresDataApiClient,
    action_financial_feasibility_scores_data_api_client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient,
) -> ReportContext:
    """
    Build a report context using snapshot validation plus live source refetches.

    Inputs:
    - report request carrying one locode, action ID, language list, and prioritization snapshot
    - data clients for live city/action/policy/legal/feasibility enrichment

    Returns:
    - normalized `ReportContext` for downstream chapter builders

    Side effects:
    - calls configured upstream or mock data clients

    Raises:
    - `ValueError` when the snapshot is invalid or the selected action is absent
    - `UpstreamApiError` from API-backed clients when required source calls fail
    """
    _, _, country_code = validate_report_snapshot(request)
    locode = request.requestData.locode
    action_id = request.requestData.actionId

    # Step 1: fetch live source data used by several report chapters.
    city = city_data_api_client.get_city(locode)
    actions_result = action_pathways_data_api_client.list_actions()
    action = _find_action(actions_result.actions, action_id)
    policy_result = action_policy_scores_data_api_client.get_action_policy_scores(locode)
    legal_assessments = legal_data_api_client.get_action_legal_assessments(country_code)
    mitigation_result = (
        action_mitigation_feasibility_scores_data_api_client.get_action_mitigation_feasibility_scores(
            locode, country_code
        )
    )
    financial_result = (
        action_financial_feasibility_scores_data_api_client.get_action_financial_feasibility_scores(
            locode, country_code
        )
    )
    financial_record = financial_result.scores_by_action_id.get(action.action_id)
    finance_evidence = _fetch_report_finance_evidence(
        client=action_financial_feasibility_scores_data_api_client,
        action_id=action.action_id,
        country_code=country_code,
        sector=financial_record.sector if financial_record else None,
        route=financial_record.route if financial_record else None,
    )

    # Step 2: keep source metadata separate from report facts.
    source_metadata = {
        "city": city.source_metadata,
        "action_pathways": actions_result.source_metadata,
        "policy_scores": policy_result.source_metadata,
        "legal": describe_legal_data_source(
            legal_data_api_client, country_code=country_code
        ),
        "mitigation_feasibility": mitigation_result.source_metadata,
        "financial_feasibility": financial_result.source_metadata,
        "finance_catalogues": finance_evidence.source_metadata,
    }

    return build_report_context(
        request=request,
        action=action,
        city=city,
        policy_score=policy_result.scores_by_action_id.get(action.action_id),
        legal_assessment=legal_assessments.get(action.action_id),
        mitigation_feasibility=mitigation_result.scores_by_action_id.get(
            action.action_id
        ),
        financial_feasibility=financial_record,
        finance_opportunities=finance_evidence.opportunities,
        comparable_projects=finance_evidence.projects,
        source_metadata=source_metadata,
    )


def _fetch_report_finance_evidence(
    *,
    client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient,
    action_id: str,
    country_code: str,
    sector: str | None,
    route: str | None,
) -> ClimateFinanceReportEvidenceFetchResult:
    """Fetch opportunities and projects without coupling their failure boundaries."""
    opportunities_result = _fetch_report_finance_opportunities(
        client=client,
        country_code=country_code,
        sector=sector,
        route=route,
    )
    projects_result = _fetch_report_finance_projects(
        client=client,
        action_id=action_id,
        country_code=country_code,
    )
    return ClimateFinanceReportEvidenceFetchResult(
        opportunities=opportunities_result.opportunities,
        projects=projects_result.projects,
        source_metadata={
            "opportunities": opportunities_result.source_metadata,
            "projects": projects_result.source_metadata,
        },
        warnings=[
            warning
            for warning in (
                opportunities_result.warning,
                projects_result.warning,
            )
            if warning
        ],
    )


def _fetch_report_finance_opportunities(
    *,
    client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient,
    country_code: str,
    sector: str | None,
    route: str | None,
) -> ClimateFinanceOpportunitiesFetchResult:
    """Fetch opportunities while containing failures to this endpoint."""
    fetch_opportunities = getattr(client, "get_report_finance_opportunities", None)
    if fetch_opportunities is None:
        return ClimateFinanceOpportunitiesFetchResult(
            warning="The finance client does not provide detailed opportunities."
        )
    try:
        return fetch_opportunities(
            country_code=country_code,
            sector=sector,
            route=route,
        )
    except UpstreamApiError as error:
        logger.warning(
            "Report finance opportunities unavailable country_code=%s sector=%s error=%s",
            country_code,
            sector,
            error,
        )
        return ClimateFinanceOpportunitiesFetchResult(
            source_metadata=_failed_catalogue_source_metadata(error),
            warning="Detailed finance opportunities are unavailable.",
        )


def _fetch_report_finance_projects(
    *,
    client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient,
    action_id: str,
    country_code: str,
) -> ClimateFinanceProjectsFetchResult:
    """Fetch projects while containing failures to this endpoint."""
    fetch_projects = getattr(client, "get_report_finance_projects", None)
    if fetch_projects is None:
        return ClimateFinanceProjectsFetchResult(
            warning="The finance client does not provide comparable projects."
        )
    try:
        return fetch_projects(
            action_id=action_id,
            country_code=country_code,
        )
    except UpstreamApiError as error:
        if error.upstream_status_code == 404:
            warning = "No comparable projects are available for this action."
        else:
            warning = "Detailed comparable projects are unavailable."
        logger.warning(
            "Report finance projects unavailable action_id=%s error=%s",
            action_id,
            error,
        )
        return ClimateFinanceProjectsFetchResult(
            source_metadata=_failed_catalogue_source_metadata(error),
            warning=warning,
        )


def _failed_catalogue_source_metadata(error: UpstreamApiError) -> dict[str, object]:
    """Preserve endpoint failure evidence without exposing it as report prose."""
    return {
        "upstream_url": error.url,
        "http_status_code": error.upstream_status_code,
    }


def _find_action(actions: list[Action], action_id: str) -> Action:
    """Return the selected action from the live action catalog."""
    normalized_action_id = action_id.strip().upper()
    for action in actions:
        if action.action_id.strip().upper() == normalized_action_id:
            return action
    raise ValueError("Report actionId was not found in live action pathway data")
