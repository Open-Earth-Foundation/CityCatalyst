"""
Expose HIAP-MEED reference data through seven read-only HTTP endpoints.

Each route states which city, country, language, action, sector, or finance
route the caller may choose. Global API addresses, technical query parameters,
validation, filtering, ordering, and result limits remain controlled by the
existing HIAP-MEED clients in ``app/services``.
"""

from __future__ import annotations

import logging
from typing import Annotated, NoReturn
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.modules.reference_data.models import (
    ActionFinancialScoresResponse,
    ActionMitigationScoresResponse,
    ActionPathwaysQuery,
    ActionPathwaysResponse,
    ActionPolicyScoresResponse,
    CityAttributesResponse,
    ClimateFinanceOpportunitiesQuery,
    ClimateFinanceOpportunitiesResponse,
    ClimateFinanceProjectsQuery,
    ClimateFinanceProjectsResponse,
    CountryQuery,
)
from app.modules.reference_data.response_builders import (
    build_action_financial_scores_response,
    build_action_mitigation_scores_response,
    build_action_pathways_response,
    build_action_policy_scores_response,
    build_city_attributes_response,
    build_climate_finance_opportunities_response,
    build_climate_finance_projects_response,
)
from app.services.action_pathways_api import select_prioritizable_actions
from app.services.data_clients import (
    ApiActionFinancialFeasibilityScoresDataApiClient,
    ApiActionMitigationFeasibilityScoresDataApiClient,
    ApiActionPathwaysDataApiClient,
    ApiActionPolicyScoresDataApiClient,
    ApiCityDataApiClient,
    MockActionFinancialFeasibilityScoresDataApiClient,
    MockActionMitigationFeasibilityScoresDataApiClient,
    MockActionPathwaysDataApiClient,
    MockActionPolicyScoresDataApiClient,
    MockCityDataApiClient,
    get_action_financial_feasibility_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_action_policy_scores_data_api_client,
    get_city_data_api_client,
)
from app.services.http_client import UpstreamApiError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reference data"])
LocodePath = Annotated[
    str,
    Path(
        min_length=1,
        description=(
            "Caller-selected city locode. HIAP-MEED normalizes it before using the "
            "configured reference-data source."
        ),
    ),
]


def _raise_upstream_error(error: UpstreamApiError) -> NoReturn:
    """Log upstream diagnostics and raise the established public error shape."""
    request_id = str(uuid4())
    logger.warning(
        "Reference-data upstream failure request_id=%s status=%s "
        "upstream_status=%s url=%s error=%s",
        request_id,
        error.status_code,
        error.upstream_status_code,
        error.url,
        error.message,
    )
    detail: dict[str, str | int] = {
        "request_id": request_id,
        "error": error.message,
    }
    if error.upstream_status_code is not None:
        detail["upstream_status_code"] = error.upstream_status_code
    raise HTTPException(status_code=error.status_code, detail=detail) from error


@router.get(
    "/v1/cities/{locode}/attributes",
    response_model=CityAttributesResponse,
    summary="Get normalized city attributes",
    description=(
        "The caller selects the city locode. HIAP-MEED owns the Global API URL, "
        "response validation, indicator mapping, and public projection; no source "
        "URL, version label, or technical filter is caller-selectable."
    ),
    responses={
        404: {"description": "The requested city was not found."},
        502: {"description": "The configured source returned an invalid response."},
    },
)
def get_city_attributes(
    locode: LocodePath,
    client: MockCityDataApiClient | ApiCityDataApiClient = Depends(
        get_city_data_api_client
    ),
) -> CityAttributesResponse:
    """
    Return a caller-selected city using backend-owned source and mapping rules.

    Frontend-selectable: `locode`. Backend-controlled: which Global API address
    is called, validation, normalization, which indicator fields are returned,
    and diagnostic details that remain in backend logs.
    """
    try:
        city = client.get_city(locode)
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    except ValueError as error:
        raise HTTPException(status_code=404, detail={"error": str(error)}) from error
    return build_city_attributes_response(city, locode=locode)


@router.get(
    "/v1/action-pathways",
    response_model=ActionPathwaysResponse,
    summary="List canonical action pathways",
    description=(
        "The caller may repeat `language` to select localization maps, or omit it "
        "to receive all available localizations. HIAP-MEED fetches the all-language "
        "catalogue and returns the same prioritizable actions used by exclusion "
        "preview, prioritization, and output-plan generation."
    ),
    responses={502: {"description": "The configured source returned an invalid response."}},
)
def list_action_pathways(
    query: Annotated[ActionPathwaysQuery, Query()],
    client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient = Depends(
        get_action_pathways_data_api_client
    ),
) -> ActionPathwaysResponse:
    """
    Return prioritizable actions in the caller-selected languages.

    Frontend-selectable: zero or more supported `language` values.
    Backend-controlled: fetching all available languages, validation, and the
    shared action-membership rule. Only actions whose type is `mitigation` are
    returned; all other and missing action types are excluded.
    """
    try:
        result = client.list_actions()
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    actions, _, missing_action_type_actions = select_prioritizable_actions(
        result.actions
    )
    return build_action_pathways_response(
        result.model_copy(update={"actions": actions}),
        requested_languages=query.language,
        missing_action_type_count=len(missing_action_type_actions),
    )


@router.get(
    "/v1/cities/{locode}/action-policy-scores",
    response_model=ActionPolicyScoresResponse,
    summary="Get action policy scores and evidence",
    description=(
        "The caller selects only the city locode. HIAP-MEED uses its canonical "
        "unlimited evidence query, duplicate-ID validation, missing-release behavior, "
        "and policy-scope aggregation; `top_evidence_limit` is intentionally unavailable."
    ),
    responses={502: {"description": "The configured source returned an invalid response."}},
)
def get_action_policy_scores(
    locode: LocodePath,
    client: MockActionPolicyScoresDataApiClient
    | ApiActionPolicyScoresDataApiClient = Depends(
        get_action_policy_scores_data_api_client
    ),
) -> ActionPolicyScoresResponse:
    """
    Return city policy scores using the same evidence set as processing flows.

    Frontend-selectable: `locode`. Backend-controlled: how much evidence is
    fetched, validation, missing-release handling, ordering, and the national,
    regional, and municipal averages.
    """
    try:
        result = client.get_action_policy_scores(locode)
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    return build_action_policy_scores_response(result, locode=locode)


@router.get(
    "/v1/cities/{locode}/action-mitigation-feasibility-scores",
    response_model=ActionMitigationScoresResponse,
    summary="Get action mitigation-feasibility scores",
    description=(
        "The caller selects city and country scope. HIAP-MEED owns URL construction, "
        "validation, action-ID mapping, missing-release handling, and ordering. Missing "
        "scores stay absent; this read API never injects prioritization fallback values."
    ),
    responses={502: {"description": "The configured source returned an invalid response."}},
)
def get_action_mitigation_feasibility_scores(
    locode: LocodePath,
    query: Annotated[CountryQuery, Query()],
    client: MockActionMitigationFeasibilityScoresDataApiClient
    | ApiActionMitigationFeasibilityScoresDataApiClient = Depends(
        get_action_mitigation_feasibility_scores_data_api_client
    ),
) -> ActionMitigationScoresResponse:
    """
    Return mitigation scores for the caller-selected city and country.

    Frontend-selectable: `locode` and `country_code`. Backend-controlled: which
    Global API address is called, validation, missing-release behavior, field
    mapping, and row order.
    """
    try:
        result = client.get_action_mitigation_feasibility_scores(
            locode,
            query.country_code,
        )
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    return build_action_mitigation_scores_response(
        result,
        locode=locode,
        country_code=query.country_code,
    )


@router.get(
    "/v1/cities/{locode}/climate-finance/feasibility",
    response_model=ActionFinancialScoresResponse,
    summary="Get action financial-feasibility scores",
    description=(
        "The caller selects city and country scope. HIAP-MEED owns URL construction, "
        "validation, missing-release handling, and record membership. Numeric scores "
        "are ordered descending, missing scores remain null and appear last, and "
        "diagnostic input/link fields stay outside the browser contract."
    ),
    responses={502: {"description": "The configured source returned an invalid response."}},
)
def get_action_financial_feasibility_scores(
    locode: LocodePath,
    query: Annotated[CountryQuery, Query()],
    client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient = Depends(
        get_action_financial_feasibility_scores_data_api_client
    ),
) -> ActionFinancialScoresResponse:
    """
    Return finance scores for the caller-selected city and country.

    Frontend-selectable: `locode` and `country_code`. Backend-controlled: which
    Global API address is called, field mapping, missing-release behavior,
    preservation of all normalized rows, and scored-first display ordering.
    """
    try:
        result = client.get_action_financial_feasibility_scores(
            locode,
            query.country_code,
        )
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    return build_action_financial_scores_response(
        result,
        locode=locode,
        country_code=query.country_code,
    )


@router.get(
    "/v1/climate-finance/opportunities",
    response_model=ClimateFinanceOpportunitiesResponse,
    summary="List screened climate-finance opportunities",
    description=(
        "The caller selects country, optional action sector, and optional finance "
        "route. HIAP-MEED fixes municipal eligibility and the upstream screening "
        "limit, applies its current/monitor selection and ordering, and caps each "
        "category at five. `eligible_actor` and `limit` are intentionally unavailable."
    ),
    responses={502: {"description": "The configured source returned an invalid response."}},
)
def get_climate_finance_opportunities(
    query: Annotated[ClimateFinanceOpportunitiesQuery, Query()],
    client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient = Depends(
        get_action_financial_feasibility_scores_data_api_client
    ),
) -> ClimateFinanceOpportunitiesResponse:
    """
    Return opportunities selected by the same rules as output-plan generation.

    Frontend-selectable: `country_code`, `sector`, and `route`. Backend-controlled:
    municipal eligibility, screening limit 50, status and recurrence rules,
    technical-assistance preference, ordering, and five current/monitor caps.
    """
    try:
        result = client.get_report_finance_opportunities(
            country_code=query.country_code,
            sector=query.sector,
            route=query.route,
        )
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    return build_climate_finance_opportunities_response(
        result,
        country_code=query.country_code,
        sector=query.sector,
        route=query.route,
    )


@router.get(
    "/v1/climate-finance/projects",
    response_model=ClimateFinanceProjectsResponse,
    summary="List comparable climate-finance projects",
    description=(
        "The caller selects country and action. HIAP-MEED owns the Global API query, "
        "validation, source ordering, and the same five-project limit used by "
        "output-plan generation; `limit` is intentionally unavailable."
    ),
    responses={
        404: {"description": "The requested action has no project resource."},
        502: {"description": "The configured source returned an invalid response."},
    },
)
def get_climate_finance_projects(
    query: Annotated[ClimateFinanceProjectsQuery, Query()],
    client: MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient = Depends(
        get_action_financial_feasibility_scores_data_api_client
    ),
) -> ClimateFinanceProjectsResponse:
    """
    Return comparable projects selected by the same rules as output-plan generation.

    Frontend-selectable: `country_code` and `action_id`. Backend-controlled:
    which Global API address is called, validation, ordering, and the maximum
    of five projects.
    """
    try:
        result = client.get_report_finance_projects(
            country_code=query.country_code,
            action_id=query.action_id,
        )
    except UpstreamApiError as error:
        _raise_upstream_error(error)
    return build_climate_finance_projects_response(
        result,
        country_code=query.country_code,
        action_id=query.action_id,
    )
