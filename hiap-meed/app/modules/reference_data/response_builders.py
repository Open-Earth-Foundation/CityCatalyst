"""
Build the public responses for HIAP-MEED reference-data endpoints.

The existing clients in ``app/services`` fetch and validate Global API data.
They also own data-selection rules such as the opportunity current/monitor split
and the five-project limit. This module only turns those normalized results into
the smaller, stable response shapes promised to frontend consumers.

Display-only rules live here: policy averages are calculated from all returned
evidence, localized fields are selected, and response rows receive a stable
order. This module does not remove source records or make network requests.
"""

from __future__ import annotations

from datetime import datetime, timezone
from statistics import fmean
from typing import Any

from app.modules.prioritizer.internal_models import (
    ActionFinancialFeasibilityScoresFetchResult,
    ActionMitigationFeasibilityScoresFetchResult,
    ActionPathwaysFetchResult,
    ActionPolicyScoreRecord,
    ActionPolicyScoresFetchResult,
    CityData,
    ClimateFinanceOpportunitiesFetchResult,
    ClimateFinanceProjectsFetchResult,
)
from app.modules.reference_data.models import (
    ActionFinancialScoreResponse,
    ActionFinancialScoresResponse,
    ActionMitigationScoreResponse,
    ActionMitigationScoresResponse,
    ActionPathwayResponse,
    ActionPathwaysResponse,
    ActionPolicyScoreResponse,
    ActionPolicyScoresResponse,
    CityAttributesResponse,
    CityIndicatorResponse,
    CityResponse,
    ClimateFinanceOpportunitiesResponse,
    ClimateFinanceProjectActionMatchResponse,
    ClimateFinanceProjectFundingSourceResponse,
    ClimateFinanceProjectResponse,
    ClimateFinanceProjectsResponse,
    CurrentFinanceOpportunityResponse,
    FinancialActionInputsResponse,
    FinancialCityInputsResponse,
    FinancialEvidenceInputsResponse,
    FinancialFeasibilityInputsResponse,
    FinancialFinanceInputsResponse,
    MonitoringFinanceOpportunityResponse,
    PolicyAggregatesResponse,
    PolicyEvidenceResponse,
    ReferenceDataMeta,
)

_POLICY_SIGNAL_STRENGTH = {"high": 0.7, "medium": 0.4, "low": 0.2}
_POLICY_SCOPE_BY_DOCUMENT_TYPE = {
    "framework": "national",
    "sector_plan": "national",
    "parcc": "regional",
    "paccc": "municipal",
}


def _generated_at_utc() -> str:
    """Return a UTC response-generation timestamp in the public API format."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _meta(
    *,
    endpoint: str,
    total_records: int,
    **scope: str | int,
) -> ReferenceDataMeta:
    """Build the common metadata envelope without exposing upstream diagnostics."""
    return ReferenceDataMeta(
        generated_at_utc=_generated_at_utc(),
        api_context={"endpoint": endpoint, **scope},
        total_records=total_records,
    )


def _warnings(*warnings: str | None) -> list[str]:
    """Return the supplied non-empty warnings in the stable public list shape."""
    return [warning for warning in warnings if warning]


def _city_indicators(city: CityData) -> list[CityIndicatorResponse]:
    """Return every city indicator in stable alphabetical order."""
    indicators: list[CityIndicatorResponse] = []
    for key, value in sorted(city.raw.items()):
        if not isinstance(value, dict) or "attribute_value" not in value:
            continue
        indicators.append(
            CityIndicatorResponse(
                key=key,
                value=value.get("attribute_value"),
                unit=value.get("attribute_units"),
                category=value.get("attribute_category"),
            )
        )
    return indicators


def build_city_attributes_response(
    city: CityData,
    *,
    locode: str,
) -> CityAttributesResponse:
    """
    Return the public city record for the requested locode.

    Every normalized city indicator is included with its value, unit, and
    upstream display category.
    Upstream URLs, datasource details, and the raw Global API payload stay out
    of the response.
    """
    normalized_locode = locode.strip().upper()
    return CityAttributesResponse(
        city=CityResponse(
            locode=city.locode,
            city_name=city.city_name,
            country_code=city.country_code,
            region_name=city.region_name,
            population_size=city.population_size,
            area_km2=city.area_km2,
            population_density=city.population_density,
            indicators=_city_indicators(city),
        ),
        meta=_meta(
            endpoint="GET /v1/cities/{locode}/attributes",
            total_records=1,
            locode=normalized_locode,
        ),
        warnings=[],
    )


def _localized_values(
    values: dict[str, str],
    requested_languages: list[str],
) -> dict[str, str]:
    """Return all localizations or only the caller-selected language keys."""
    if not requested_languages:
        return dict(values)
    return {
        language: values[language]
        for language in requested_languages
        if language in values
    }


def build_action_pathways_response(
    result: ActionPathwaysFetchResult,
    *,
    requested_languages: list[str],
    missing_action_type_count: int,
) -> ActionPathwaysResponse:
    """
    Return the canonical action catalogue in the requested languages.

    Language selection only changes the two localization maps. Catalogue
    fetching, validation, action membership, and ordering remain backend-owned.
    Metadata and warnings identify malformed upstream actions excluded because
    their action type was missing.
    """
    actions = [
        ActionPathwayResponse(
            action_id=action.action_id,
            action_name=action.action_name,
            action_type=action.action_type,
            description=action.description,
            name_i18n=_localized_values(action.name_i18n, requested_languages),
            description_i18n=_localized_values(
                action.description_i18n,
                requested_languages,
            ),
            investment_cost=action.investment_cost,
            implementation_timeline=action.implementation_timeline,
            co_benefits=action.co_benefits,
            emissions=action.emissions,
        )
        for action in result.actions
    ]
    return ActionPathwaysResponse(
        actions=actions,
        meta=_meta(
            endpoint="GET /v1/action-pathways",
            total_records=len(actions),
            missing_action_type_count=missing_action_type_count,
        ),
        warnings=_warnings(
            result.warning,
            (
                f"{missing_action_type_count} upstream action pathway(s) were "
                "excluded because action_type was missing."
                if missing_action_type_count
                else None
            ),
        ),
    )


def _policy_scope(document_type: object) -> str | None:
    """Return scope only for document types whose geography is defined."""
    if not isinstance(document_type, str):
        return None
    normalized_document_type = document_type.strip().lower()
    return _POLICY_SCOPE_BY_DOCUMENT_TYPE.get(normalized_document_type)


def _policy_evidence_strength(evidence: dict[str, Any]) -> float:
    """Return numeric evidence strength, converting high/medium/low when needed."""
    value = evidence.get("evidence_strength")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    signal_strength = str(evidence.get("signal_strength") or "").strip().lower()
    return _POLICY_SIGNAL_STRENGTH.get(signal_strength, 0.2)


def _mean(values: list[float]) -> float | None:
    """Return an arithmetic mean, or null when a policy scope has no coverage."""
    return fmean(values) if values else None


def _policy_aggregates(
    scores: list[ActionPolicyScoreRecord],
) -> PolicyAggregatesResponse:
    """
    Calculate the three policy averages shown to consumers.

    The national value is the average action policy score. For regional and
    municipal values, take the strongest evidence for each action at that level,
    then average those strongest values. A level with no evidence returns null.
    """
    national_scores = [
        score.policy_support_score
        for score in scores
        if score.policy_support_score is not None
    ]
    scope_strengths: dict[str, list[float]] = {"regional": [], "municipal": []}

    for score in scores:
        strongest: dict[str, float] = {}
        for evidence in score.policy_evidence:
            scope = _policy_scope(evidence.get("document_type"))
            if scope not in scope_strengths:
                continue
            strongest[scope] = max(
                strongest.get(scope, 0.0),
                _policy_evidence_strength(evidence),
            )
        for scope, strength in strongest.items():
            scope_strengths[scope].append(strength)

    return PolicyAggregatesResponse(
        national=_mean(national_scores),
        regional=_mean(scope_strengths["regional"]),
        municipal=_mean(scope_strengths["municipal"]),
    )


def build_action_policy_scores_response(
    result: ActionPolicyScoresFetchResult,
    *,
    locode: str,
) -> ActionPolicyScoresResponse:
    """
    Return all evidence and calculate national, regional, and municipal averages.

    The caller selects only the locode. HIAP-MEED deliberately does not expose
    or add a top-evidence limit, so processing and read consumers use the same
    normalized evidence set.
    """
    # Keep response order stable even when Global API row order changes.
    records = sorted(
        result.scores_by_action_id.values(),
        key=lambda score: score.action_id,
    )
    scores = [
        ActionPolicyScoreResponse(
            action_id=record.action_id,
            policy_support_score=record.policy_support_score,
            policy_support_category=record.policy_support_category,
            finding_count=record.n_findings,
            document_count=record.n_docs,
            policy_evidence=[
                PolicyEvidenceResponse(
                    document_type=evidence.get("document_type"),
                    scope=_policy_scope(evidence.get("document_type")),
                    document_name=evidence.get("document_name"),
                    signal_type=evidence.get("signal_type"),
                    signal_relation=evidence.get("signal_relation"),
                    signal_strength=evidence.get("signal_strength"),
                    doc_relevance=evidence.get("doc_relevance"),
                    evidence_strength=evidence.get("evidence_strength"),
                )
                for evidence in record.policy_evidence
            ],
        )
        for record in records
    ]
    normalized_locode = locode.strip().upper()
    return ActionPolicyScoresResponse(
        locode=normalized_locode,
        scores=scores,
        aggregates=_policy_aggregates(records),
        meta=_meta(
            endpoint="GET /v1/cities/{locode}/action-policy-scores",
            total_records=len(scores),
            locode=normalized_locode,
        ),
        warnings=_warnings(result.warning),
    )


def build_action_mitigation_scores_response(
    result: ActionMitigationFeasibilityScoresFetchResult,
    *,
    locode: str,
    country_code: str,
) -> ActionMitigationScoresResponse:
    """
    Return mitigation-feasibility scores for the requested city and country.

    Rows are ordered by their city rank. Missing actions remain missing: the
    neutral score used inside prioritization is not presented as source data.
    """
    # Ranked rows come first; unranked source rows follow in action-ID order.
    records = sorted(
        result.scores_by_action_id.values(),
        key=lambda score: (
            score.rank_within_city is None,
            score.rank_within_city or 0,
            score.action_id,
        ),
    )
    scores = [
        ActionMitigationScoreResponse(
            action_id=record.action_id,
            action_score=record.action_score,
            rank_within_city=record.rank_within_city,
            dimension_scores=record.dimension_scores,
        )
        for record in records
    ]
    normalized_locode = locode.strip().upper()
    normalized_country_code = country_code.strip().upper()
    return ActionMitigationScoresResponse(
        locode=normalized_locode,
        country_code=normalized_country_code,
        scores=scores,
        meta=_meta(
            endpoint=(
                "GET /v1/cities/{locode}/action-mitigation-feasibility-scores"
            ),
            total_records=len(scores),
            locode=normalized_locode,
            country_code=normalized_country_code,
        ),
        warnings=_warnings(result.warning),
    )


def build_action_financial_scores_response(
    result: ActionFinancialFeasibilityScoresFetchResult,
    *,
    locode: str,
    country_code: str,
) -> ActionFinancialScoresResponse:
    """
    Return every normalized financial-feasibility source row.

    Scored rows are sorted from highest to lowest, followed by rows whose score
    is missing. Missing values remain null because the neutral value used by
    prioritization is an algorithm rule, not Global API data. The source inputs
    used by the frontend to explain the score are returned unchanged; diagnostic
    links and any unknown input keys remain private.
    """
    # Keep the canonical record set while ordering scored rows first for display.
    records = list(result.scores_by_action_id.values())
    records.sort(
        key=lambda record: (
            record.financial_feasibility is None,
            -(record.financial_feasibility or 0.0),
            record.action_id,
        )
    )
    data = [
        ActionFinancialScoreResponse(
            action_id=record.action_id,
            action_name=record.action_name,
            sector=record.sector,
            financial_feasibility=record.financial_feasibility,
            route=record.route,
            reason=record.reason,
            inputs=_financial_feasibility_inputs(record.inputs),
        )
        for record in records
    ]
    normalized_locode = locode.strip().upper()
    normalized_country_code = country_code.strip().upper()
    return ActionFinancialScoresResponse(
        locode=normalized_locode,
        country_code=normalized_country_code,
        data=data,
        meta=_meta(
            endpoint="GET /v1/cities/{locode}/climate-finance/feasibility",
            total_records=len(data),
            locode=normalized_locode,
            country_code=normalized_country_code,
        ),
        warnings=_warnings(result.warning),
    )


def _financial_feasibility_inputs(
    inputs: dict[str, Any],
) -> FinancialFeasibilityInputsResponse:
    """Return only the source inputs used to explain feasibility in the UI."""
    action = inputs.get("action") if isinstance(inputs.get("action"), dict) else {}
    city = inputs.get("city") if isinstance(inputs.get("city"), dict) else {}
    finance = inputs.get("finance") if isinstance(inputs.get("finance"), dict) else {}
    evidence = (
        inputs.get("evidence") if isinstance(inputs.get("evidence"), dict) else {}
    )
    return FinancialFeasibilityInputsResponse(
        action=FinancialActionInputsResponse(
            capital_intensity=action.get("capital_intensity"),
            preparation_complexity=action.get("preparation_complexity"),
        ),
        city=FinancialCityInputsResponse(profile=city.get("profile")),
        finance=FinancialFinanceInputsResponse(
            fund_access=finance.get("fund_access"),
            n_reachable_opportunities=finance.get("n_reachable_opportunities"),
        ),
        evidence=FinancialEvidenceInputsResponse(
            n_existing_projects=evidence.get("n_existing_projects"),
        ),
    )


def build_climate_finance_opportunities_response(
    result: ClimateFinanceOpportunitiesFetchResult,
    *,
    country_code: str,
    sector: str | None,
    route: str | None,
) -> ClimateFinanceOpportunitiesResponse:
    """
    Return the already selected opportunities as current and monitor lists.

    The Global API client has already applied municipal eligibility, status,
    recurrence, route preference, ordering, and the five-item limits. This
    function only separates those selected rows for the public response.
    """
    # Selection already happened in the service; only split the two categories.
    current = [
        CurrentFinanceOpportunityResponse(
            opportunity_name=record.opportunity_name,
            funder_name=record.funder_name,
            instrument=record.instrument,
            status=record.status,
            source_url=record.source_url,
        )
        for record in result.opportunities
        if record.report_category == "current"
    ]
    monitor = [
        MonitoringFinanceOpportunityResponse(
            opportunity_name=record.opportunity_name,
            funder_name=record.funder_name,
            instrument=record.instrument,
            status=record.status,
            recurrence=record.recurrence,
            source_url=record.source_url,
        )
        for record in result.opportunities
        if record.report_category == "monitor"
    ]
    normalized_country_code = country_code.strip().upper()
    context = {
        "country_code": normalized_country_code,
        "sector": sector or "",
        "route": route or "",
    }
    return ClimateFinanceOpportunitiesResponse(
        current=current,
        monitor=monitor,
        meta=_meta(
            endpoint="GET /v1/climate-finance/opportunities",
            total_records=len(current) + len(monitor),
            **context,
        ),
        warnings=_warnings(result.warning),
    )


def build_climate_finance_projects_response(
    result: ClimateFinanceProjectsFetchResult,
    *,
    country_code: str,
    action_id: str,
) -> ClimateFinanceProjectsResponse:
    """
    Return the comparable projects selected for a country and action.

    The Global API client has already applied the backend-owned five-project
    limit. Display fields from those source rows are returned without deriving
    new values; upstream request metadata remains private.
    """
    # Keep the source order selected by the shared projects service.
    projects = [
        ClimateFinanceProjectResponse(
            project_name=record.project_name,
            project_name_i18n=record.project_name_i18n,
            sector=record.sector,
            jurisdiction=record.jurisdiction,
            lifecycle_stage=record.lifecycle_stage,
            funding_channel=record.funding_channel,
            cost_total=record.cost_total,
            amount_unit=record.amount_unit,
            funding_sources=[
                ClimateFinanceProjectFundingSourceResponse(
                    cycle=source.get("cycle"),
                    amount=source.get("amount"),
                    amount_unit=source.get("amount_unit"),
                    funder_name=source.get("funder_name"),
                )
                for source in record.funding_sources
            ],
            action_matches=[
                ClimateFinanceProjectActionMatchResponse(
                    action_id=match["action_id"],
                    confidence=match.get("confidence"),
                )
                for match in record.action_matches
                if isinstance(match.get("action_id"), str)
            ],
        )
        for record in result.projects
    ]
    normalized_country_code = country_code.strip().upper()
    return ClimateFinanceProjectsResponse(
        projects=projects,
        meta=_meta(
            endpoint="GET /v1/climate-finance/projects",
            total_records=len(projects),
            country_code=normalized_country_code,
            action_id=action_id.strip(),
        ),
        warnings=_warnings(result.warning),
    )
