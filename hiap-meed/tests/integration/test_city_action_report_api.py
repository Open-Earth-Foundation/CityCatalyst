"""Integration tests for the `/v1/reports/output-plan` endpoint."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.prioritizer import api as prioritizer_api
from app.modules.prioritizer.api import (
    get_action_financial_feasibility_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_action_policy_scores_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
)
from app.modules.prioritizer.services.report_translation import (
    ReportTranslationProviderError,
    ReportTranslationValidationError,
)
from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionFinancialFeasibilityScoresFetchResult,
    ActionMitigationFeasibilityScoresFetchResult,
    ActionPathwaysFetchResult,
    ActionPolicyScoreRecord,
    ActionPolicyScoresFetchResult,
    CityData,
    ClimateFinanceOpportunitiesFetchResult,
    ClimateFinanceOpportunityRecord,
    ClimateFinanceProjectRecord,
    ClimateFinanceProjectsFetchResult,
    LegalAssessmentRecord,
)
from app.modules.prioritizer.report_models import (
    ReportChapterInput,
    ReportGenerationResult,
)


@dataclass
class MockCityDataApiClient:
    """In-memory city client for output-plan endpoint tests."""

    city: CityData

    def get_city(self, locode: str) -> CityData:
        """Return the configured city when locode matches."""
        if locode != self.city.locode:
            raise ValueError(f"Unknown locode: {locode}")
        return self.city


@dataclass
class MockActionPathwaysDataApiClient:
    """In-memory action catalog client for output-plan endpoint tests."""

    actions: list[Action]

    def list_actions(self) -> ActionPathwaysFetchResult:
        """Return configured action rows."""
        return ActionPathwaysFetchResult(actions=list(self.actions))


class MockLegalDataApiClient:
    """In-memory legal client for output-plan endpoint tests."""

    def get_action_legal_assessments(self, country_code: str) -> dict[str, object]:
        """Return localized legal enrichment for the selected report action."""
        return {
            "A_1": LegalAssessmentRecord(
                action_id="A_1",
                country_code=country_code,
                verdict_category="enabled",
                ownership_category="enabled",
                ownership_description_i18n={
                    "en": "The municipality can lead delivery.",
                    "es": "El municipio puede liderar la ejecución.",
                },
                restrictions_category="enabled",
                restrictions_description_i18n={
                    "en": "No additional authorization is required.",
                    "es": "No se requiere autorización adicional.",
                },
            )
        }


class MockPolicyScoresDataApiClient:
    """In-memory policy client for output-plan endpoint tests."""

    def get_action_policy_scores(self, locode: str) -> ActionPolicyScoresFetchResult:
        """Return no policy enrichment for sparse-but-valid source behavior."""
        del locode
        return ActionPolicyScoresFetchResult(scores_by_action_id={})


class MockMitigationFeasibilityDataApiClient:
    """In-memory mitigation feasibility client for output-plan endpoint tests."""

    def get_action_mitigation_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionMitigationFeasibilityScoresFetchResult:
        """Return no mitigation enrichment for sparse-but-valid source behavior."""
        del locode, country_code
        return ActionMitigationFeasibilityScoresFetchResult(scores_by_action_id={})


class MockFinancialFeasibilityDataApiClient:
    """In-memory financial feasibility client for output-plan endpoint tests."""

    def get_action_financial_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Return no financial enrichment for sparse-but-valid source behavior."""
        del locode, country_code
        return ActionFinancialFeasibilityScoresFetchResult(scores_by_action_id={})


def _configure_output_plan_dependency_overrides() -> None:
    """Configure deterministic source clients for output-plan endpoint tests."""
    app.dependency_overrides[get_city_data_api_client] = lambda: MockCityDataApiClient(
        city=CityData(
            city_name="Santiago",
            locode="CL-SCL",
            country_code="CL",
            region_name="Metropolitana",
            region_code="RM",
        )
    )
    app.dependency_overrides[get_action_pathways_data_api_client] = (
        lambda: MockActionPathwaysDataApiClient(
            actions=[
                Action(
                    action_id="A_1",
                    action_name="Bus electrification",
                    action_type="mitigation",
                    name_i18n={
                        "en": "Bus electrification",
                        "es": "Electrificación de autobuses",
                    },
                )
            ]
        )
    )
    app.dependency_overrides[get_legal_data_api_client] = lambda: MockLegalDataApiClient()
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: MockPolicyScoresDataApiClient()
    )
    app.dependency_overrides[get_action_mitigation_feasibility_scores_data_api_client] = (
        lambda: MockMitigationFeasibilityDataApiClient()
    )
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        lambda: MockFinancialFeasibilityDataApiClient()
    )


@pytest.mark.integration
def test_output_plan_endpoint_returns_debug_chapters_without_llm() -> None:
    """Output-plan endpoint should return one isolated report for one action."""
    _configure_output_plan_dependency_overrides()

    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/reports/output-plan",
                json=_report_request_payload(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["locode"] == "CL-SCL"
    assert body["action_id"] == "A_1"
    assert body["language"] == ["en", "es"]
    assert body["format"] == "json_chapters_markdown_i18n"
    assert body["meta"]["requestId"] == "report-req-1"
    assert body["meta"]["totalRecords"] == 1
    assert len(body["chapters"]) == 8
    assert body["chapters"][0]["title"] == {"en": "Snapshot", "es": "Resumen"}
    for chapter in body["chapters"]:
        assert set(chapter["title"]) == {"en", "es"}
        assert set(chapter["markdown"]) == {"en", "es"}
        assert set(chapter["limitations"]) == {"en", "es"}
    assert body["metadata"]["source_context"]["ranking_basis"] == (
        "frontend_prioritization_snapshot"
    )


@pytest.mark.integration
@pytest.mark.parametrize(
    ("translation_error", "error_code", "retryable", "retry_after"),
    [
        (
            ReportTranslationValidationError("invalid translated chapter"),
            "report_translation_validation_failed",
            False,
            None,
        ),
        (
            ReportTranslationProviderError(
                "Report translation provider is temporarily unavailable"
            ),
            "report_translation_provider_unavailable",
            True,
            "5",
        ),
    ],
)
def test_output_plan_translation_failures_expose_safe_retry_contract(
    monkeypatch: pytest.MonkeyPatch,
    translation_error: Exception,
    error_code: str,
    retryable: bool,
    retry_after: str | None,
) -> None:
    """Only transient provider failures should advise frontend retries."""
    _configure_output_plan_dependency_overrides()
    generate_chapters = prioritizer_api.generate_output_plan_chapters

    def generate_without_llm(
        *, chapter_inputs: list[ReportChapterInput], use_llm: bool
    ) -> ReportGenerationResult:
        """Build deterministic English chapters while exercising production flow."""
        del use_llm
        return generate_chapters(chapter_inputs=chapter_inputs, use_llm=False)

    def fail_translation(**kwargs: object) -> None:
        """Raise the configured translation failure after English generation."""
        del kwargs
        raise translation_error

    monkeypatch.setattr(
        prioritizer_api,
        "generate_output_plan_chapters",
        generate_without_llm,
    )
    monkeypatch.setattr(prioritizer_api, "translate_output_plan", fail_translation)
    payload = _report_request_payload()
    payload["requestData"]["debugContextOnly"] = False  # type: ignore[index]

    try:
        with TestClient(app) as test_client:
            response = test_client.post("/v1/reports/output-plan", json=payload)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json()["detail"]["error_code"] == error_code
    assert response.json()["detail"]["retryable"] is retryable
    assert response.headers.get("Retry-After") == retry_after


@pytest.mark.integration
def test_output_plan_endpoint_rejects_action_not_in_snapshot() -> None:
    """Output-plan endpoint should reject actions outside the supplied ranking."""
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/reports/output-plan",
            json=_report_request_payload(action_id="A_missing"),
        )

    assert response.status_code == 422
    assert "actionId" in response.json()["detail"]["error"]


@pytest.mark.integration
def test_output_plan_endpoint_rejects_scalar_language() -> None:
    """The breaking multilingual contract should reject a scalar language value."""
    payload = _report_request_payload()
    payload["requestData"]["language"] = "en"  # type: ignore[index]

    with TestClient(app) as test_client:
        response = test_client.post("/v1/reports/output-plan", json=payload)

    assert response.status_code == 422


_ICARE_0016_JUSTIFICATION = (
    "Law 18.695 art. 5° authorizes the municipality to install these technologies "
    "in its own buildings—direct and full competence. For private stock, the "
    "municipality acts as facilitator of access to Ministry of Energy subsidies, "
    "without regulatory power over appliances."
)


class MixedScopeLegalDataApiClient:
    """Legal client returning the icare_0016 municipal-versus-private pattern."""

    def get_action_legal_assessments(
        self, country_code: str
    ) -> dict[str, LegalAssessmentRecord]:
        """Return the mixed-scope Chile assessment for the selected action."""
        del country_code
        return {
            "icare_0016": LegalAssessmentRecord(
                action_id="icare_0016",
                country_code="CL",
                verdict_category="enabled",
                ownership_category="enabled",
                restrictions_category="enabled",
                ownership_description=(
                    "Municipality has explicit legal authority to act directly."
                ),
                legal_justification=_ICARE_0016_JUSTIFICATION,
            )
        }


class MixedScopePolicyScoresDataApiClient:
    """Policy client with one complete excerpt and one incomplete fragment."""

    def get_action_policy_scores(self, locode: str) -> ActionPolicyScoresFetchResult:
        """Return mixed policy evidence for icare_0016."""
        del locode
        return ActionPolicyScoresFetchResult(
            scores_by_action_id={
                "icare_0016": ActionPolicyScoreRecord(
                    action_id="icare_0016",
                    policy_support_score=0.8,
                    policy_support_category="high",
                    n_findings=2,
                    n_docs=2,
                    policy_evidence=[
                        {
                            "evidence_rank": 1,
                            "document_name": "Plan de Mitigacion Sector Ciudades",
                            "signal_type": "action",
                            "signal_relation": "commits",
                            "explicitness": "explicit",
                            "evidence_strength": 0.9,
                            "evidence_text": (
                                "Promote solar thermal systems in public buildings."
                            ),
                            "page": 12,
                        },
                        {
                            "evidence_rank": 2,
                            "document_name": "Unquoted fragment",
                            "signal_relation": "governs",
                            "evidence_text": " ",
                        },
                    ],
                )
            }
        )


class MixedScopeFinancialFeasibilityDataApiClient:
    """Finance client returning contextual catalogue rows and matched projects."""

    def get_action_financial_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Return the selected-action finance route."""
        del locode, country_code
        return ActionFinancialFeasibilityScoresFetchResult(
            scores_by_action_id={
                "icare_0016": ActionFinancialFeasibilityScoreRecord(
                    action_id="icare_0016",
                    sector="stationary_energy",
                    route="own-budget feasible",
                    reason="Within the city's own budget and capacity.",
                    inputs={"evidence": {"n_existing_projects": 1}},
                )
            }
        )

    def get_report_finance_opportunities(
        self,
        *,
        country_code: str,
        sector: str | None,
        route: str | None = None,
    ) -> ClimateFinanceOpportunitiesFetchResult:
        """Return one sector/route catalogue candidate."""
        del country_code, sector, route
        return ClimateFinanceOpportunitiesFetchResult(
            opportunities=[
                ClimateFinanceOpportunityRecord(
                    opportunity_name="Sector energy programme",
                    funder_name="Energy Agency",
                    instrument="grant",
                    status="open",
                    source_url="https://agency.example/programme",
                )
            ]
        )

    def get_report_finance_projects(
        self,
        *,
        action_id: str,
        country_code: str,
    ) -> ClimateFinanceProjectsFetchResult:
        """Return one action-matched comparable project."""
        del country_code
        return ClimateFinanceProjectsFetchResult(
            projects=[
                ClimateFinanceProjectRecord(
                    project_name="Municipal solar water heating",
                    jurisdiction="Antofagasta",
                    lifecycle_stage="in-execution",
                    action_matches=[
                        {"action_id": action_id, "confidence": "goal_aligned"}
                    ],
                )
            ]
        )


def _configure_iqq_icare_output_plan_overrides() -> None:
    """Configure the CL IQQ / icare_0016 mixed-scope report sources."""
    app.dependency_overrides[get_city_data_api_client] = lambda: MockCityDataApiClient(
        city=CityData(
            city_name="Iquique",
            locode="CL IQQ",
            country_code="CL",
            region_name="Tarapaca",
            region_code="TA",
        )
    )
    app.dependency_overrides[get_action_pathways_data_api_client] = (
        lambda: MockActionPathwaysDataApiClient(
            actions=[
                Action(
                    action_id="icare_0016",
                    action_name=(
                        "Promote solar thermal and heat pump systems for water heating"
                    ),
                    action_type="mitigation",
                )
            ]
        )
    )
    app.dependency_overrides[get_legal_data_api_client] = (
        lambda: MixedScopeLegalDataApiClient()
    )
    app.dependency_overrides[get_action_policy_scores_data_api_client] = (
        lambda: MixedScopePolicyScoresDataApiClient()
    )
    app.dependency_overrides[
        get_action_mitigation_feasibility_scores_data_api_client
    ] = lambda: MockMitigationFeasibilityDataApiClient()
    app.dependency_overrides[get_action_financial_feasibility_scores_data_api_client] = (
        lambda: MixedScopeFinancialFeasibilityDataApiClient()
    )


@pytest.mark.integration
def test_output_plan_cl_iqq_icare_0016_keeps_legal_and_finance_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """CL IQQ / icare_0016 chapter inputs must stay consistent across chapters."""
    _configure_iqq_icare_output_plan_overrides()
    captured: dict[str, list[ReportChapterInput]] = {}
    original_build = prioritizer_api.build_chapter_inputs

    def capture_chapter_inputs(context: object) -> list[ReportChapterInput]:
        """Capture generated chapter inputs while preserving production behavior."""
        chapters = original_build(context)
        captured[getattr(context, "language")] = chapters
        return chapters

    monkeypatch.setattr(
        prioritizer_api, "build_chapter_inputs", capture_chapter_inputs
    )

    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/v1/reports/output-plan",
                json=_iqq_icare_report_payload(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["locode"] == "CL IQQ"
    assert body["action_id"] == "icare_0016"
    english_chapters = {chapter.key: chapter for chapter in captured["en"]}
    snapshot = english_chapters["snapshot"]
    legal = english_chapters["legal_mandate_delivery"]
    finance = english_chapters["financing_precedents_pathway"]
    policy = english_chapters["policy_backing"]

    assert "municipal assets" in snapshot.facts["ask"]["legal_position"]
    assert "private or external assets" in snapshot.facts["ask"]["legal_position"]
    assert legal.facts["legal"]["authority_scope"] == "municipal_assets_only"
    assert finance.facts["legal"]["authority_scope"] == "municipal_assets_only"
    assert "municipal assets" in finance.facts["legal"]["delivery_position"]
    assert finance.facts["opportunities"][0]["match_class"] == "contextual"
    assert finance.facts["comparable_projects"][0]["match_confidence"] == (
        "goal_aligned"
    )
    assert [
        row["evidence_rank"]
        for row in policy.facts["policy_score"]["policy_evidence"]
    ] == [1]
    snapshot_body = next(
        chapter for chapter in body["chapters"] if chapter["key"] == "snapshot"
    )
    finance_body = next(
        chapter
        for chapter in body["chapters"]
        if chapter["key"] == "financing_precedents_pathway"
    )
    assert "municipal assets" in snapshot_body["markdown"]["en"]
    assert "legally empowered to lead directly" not in snapshot_body["markdown"]["en"]
    assert "contextual" in finance_body["markdown"]["en"]
    assert "legal" in snapshot_body["source_refs"]
    assert "policy_scores" in snapshot_body["source_refs"]
    assert "finance_catalogues" in finance_body["source_refs"]


def _iqq_icare_report_payload() -> dict[str, object]:
    """Build the CL IQQ / icare_0016 output-plan request payload."""
    return _report_request_payload(action_id="icare_0016", locode="CL IQQ")


def _report_request_payload(
    *, action_id: str = "A_1", locode: str = "CL-SCL"
) -> dict[str, object]:
    """Build one valid output-plan request payload for integration tests."""
    snapshot_action_id = "A_1" if action_id == "A_missing" else action_id
    return {
        "meta": {
            "requestId": "report-req-1",
            "generatedAtUtc": "2026-07-14T00:00:00Z",
            "backendConsumer": "hiap-meed",
            "upstreamProvider": "city_catalyst_frontend",
            "apiContext": {"endpoint": "POST /v1/reports/output-plan"},
            "totalRecords": 1,
        },
        "requestData": {
            "locode": locode,
            "actionId": action_id,
            "language": ["en", "es"],
            "debugContextOnly": True,
            "prioritizationSnapshot": {
                "request": {
                    "meta": {
                        "requestId": "prioritize-req-1",
                    },
                    "requestData": {
                        "requestedLanguages": ["en"],
                        "topN": 1,
                        "createExplanations": True,
                        "cityDataList": [
                            {
                                "locode": locode,
                                "countryCode": "CL",
                                "cityEmissionsData": {"gpcData": {}},
                            }
                        ],
                    },
                },
                "response": {
                    "results": [
                        {
                            "locode": locode,
                            "ranked_action_ids": [snapshot_action_id],
                            "ranked_actions": [_ranked_action_payload(snapshot_action_id)],
                            "removed_actions": [],
                            "metadata": {
                                "locode": locode,
                                "internal_request_id": "internal-1",
                                "frontend_request_id": "prioritize-req-1",
                                "counts": {
                                    "total_actions": 1,
                                    "valid_actions": 1,
                                    "discarded_excluded": 0,
                                    "discarded_legal": 0,
                                    "ranked_actions": 1,
                                },
                                "weights": {
                                    "impact": 0.34,
                                    "alignment": 0.33,
                                    "feasibility": 0.33,
                                },
                                "timings": {},
                                "explanations": {
                                    "requested": True,
                                    "generated": 1,
                                    "requested_languages": ["en"],
                                    "canonical_language": "en",
                                    "generated_languages": ["en"],
                                    "translation_warnings": [],
                                },
                                "hard_filter_evidence_by_action_id": {},
                            },
                            "warnings": [],
                        }
                    ]
                },
            },
        },
    }


def _ranked_action_payload(action_id: str) -> dict[str, object]:
    """Build one ranked action snapshot for integration tests."""
    return {
        "action_id": action_id,
        "rank": 1,
        "final_score": 0.8,
        "impact_score": 0.9,
        "alignment_score": 0.7,
        "feasibility_score": 0.6,
        "evidence_summary": {
            "impact": {
                "impact_block_score": 0.9,
                "matched_city_subsector_keys_count": 1,
                "emissions_reduction_component_score": 0.8,
                "timeline_component_score": 0.6,
            },
            "alignment": {
                "alignment_score": 0.7,
                "policy_component_score": 0.8,
                "sector_component_score": 0.6,
                "co_benefit_component_score": 0.5,
                "timeframe_component_score": 0.4,
            },
            "feasibility": {
                "feasibility_score": 0.6,
                "legal": {
                    "assessment_present": True,
                    "assessment_missing": False,
                    "verdict_category": "conditional",
                    "component_score": 0.7,
                },
                "mitigation_feasibility": {
                    "component_score": 0.6,
                    "score_present": True,
                    "score_missing": False,
                },
                "financial_feasibility": {
                    "component_score": 0.5,
                    "score_present": True,
                    "score_missing": False,
                    "route": "grant",
                    "reason": "Eligible for external funding.",
                },
            },
        },
        "explanations": {"en": "Strong local fit."},
    }
