"""Live enrichment service for output-plan report context."""

from __future__ import annotations

from app.modules.prioritizer.internal_models import Action
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
    - report request carrying one locode, action ID, language, and prioritization snapshot
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
        financial_feasibility=financial_result.scores_by_action_id.get(
            action.action_id
        ),
        source_metadata=source_metadata,
    )


def _find_action(actions: list[Action], action_id: str) -> Action:
    """Return the selected action from the live action catalog."""
    normalized_action_id = action_id.strip().upper()
    for action in actions:
        if action.action_id.strip().upper() == normalized_action_id:
            return action
    raise ValueError("Report actionId was not found in live action pathway data")
