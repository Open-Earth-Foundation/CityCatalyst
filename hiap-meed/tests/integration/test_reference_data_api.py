"""Integration tests for the public HIAP-MEED reference-data routes."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionFinancialFeasibilityScoresFetchResult,
    ActionMitigationFeasibilityScoreRecord,
    ActionMitigationFeasibilityScoresFetchResult,
    ActionPathwaysFetchResult,
    ActionPolicyScoreRecord,
    ActionPolicyScoresFetchResult,
    CityData,
    ClimateFinanceOpportunitiesFetchResult,
    ClimateFinanceOpportunityRecord,
    ClimateFinanceProjectRecord,
    ClimateFinanceProjectsFetchResult,
)
from app.services.data_clients import (
    ApiActionFinancialFeasibilityScoresDataApiClient,
    get_action_financial_feasibility_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_action_policy_scores_data_api_client,
    get_city_data_api_client,
)
from app.services.http_client import UpstreamApiError


@pytest.fixture(autouse=True)
def clear_dependency_overrides() -> Iterator[None]:
    """Keep route dependency overrides isolated to each test."""
    yield
    app.dependency_overrides.clear()


@dataclass
class CityClient:
    """In-memory city reference-data client."""

    city: CityData

    def get_city(self, locode: str) -> CityData:
        """Return the configured city for the expected locode."""
        assert locode == "cl iqq"
        return self.city


@dataclass
class ActionClient:
    """In-memory action-pathways reference-data client."""

    result: ActionPathwaysFetchResult

    def list_actions(self) -> ActionPathwaysFetchResult:
        """Return the configured action catalogue."""
        return self.result


@dataclass
class PolicyClient:
    """In-memory action-policy-scores reference-data client."""

    result: ActionPolicyScoresFetchResult

    def get_action_policy_scores(self, locode: str) -> ActionPolicyScoresFetchResult:
        """Return the configured policy result for the expected locode."""
        assert locode == "CL IQQ"
        return self.result


@dataclass
class MitigationClient:
    """In-memory mitigation-feasibility reference-data client."""

    result: ActionMitigationFeasibilityScoresFetchResult

    def get_action_mitigation_feasibility_scores(
        self,
        locode: str,
        country_code: str,
    ) -> ActionMitigationFeasibilityScoresFetchResult:
        """Return the configured result and assert normalized country scope."""
        assert (locode, country_code) == ("CL IQQ", "CL")
        return self.result


@dataclass
class FinanceClient:
    """In-memory finance reference-data client for all three finance routes."""

    scores: ActionFinancialFeasibilityScoresFetchResult
    opportunities: ClimateFinanceOpportunitiesFetchResult
    projects: ClimateFinanceProjectsFetchResult

    def get_action_financial_feasibility_scores(
        self,
        locode: str,
        country_code: str,
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Return finance scores and assert normalized caller scope."""
        assert (locode, country_code) == ("CL IQQ", "CL")
        return self.scores

    def get_report_finance_opportunities(
        self,
        *,
        country_code: str,
        sector: str | None,
        route: str | None = None,
    ) -> ClimateFinanceOpportunitiesFetchResult:
        """Return backend-selected opportunities for caller domain inputs."""
        assert (country_code, sector, route) == (
            "CL",
            "stationary_energy",
            "technical_assistance",
        )
        return self.opportunities

    def get_report_finance_projects(
        self,
        *,
        action_id: str,
        country_code: str,
    ) -> ClimateFinanceProjectsFetchResult:
        """Return backend-limited projects for caller domain inputs."""
        assert (country_code, action_id) == ("CL", "c40_0012")
        return self.projects


def _finance_client() -> FinanceClient:
    """Build a complete finance client shared by route tests."""
    return FinanceClient(
        scores=ActionFinancialFeasibilityScoresFetchResult(
            scores_by_action_id={
                "c40_0002": ActionFinancialFeasibilityScoreRecord(
                    action_id="c40_0002",
                    action_name="Lower score",
                    financial_feasibility=0.4,
                    inputs={"diagnostic": True},
                    links={"raw": "https://upstream.example.test"},
                ),
                "c40_0012": ActionFinancialFeasibilityScoreRecord(
                    action_id="c40_0012",
                    action_name="Municipal retrofit",
                    sector="stationary_energy",
                    financial_feasibility=0.66,
                    route="technical_assistance",
                    reason="Support is available.",
                    inputs={
                        "action": {
                            "capital_intensity": 0.8,
                            "preparation_complexity": 0.9,
                        },
                        "city": {"profile": "delivery-ready"},
                        "finance": {
                            "fund_access": "direct",
                            "n_reachable_opportunities": 17,
                        },
                        "evidence": {"n_existing_projects": 6},
                        "diagnostic": "not public",
                    },
                ),
                "c40_missing": ActionFinancialFeasibilityScoreRecord(
                    action_id="c40_missing",
                    financial_feasibility=None,
                ),
            }
        ),
        opportunities=ClimateFinanceOpportunitiesFetchResult(
            opportunities=[
                ClimateFinanceOpportunityRecord(
                    opportunity_name="Open facility",
                    funder_name="Development Bank",
                    instrument="technical_assistance",
                    status="open",
                    report_category="current",
                    source_url="https://example.test/open",
                ),
                ClimateFinanceOpportunityRecord(
                    opportunity_name="Annual call",
                    funder_name="Climate Fund",
                    instrument="grant",
                    status="closed",
                    recurrence="annual",
                    report_category="monitor",
                    source_url="https://example.test/annual",
                ),
            ]
        ),
        projects=ClimateFinanceProjectsFetchResult(
            projects=[
                ClimateFinanceProjectRecord(
                    project_name="Building retrofit programme",
                    project_name_i18n={
                        "en": "Building retrofit programme",
                        "es": "Programa de rehabilitacion de edificios",
                    },
                    sector="stationary_energy",
                    jurisdiction="Valparaiso",
                    lifecycle_stage="implementation",
                    funding_channel="public investment",
                    cost_total=71987,
                    amount_unit="CLP_thousands",
                    funding_sources=[
                        {
                            "cycle": "2025",
                            "amount": 71987,
                            "amount_unit": "CLP_thousands",
                            "funder_name": "Regional Fund",
                            "diagnostic": "not public",
                        }
                    ],
                    action_matches=[
                        {
                            "action_id": "c40_0012",
                            "confidence": "goal_aligned",
                            "diagnostic": "not public",
                        }
                    ],
                )
            ]
        ),
    )


@pytest.mark.integration
def test_city_attributes_route_returns_complete_stable_projection(
    client: TestClient,
) -> None:
    """City route maps caller scope and all indicator fields without diagnostics."""
    app.dependency_overrides[get_city_data_api_client] = lambda: CityClient(
        CityData(
            city_name="Iquique",
            locode="CL IQQ",
            country_code="CL",
            region_name="Tarapaca",
            region_code="TA",
            population_size=191468,
            area_km2=2242.1,
            population_density=85.4,
            raw={
                "unemployment_rate": {
                    "attribute_value": 8.1,
                    "attribute_units": "%",
                    "attribute_category": "economic",
                    "datasource": "diagnostic",
                }
            },
        )
    )

    response = client.get("/v1/cities/cl%20iqq/attributes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["city"] == {
        "locode": "CL IQQ",
        "city_name": "Iquique",
        "country_code": "CL",
        "region_name": "Tarapaca",
        "population_size": 191468,
        "area_km2": 2242.1,
        "population_density": 85.4,
        "indicators": [
            {
                "key": "unemployment_rate",
                "value": 8.1,
                "unit": "%",
                "category": "economic",
            }
        ],
    }
    assert payload["meta"]["api_context"]["locode"] == "CL IQQ"
    assert "source_metadata" not in payload


@pytest.mark.integration
def test_action_pathways_route_projects_repeated_languages(client: TestClient) -> None:
    """Action route returns the shared prioritizable set in requested languages."""
    app.dependency_overrides[get_action_pathways_data_api_client] = lambda: ActionClient(
        ActionPathwaysFetchResult(
            actions=[
                Action(
                    action_id="c40_0012",
                    action_name="Municipal retrofit",
                    action_type="mitigation",
                    description="Retrofit buildings.",
                    name_i18n={"en": "Municipal retrofit", "es": "Rehabilitacion"},
                    description_i18n={"en": "Retrofit buildings.", "es": "Edificios."},
                    investment_cost="medium",
                    implementation_timeline="5-10 years",
                    co_benefits={
                        "air_quality": {
                            "impact_relationship": "direct",
                            "impact_text": "Cleaner urban air",
                            "impact_numeric": 2,
                            "methodology": "source assessment",
                        }
                    },
                    emissions={
                        "sector_number": "I",
                        "subsector_number": [1],
                        "gpc_reference_number": ["I.1.1"],
                        "impact_relationship": "reduces",
                        "impact_text": "Lower building emissions",
                        "impact_numeric": -2,
                        "methodology": "source assessment",
                    },
                ),
                Action(
                    action_id="adaptation_0001",
                    action_name="Flood preparedness",
                    action_type="adaptation",
                ),
                Action(
                    action_id="missing_type_0001",
                    action_name="Unclassified source action",
                    action_type=None,
                ),
            ]
        )
    )

    response = client.get("/v1/action-pathways?language=es&language=en")

    assert response.status_code == 200
    actions = response.json()["actions"]
    assert [action["action_id"] for action in actions] == ["c40_0012"]
    action = actions[0]
    assert action["name_i18n"] == {
        "es": "Rehabilitacion",
        "en": "Municipal retrofit",
    }
    assert set(action) == {
        "action_id",
        "action_name",
        "action_type",
        "description",
        "name_i18n",
        "description_i18n",
        "investment_cost",
        "implementation_timeline",
        "co_benefits",
        "emissions",
    }
    assert action["co_benefits"]["air_quality"]["impact_text"] == (
        "Cleaner urban air"
    )
    assert action["emissions"]["gpc_reference_number"] == ["I.1.1"]
    assert response.json()["meta"]["api_context"]["missing_action_type_count"] == 1
    assert response.json()["warnings"] == [
        "1 upstream action pathway(s) were excluded because action_type was missing."
    ]


@pytest.mark.integration
def test_policy_route_returns_all_evidence_and_backend_aggregates(
    client: TestClient,
) -> None:
    """Policy route retains evidence and computes the approved scope aggregates."""
    result = ActionPolicyScoresFetchResult(
        scores_by_action_id={
            "c40_0012": ActionPolicyScoreRecord(
                action_id="c40_0012",
                policy_support_score=0.8,
                policy_support_category="strong",
                n_findings=2,
                n_docs=2,
                policy_evidence=[
                    {
                        "document_type": " PARCC ",
                        "document_name": "Regional plan",
                        "signal_relation": "commits",
                        "signal_type": "action",
                        "signal_strength": "medium",
                        "doc_relevance": "high",
                        "evidence_strength": 0.6,
                    },
                    {
                        "document_type": "Paccc",
                        "document_name": "Municipal plan",
                        "signal_relation": "funds",
                        "doc_relevance": "medium",
                        "signal_type": "funding",
                        "signal_strength": "high",
                    },
                    {
                        "document_type": "future_policy_type",
                        "document_name": "Future policy",
                        "signal_type": "governance",
                        "signal_relation": "supports",
                        "signal_strength": "high",
                        "doc_relevance": "high",
                        "evidence_strength": 0.9,
                    },
                    {
                        "document_type": None,
                        "document_name": "Unclassified policy",
                        "signal_type": "action",
                        "signal_relation": "mentions",
                        "signal_strength": "low",
                        "doc_relevance": "low",
                        "evidence_strength": 0.2,
                    },
                ],
            )
        }
    )
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: PolicyClient(result)
    )

    response = client.get("/v1/cities/CL%20IQQ/action-policy-scores")

    assert response.status_code == 200
    payload = response.json()
    assert payload["scores"][0]["policy_evidence"] == [
        {
            "document_type": " PARCC ",
            "scope": "regional",
            "document_name": "Regional plan",
            "signal_type": "action",
            "signal_relation": "commits",
            "signal_strength": "medium",
            "doc_relevance": "high",
            "evidence_strength": 0.6,
        },
        {
            "document_type": "Paccc",
            "scope": "municipal",
            "document_name": "Municipal plan",
            "signal_type": "funding",
            "signal_relation": "funds",
            "signal_strength": "high",
            "doc_relevance": "medium",
            "evidence_strength": None,
        },
        {
            "document_type": "future_policy_type",
            "scope": None,
            "document_name": "Future policy",
            "signal_type": "governance",
            "signal_relation": "supports",
            "signal_strength": "high",
            "doc_relevance": "high",
            "evidence_strength": 0.9,
        },
        {
            "document_type": None,
            "scope": None,
            "document_name": "Unclassified policy",
            "signal_type": "action",
            "signal_relation": "mentions",
            "signal_strength": "low",
            "doc_relevance": "low",
            "evidence_strength": 0.2,
        },
    ]
    assert payload["aggregates"] == {
        "national": 0.8,
        "regional": 0.6,
        "municipal": 0.7,
    }


@pytest.mark.integration
def test_mitigation_route_uses_caller_country_without_inventing_scores(
    client: TestClient,
) -> None:
    """Mitigation route normalizes country scope and returns source rows only."""
    result = ActionMitigationFeasibilityScoresFetchResult(
        scores_by_action_id={
            "c40_0012": ActionMitigationFeasibilityScoreRecord(
                action_id="c40_0012",
                locode="CL IQQ",
                action_score=0.71,
                rank_within_city=8,
                dimension_scores={"technical": 0.8},
            )
        }
    )
    app.dependency_overrides[
        get_action_mitigation_feasibility_scores_data_api_client
    ] = lambda: MitigationClient(result)

    response = client.get(
        "/v1/cities/CL%20IQQ/action-mitigation-feasibility-scores?country_code=%20cl%20"
    )

    assert response.status_code == 200
    assert response.json()["scores"] == [
        {
            "action_id": "c40_0012",
            "action_score": 0.71,
            "rank_within_city": 8,
            "dimension_scores": {"technical": 0.8},
        }
    ]


@pytest.mark.integration
def test_financial_route_keeps_canonical_rows_and_sorts_scores(client: TestClient) -> None:
    """Finance route keeps source rows, display inputs, and stable score order."""
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        _finance_client
    )

    response = client.get(
        "/v1/cities/CL%20IQQ/climate-finance/feasibility?country_code=cl"
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert [row["action_id"] for row in data] == [
        "c40_0012",
        "c40_0002",
        "c40_missing",
    ]
    assert data[-1]["financial_feasibility"] is None
    assert data[0]["inputs"] == {
        "action": {"capital_intensity": 0.8, "preparation_complexity": 0.9},
        "city": {"profile": "delivery-ready"},
        "finance": {"fund_access": "direct", "n_reachable_opportunities": 17},
        "evidence": {"n_existing_projects": 6},
    }
    assert "diagnostic" not in data[0]["inputs"]
    assert "links" not in data[0]


@pytest.mark.integration
def test_opportunities_route_returns_backend_selected_categories(
    client: TestClient,
) -> None:
    """Opportunities route exposes the canonical current and monitor selections."""
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        _finance_client
    )

    response = client.get(
        "/v1/climate-finance/opportunities"
        "?country_code=cl&sector=stationary_energy&route=technical_assistance"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["current"] == [
        {
            "opportunity_name": "Open facility",
            "funder_name": "Development Bank",
            "instrument": "technical_assistance",
            "status": "open",
            "source_url": "https://example.test/open",
        }
    ]
    assert payload["monitor"][0]["recurrence"] == "annual"
    assert payload["meta"]["total_records"] == 2


@pytest.mark.integration
def test_opportunities_route_skips_upstream_fetch_when_sector_is_missing(
    client: TestClient,
) -> None:
    """Missing sector preserves the backend empty-result warning behavior."""
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        ApiActionFinancialFeasibilityScoresDataApiClient
    )

    response = client.get("/v1/climate-finance/opportunities?country_code=CL")

    assert response.status_code == 200
    payload = response.json()
    assert payload["current"] == []
    assert payload["monitor"] == []
    assert "sector is unavailable" in payload["warnings"][0]


@pytest.mark.integration
def test_projects_route_returns_backend_limited_public_projection(
    client: TestClient,
) -> None:
    """Projects route returns the display fields from canonical source results."""
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        _finance_client
    )

    response = client.get(
        "/v1/climate-finance/projects?country_code=cl&action_id=c40_0012"
    )

    assert response.status_code == 200
    assert response.json()["projects"] == [
        {
            "project_name": "Building retrofit programme",
            "project_name_i18n": {
                "en": "Building retrofit programme",
                "es": "Programa de rehabilitacion de edificios",
            },
            "sector": "stationary_energy",
            "jurisdiction": "Valparaiso",
            "lifecycle_stage": "implementation",
            "funding_channel": "public investment",
            "cost_total": 71987.0,
            "amount_unit": "CLP_thousands",
            "funding_sources": [
                {
                    "cycle": "2025",
                    "amount": 71987.0,
                    "amount_unit": "CLP_thousands",
                    "funder_name": "Regional Fund",
                }
            ],
            "action_matches": [
                {"action_id": "c40_0012", "confidence": "goal_aligned"}
            ],
        }
    ]


@pytest.mark.integration
@pytest.mark.parametrize(
    "url",
    [
        "/v1/action-pathways?language=de",
        "/v1/action-pathways?language=",
        "/v1/climate-finance/opportunities?country_code=CL&eligible_actor=municipality",
        "/v1/climate-finance/projects?country_code=CL&action_id=c40_0012&limit=20",
    ],
)
def test_reference_data_routes_reject_unsupported_or_backend_owned_knobs(
    client: TestClient,
    url: str,
) -> None:
    """Strict query models reject unsupported languages and technical parameters."""
    response = client.get(url)

    assert response.status_code == 422


@pytest.mark.integration
def test_openapi_exposes_all_reference_routes_without_technical_knobs(
    client: TestClient,
) -> None:
    """OpenAPI contains all contracts and omits backend-owned query parameters."""
    schema = client.get("/openapi.json").json()
    expected_paths = {
        "/v1/cities/{locode}/attributes",
        "/v1/action-pathways",
        "/v1/cities/{locode}/action-policy-scores",
        "/v1/cities/{locode}/action-mitigation-feasibility-scores",
        "/v1/cities/{locode}/climate-finance/feasibility",
        "/v1/climate-finance/opportunities",
        "/v1/climate-finance/projects",
    }

    assert expected_paths.issubset(schema["paths"])
    opportunities_parameters = {
        parameter["name"]
        for parameter in schema["paths"]["/v1/climate-finance/opportunities"][
            "get"
        ]["parameters"]
    }
    projects_parameters = {
        parameter["name"]
        for parameter in schema["paths"]["/v1/climate-finance/projects"]["get"][
            "parameters"
        ]
    }
    assert opportunities_parameters == {"country_code", "sector", "route"}
    assert projects_parameters == {"country_code", "action_id"}


@pytest.mark.integration
def test_reference_data_upstream_errors_do_not_expose_source_urls(
    client: TestClient,
) -> None:
    """Public errors retain correlation data while upstream URLs remain diagnostic."""

    class FailingActionClient:
        """Action client that raises a structured upstream failure."""

        def list_actions(self) -> ActionPathwaysFetchResult:
            """Raise a failure containing a URL that must remain server-side."""
            raise UpstreamApiError(
                status_code=502,
                message="action source failed",
                upstream_status_code=500,
                url="https://secret-upstream.example.test/actions",
            )

    app.dependency_overrides[get_action_pathways_data_api_client] = FailingActionClient

    response = client.get("/v1/action-pathways")

    assert response.status_code == 502
    assert response.json()["detail"]["error"] == "action source failed"
    assert "upstream_url" not in response.json()["detail"]
