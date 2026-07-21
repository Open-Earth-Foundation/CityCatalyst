"""Unit tests for data source selection and mock loading."""

from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import httpx
import pytest
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError
from pydantic import ValidationError

from app.modules.prioritizer.scoring_config import is_activity_data_level_mapping_enabled
from app.modules.prioritizer.models import (
    ActionLegalAssessmentS3CsvRow,
    ActionPathwayApiItem,
    ActionPolicyScoreApiItem,
    PrioritizerApiRequest,
)
from app.services.action_policy_scores_api import (
    ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
    ActionPolicyScoresApiService,
    DEFAULT_ACTION_POLICY_SCORES_BASE_URL,
)
from app.services.action_financial_feasibility_scores_api import (
    ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
    ActionFinancialFeasibilityScoresApiService,
    DEFAULT_ACTION_FINANCIAL_FEASIBILITY_SCORES_BASE_URL,
)
from app.services.action_pathways_api import (
    ACTION_PATHWAYS_ENDPOINT,
    ActionPathwaysApiService,
)
from app.services.city_attributes_api import (
    DEFAULT_CITY_ATTRIBUTES_BASE_URL,
    CityAttributesApiService,
)
from app.services.action_legal_assessments_api import (
    ActionLegalAssessmentsApiService,
    DEFAULT_LEGAL_ASSESSMENTS_BASE_URL,
)
from app.services.action_legal_assessments_s3 import (
    ActionLegalAssessmentsS3Service,
    DEFAULT_LEGAL_S3_BUCKET,
    DEFAULT_LEGAL_S3_KEY,
    LEGAL_ASSESSMENTS_S3_ENDPOINT,
    _map_s3_csv_row_to_legal_assessment_record,
    get_legal_s3_bucket,
    get_legal_s3_key,
)
from app.services.http_client import (
    UpstreamApiError,
    get_json_list_with_retries,
    get_json_with_retries,
)
from app.services.data_clients import (
    ApiActionFinancialFeasibilityScoresDataApiClient,
    ApiActionPathwaysDataApiClient,
    ApiActionPolicyScoresDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    MockActionFinancialFeasibilityScoresDataApiClient,
    MockActionPolicyScoresDataApiClient,
    MockActionPathwaysDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    S3LegalDataApiClient,
    get_action_financial_feasibility_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
    get_action_policy_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
)


@pytest.mark.unit
def test_mock_action_client_loads_actions_from_file() -> None:
    """Mock action client reads and maps actions from the checked-in mock payload."""
    mock_file_path = (
        Path(__file__).resolve().parents[2] / "data" / "mock" / "action_pathways_api_mock.json"
    )
    client = MockActionPathwaysDataApiClient(mock_file_path=mock_file_path)

    fetch_result = client.list_actions()
    actions = fetch_result.actions

    assert len(actions) > 0
    assert actions[0].action_id
    assert actions[0].action_name
    assert isinstance(actions[0].emissions, dict)
    assert isinstance(actions[0].emissions.get("subsector_number"), list)
    assert isinstance(actions[0].co_benefits, dict)


@pytest.mark.unit
def test_mock_action_client_returns_full_catalog_without_action_type_filter(
    tmp_path: Path,
) -> None:
    """Mock action client returns non-mitigation rows; filtering happens later."""
    mock_file_path = tmp_path / "action_pathways_api_mock.json"
    mock_file_path.write_text(
        """
        {
          "meta": {
            "generatedAtUtc": "2026-05-21T00:00:00+00:00",
            "apiContext": {"endpoint": "GET /api/v1/action-pathways"},
            "totalRecords": 2
          },
          "actions": [
            {
              "actionId": "mitigation_1",
              "actionType": "mitigation",
              "actionName": "Mitigation action",
              "coBenefits": {},
              "emissions": {
                "sectorNumber": "I",
                "subsectorNumber": [1],
                "gpcReferenceNumber": ["I.1.1"],
                "impactText": "high"
              }
            },
            {
              "actionId": "adaptation_1",
              "actionType": "adaptation",
              "actionName": "Adaptation action",
              "coBenefits": {},
              "emissions": {
                "sectorNumber": "I",
                "subsectorNumber": [1],
                "gpcReferenceNumber": ["I.1.1"],
                "impactText": "high"
              }
            }
          ]
        }
        """.strip(),
        encoding="utf-8",
    )
    client = MockActionPathwaysDataApiClient(mock_file_path=mock_file_path)

    fetch_result = client.list_actions()
    actions = fetch_result.actions

    assert [action.action_id for action in actions] == ["mitigation_1", "adaptation_1"]
    assert [action.action_type for action in actions] == ["mitigation", "adaptation"]


@pytest.mark.unit
def test_mock_action_client_records_fetch_metadata(tmp_path: Path) -> None:
    """Mock action client exposes generated-at metadata for fetch artifacts."""
    mock_file_path = tmp_path / "action_pathways_api_mock.json"
    mock_file_path.write_text(
        """
        {
          "meta": {
            "generatedAtUtc": "2026-05-21T00:00:00+00:00",
            "apiContext": {"endpoint": "GET /api/v1/action-pathways"},
            "totalRecords": 1
          },
          "actions": [
            {
              "actionId": "mitigation_1",
              "actionType": "mitigation",
              "actionName": "Mitigation action",
              "coBenefits": {},
              "emissions": {
                "sectorNumber": "I",
                "subsectorNumber": [1],
                "gpcReferenceNumber": ["I.1.1"],
                "impactText": "high"
              }
            }
          ]
        }
        """.strip(),
        encoding="utf-8",
    )
    client = MockActionPathwaysDataApiClient(mock_file_path=mock_file_path)

    fetch_result = client.list_actions()

    assert fetch_result.source_metadata["mock_file_path"].endswith(
        "action_pathways_api_mock.json"
    )
    assert fetch_result.source_metadata["upstream_endpoint"] == ACTION_PATHWAYS_ENDPOINT
    assert fetch_result.source_metadata["upstream_generated_at_utc"] == (
        "2026-05-21T00:00:00+00:00"
    )


@pytest.mark.unit
def test_get_action_pathways_data_client_rejects_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action dependency provider rejects invalid source values."""
    monkeypatch.setenv("HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE", "unexpected")

    with pytest.raises(ValueError, match="HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE"):
        get_action_pathways_data_api_client()


@pytest.mark.unit
def test_action_pathways_service_uses_default_base_url_when_env_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action pathways service falls back to the documented default host."""
    monkeypatch.delenv("CCGLOBAL_API_BASE_URL", raising=False)

    service = ActionPathwaysApiService()

    assert service.base_url == "https://ccglobal.openearth.dev"


@pytest.mark.unit
def test_action_pathways_service_uses_env_base_url_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action pathways service honors the configured upstream host override."""
    monkeypatch.setenv(
        "CCGLOBAL_API_BASE_URL",
        "https://pathways.example.test/root/ ",
    )

    service = ActionPathwaysApiService()

    assert service.base_url == "https://pathways.example.test/root/"
    assert (
        service._build_action_pathways_url()
        == "https://pathways.example.test/root/api/v1/action-pathways"
    )


@pytest.mark.unit
def test_api_action_pathways_client_maps_remote_payload_and_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API action client exposes fetch metadata from the live-shaped payload."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generatedAtUtc": "2026-05-21T14:07:38.144930+00:00",
                    "backendConsumer": "unspecified",
                    "upstreamProvider": "global-api",
                    "apiContext": {"endpoint": ACTION_PATHWAYS_ENDPOINT},
                    "totalRecords": 1,
                },
                "actions": [
                    {
                        "actionId": "icare_0001",
                        "actionType": "mitigation",
                        "actionName": "Improve heat and energy recovery",
                        "coBenefits": {},
                        "emissions": {
                            "sectorNumber": "IV",
                            "subsectorNumber": [1],
                            "gpcReferenceNumber": ["IV.1"],
                            "impactText": "low",
                            "impactNumeric": 2,
                        },
                    }
                ],
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiActionPathwaysDataApiClient()

    fetch_result = client.list_actions()
    actions = fetch_result.actions

    assert actions[0].action_id == "icare_0001"
    assert fetch_result.source_metadata["upstream_endpoint"] == ACTION_PATHWAYS_ENDPOINT
    assert fetch_result.source_metadata["http_status_code"] == 200
    assert fetch_result.source_metadata["upstream_generated_at_utc"] == (
        "2026-05-21T14:07:38.144930+00:00"
    )
    assert fetch_result.source_metadata["upstream_url"].endswith(
        "/api/v1/action-pathways"
    )


@pytest.mark.unit
def test_mock_city_client_loads_city_from_file() -> None:
    """Mock city client returns expected city metadata for known locode."""
    mock_file_path = (
        Path(__file__).resolve().parents[2] / "data" / "mock" / "city_api_mock.json"
    )
    client = MockCityDataApiClient(mock_file_path=mock_file_path)

    city = client.get_city("CL IQQ")

    assert city.city_name == "Iquique"
    assert city.region_name == "Tarapaca"
    assert city.source_metadata["mock_file_path"].endswith("city_api_mock.json")
    assert city.source_metadata["requested_locode"] == "CL IQQ"
    assert city.source_metadata["requested_version_label"] is None
    assert city.source_metadata["upstream_api_context"]["endpoint"] == (
        "GET /api/v0/city_attributes/{locode}"
    )
    assert city.source_metadata["upstream_datasources"]


@pytest.mark.unit
def test_mock_legal_client_loads_flat_assessments_from_file() -> None:
    """Mock legal client filters flat legal rows by country and maps by action ID."""
    mock_file_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "mock"
        / "actions_legal_api_mock.json"
    )
    client = MockLegalDataApiClient(mock_file_path=mock_file_path)

    assessments = client.get_action_legal_assessments("CL")

    assert len(assessments) > 0
    assert assessments["c40_0010"].verdict_category == "conditional"
    assert assessments["c40_0010"].verdict_score == pytest.approx(0.5)
    assert assessments["c40_0010"].source_metadata["requested_country_code"] == "CL"


@pytest.mark.unit
def test_mock_action_policy_scores_client_loads_scores_from_file() -> None:
    """Mock policy score client reads and maps live-shaped score payloads."""
    mock_file_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "mock"
        / "action_policy_scores_api_mock.json"
    )
    client = MockActionPolicyScoresDataApiClient(mock_file_path=mock_file_path)

    fetch_result = client.get_action_policy_scores("CL IQQ")
    scores = fetch_result.scores_by_action_id

    assert scores["c40_0010"].policy_support_score == pytest.approx(0.82)
    assert scores["c40_0010"].policy_support_category == "strong"
    assert scores["c40_0010"].best_relevance == "high"
    assert scores["c40_0010"].n_findings == 8
    assert scores["c40_0010"].n_docs == 3
    assert scores["c40_0010"].policy_evidence
    assert scores["c40_0010"].source_metadata["requested_locode"] == "CL IQQ"


@pytest.mark.unit
def test_get_city_data_client_defaults_to_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """City dependency provider defaults to API data source."""
    monkeypatch.delenv("HIAP_MEED_CITY_DATA_SOURCE", raising=False)

    client = get_city_data_api_client()

    assert isinstance(client, ApiCityDataApiClient)


@pytest.mark.unit
def test_get_city_data_client_rejects_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """City dependency provider rejects invalid source values."""
    monkeypatch.setenv("HIAP_MEED_CITY_DATA_SOURCE", "apii")

    with pytest.raises(ValueError, match="HIAP_MEED_CITY_DATA_SOURCE"):
        get_city_data_api_client()


@pytest.mark.unit
def test_get_legal_data_client_defaults_to_s3(monkeypatch: pytest.MonkeyPatch) -> None:
    """Legal dependency provider defaults to the S3 data source."""
    monkeypatch.delenv("HIAP_MEED_LEGAL_DATA_SOURCE", raising=False)

    client = get_legal_data_api_client()

    assert isinstance(client, S3LegalDataApiClient)


@pytest.mark.unit
def test_get_legal_data_client_rejects_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legal dependency provider rejects values outside api, mock, or s3."""
    monkeypatch.setenv("HIAP_MEED_LEGAL_DATA_SOURCE", "apii")

    with pytest.raises(ValueError, match="HIAP_MEED_LEGAL_DATA_SOURCE"):
        get_legal_data_api_client()


@pytest.mark.unit
def test_city_attributes_service_uses_default_base_url_when_env_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """City attributes service falls back to the documented default host."""
    monkeypatch.delenv("CCGLOBAL_API_BASE_URL", raising=False)

    service = CityAttributesApiService()

    assert service.base_url == DEFAULT_CITY_ATTRIBUTES_BASE_URL


@pytest.mark.unit
def test_city_attributes_service_uses_env_base_url_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """City attributes service honors the configured upstream host override."""
    monkeypatch.setenv(
        "CCGLOBAL_API_BASE_URL",
        "https://city-attributes.example.test/root/ ",
    )

    service = CityAttributesApiService()

    assert service.base_url == "https://city-attributes.example.test/root/"
    assert (
        service._build_city_url("CL IQQ")
        == "https://city-attributes.example.test/root/api/v0/city_attributes/CL%20IQQ"
    )
    assert (
        service._build_city_url("CL IQQ", "2024")
        == "https://city-attributes.example.test/root/api/v0/city_attributes/CL%20IQQ?version_label=2024"
    )


@pytest.mark.unit
def test_legal_assessments_service_uses_default_base_url_when_env_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legal assessments service falls back to the documented default host."""
    monkeypatch.delenv("CCGLOBAL_API_BASE_URL", raising=False)

    service = ActionLegalAssessmentsApiService()

    assert service.base_url == DEFAULT_LEGAL_ASSESSMENTS_BASE_URL


@pytest.mark.unit
def test_legal_assessments_service_uses_env_base_url_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legal assessments service honors the configured upstream host override."""
    monkeypatch.setenv(
        "CCGLOBAL_API_BASE_URL",
        "https://legal.example.test/root/ ",
    )

    service = ActionLegalAssessmentsApiService()

    assert service.base_url == "https://legal.example.test/root/"
    assert (
        service._build_legal_assessments_url("CL")
        == "https://legal.example.test/root/api/v1/action-legal-assessments?countryCode=CL"
    )


@pytest.mark.unit
def test_legal_s3_config_uses_documented_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legal S3 config falls back to the documented bucket and object key."""
    monkeypatch.delenv("HIAP_MEED_LEGAL_S3_BUCKET", raising=False)
    monkeypatch.delenv("HIAP_MEED_LEGAL_S3_KEY", raising=False)

    assert get_legal_s3_bucket() == DEFAULT_LEGAL_S3_BUCKET
    assert get_legal_s3_key() == DEFAULT_LEGAL_S3_KEY


@pytest.mark.unit
def test_action_policy_scores_service_uses_default_base_url_when_env_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action policy scores service falls back to the documented default host."""
    monkeypatch.delenv("CCGLOBAL_API_BASE_URL", raising=False)

    service = ActionPolicyScoresApiService()

    assert service.base_url == DEFAULT_ACTION_POLICY_SCORES_BASE_URL


@pytest.mark.unit
def test_action_policy_scores_service_uses_env_base_url_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action policy scores service honors the configured upstream host override."""
    monkeypatch.setenv(
        "CCGLOBAL_API_BASE_URL",
        "https://policy.example.test/root/ ",
    )

    service = ActionPolicyScoresApiService()

    assert service.base_url == "https://policy.example.test/root/"
    assert service._build_action_policy_scores_url("CL ARI") == (
        "https://policy.example.test/root/api/v1/cities/"
        "CL%20ARI/action-policy-scores"
    )


@pytest.mark.unit
def test_api_city_client_maps_remote_payload_and_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API city client maps remote payload fields and exposes fetch metadata."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-05-13T09:39:51.706285+00:00",
                    "api_context": {
                        "endpoint": "GET /api/v0/city_attributes/{locode}",
                        "locode": "CL IQQ",
                        "version_label": None,
                    },
                    "datasources": [],
                },
                "city": {
                    "locode": "CL IQQ",
                    "city_name": "Iquique",
                    "country_code": "CL",
                    "region_code": "CL01",
                    "region_name": "Tarapaca",
                    "area_km2": 2646,
                    "populationSize": 214857,
                    "populationDensity": 953.69,
                    "population": {
                        "attribute_value": 214857,
                        "attribute_units": "persons",
                        "attribute_category": "very high",
                        "datasource": "cl-ine-censo",
                        "version_label": "2024",
                    },
                    "unemployment_rate": {
                        "attribute_value": 9.44,
                        "attribute_units": "percent",
                        "attribute_category": "high",
                        "datasource": "cl-ine-censo",
                        "version_label": "2024",
                    },
                },
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiCityDataApiClient()

    city = client.get_city("CL IQQ")

    assert city.city_name == "Iquique"
    assert city.population_size == 214857
    assert city.population_density == pytest.approx(953.69)
    assert city.area_km2 == pytest.approx(2646)
    assert city.source_metadata["upstream_endpoint"] == (
        "GET /api/v0/city_attributes/{locode}"
    )
    assert city.source_metadata["http_status_code"] == 200
    assert city.source_metadata["requested_locode"] == "CL IQQ"
    assert city.source_metadata["requested_version_label"] is None
    assert city.source_metadata["upstream_generated_at_utc"] == (
        "2026-05-13T09:39:51.706285+00:00"
    )
    assert city.source_metadata["upstream_api_context"] == {
        "endpoint": "GET /api/v0/city_attributes/{locode}",
        "locode": "CL IQQ",
        "version_label": None,
    }
    assert city.source_metadata["upstream_datasources"] == []


@pytest.mark.unit
def test_api_city_client_rejects_incomplete_remote_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API city client maps invalid upstream payloads to a structured 502 error."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-05-13T09:39:51.706285+00:00",
                    "api_context": {
                        "endpoint": "GET /api/v0/city_attributes/{locode}",
                        "locode": "CL IQQ",
                        "version_label": None,
                    },
                    "datasources": [],
                },
                "city": {
                    "locode": "CL IQQ",
                    "country_code": "CL",
                    "region_code": "CL01",
                    "region_name": "Tarapaca",
                },
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiCityDataApiClient()

    with pytest.raises(UpstreamApiError) as error_info:
        client.get_city("CL IQQ")

    assert error_info.value.status_code == 502
    assert error_info.value.upstream_status_code == 200
    assert (
        error_info.value.url
        == f"{DEFAULT_CITY_ATTRIBUTES_BASE_URL.rstrip('/')}/api/v0/city_attributes/CL%20IQQ"
    )


@pytest.mark.unit
def test_api_city_client_accepts_camelcase_population_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API city client accepts the current upstream camelCase population fields."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-05-13T14:43:41.038750+00:00",
                    "api_context": {
                        "endpoint": "GET /api/v0/city_attributes/{locode}",
                        "locode": "CL ARI",
                        "version_label": None,
                    },
                    "datasources": [],
                },
                "city": {
                    "locode": "CL ARI",
                    "city_name": "Arica",
                    "country_code": "CL",
                    "region_code": "CL15",
                    "region_name": "Arica y Parinacota",
                    "area_km2": 5371,
                    "populationSize": 236109,
                    "populationDensity": 43.96,
                },
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiCityDataApiClient()

    city = client.get_city("CL ARI")

    assert city.locode == "CL ARI"
    assert city.city_name == "Arica"
    assert city.population_size == 236109
    assert city.population_density == pytest.approx(43.96)


@pytest.mark.unit
def test_s3_legal_csv_row_maps_required_fields_to_internal_record() -> None:
    """S3 CSV rows map flat fields, references, and i18n text into legal records."""
    row = ActionLegalAssessmentS3CsvRow.model_validate(
        {
            "action_id": "c40_0010",
            "action_name_en": "Retrofit buildings",
            "action_name_es": "Reacondicionar edificios",
            "sector": "stationary_energy",
            "verdict_category": "conditional",
            "verdict_score": "0.5",
            "ownership_category": "enabled",
            "ownership_score": "1.0",
            "ownership_weight": "0.67",
            "ownership_description": "Authority exists.",
            "ownership_description_es": "La autoridad existe.",
            "restrictions_category": "conditional",
            "restrictions_score": "0.5",
            "restrictions_weight": "0.33",
            "restrictions_description": "Moderate legal risk.",
            "restrictions_description_es": "Riesgo legal moderado.",
            "legal_justification": "Justificacion legal.",
            "legal_justification_en": "Legal justification.",
            "legal_reference_1": "Law 1",
            "legal_reference_2": "",
            "legal_reference_3": "Law 3",
            "analysis_date": "2026-04-30",
            "generation_method": "expert review",
            "publisher_id": "publisher-1",
        }
    )

    assessment = _map_s3_csv_row_to_legal_assessment_record(
        row=row,
        country_code="CL",
        source_metadata={"source_type": "s3_csv"},
    )

    assert assessment.action_id == "c40_0010"
    assert assessment.country_code == "CL"
    assert assessment.gpc_sector == "stationary_energy"
    assert assessment.verdict_category == "conditional"
    assert assessment.verdict_score == pytest.approx(0.5)
    assert assessment.ownership_weight == pytest.approx(0.67)
    assert assessment.restrictions_weight == pytest.approx(0.33)
    assert assessment.legal_references == ["Law 1", "Law 3"]
    assert assessment.ownership_description_i18n == {
        "en": "Authority exists.",
        "es": "La autoridad existe.",
    }
    assert assessment.restrictions_description_i18n == {
        "en": "Moderate legal risk.",
        "es": "Riesgo legal moderado.",
    }
    assert assessment.legal_justification_i18n == {
        "en": "Legal justification.",
        "es": "Justificacion legal.",
    }
    assert assessment.raw["srcActionId"] == "c40_0010"
    assert assessment.raw["countryCode"] == "CL"
    assert assessment.raw["action_name_en"] == "Retrofit buildings"
    assert assessment.source_metadata["source_type"] == "s3_csv"


@pytest.mark.unit
def test_s3_legal_service_parses_multiline_csv_and_metadata() -> None:
    """S3 legal service parses quoted multiline CSV cells and exposes metadata."""

    class FakeS3Client:
        """Minimal S3 fake returning one CSV object."""

        def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
            """Return a small S3 object shaped like boto3 get_object output."""
            assert Bucket == "legal-bucket"
            assert Key == "legal/classification.csv"
            csv_text = (
                "action_id,sector,verdict_category,verdict_score,"
                "ownership_category,ownership_score,ownership_weight,"
                "ownership_description,ownership_description_es,"
                "restrictions_category,restrictions_score,restrictions_weight,"
                "restrictions_description,restrictions_description_es,"
                "legal_justification,legal_justification_en,"
                "legal_reference_1,legal_reference_2,legal_reference_3,"
                "legal_reference_4,legal_reference_5,legal_reference_6,"
                "analysis_date,generation_method,publisher_id\n"
                'c40_0010,stationary_energy,conditional,0.5,enabled,1,0.67,'
                '"Authority exists.","La autoridad existe.",conditional,0.5,0.33,'
                '"Moderate legal risk.","Riesgo legal moderado.",'
                '"Line one\nLine two","English line one\nEnglish line two",'
                '"Law 1",,"Law 3",,,,2026-04-30,expert review,publisher-1\n'
            )
            return {
                "Body": BytesIO(csv_text.encode("utf-8")),
                "LastModified": datetime(2026, 5, 1, 12, 0, tzinfo=UTC),
                "ETag": '"etag-1"',
            }

    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=FakeS3Client(),
    )

    assessments = service.get_assessments_by_action_id("CL")

    assessment = assessments["c40_0010"]
    assert assessment.legal_justification == "Line one\nLine two"
    assert assessment.legal_justification_i18n["en"] == (
        "English line one\nEnglish line two"
    )
    assert assessment.legal_references == ["Law 1", "Law 3"]
    assert assessment.source_metadata["upstream_endpoint"] == (
        LEGAL_ASSESSMENTS_S3_ENDPOINT
    )
    assert assessment.source_metadata["upstream_url"] == (
        "s3://legal-bucket/legal/classification.csv"
    )
    assert assessment.source_metadata["s3_key_suffix"] == "classification.csv"
    assert assessment.source_metadata["upstream_generated_at_utc"] == (
        "2026-05-01T12:00:00+00:00"
    )
    assert assessment.source_metadata["etag"] == '"etag-1"'


@pytest.mark.unit
def test_s3_legal_service_rejects_duplicate_action_ids() -> None:
    """S3 legal service rejects duplicate action IDs for one country-scoped CSV."""

    class FakeS3Client:
        """Minimal S3 fake returning duplicate action rows."""

        def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
            """Return duplicate legal rows."""
            csv_text = (
                "action_id,verdict_category,verdict_score\n"
                "c40_0010,conditional,0.5\n"
                "c40_0010,enabled,1\n"
            )
            return {"Body": BytesIO(csv_text.encode("utf-8"))}

    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=FakeS3Client(),
    )

    with pytest.raises(UpstreamApiError, match="duplicate action_id"):
        service.get_assessments_by_action_id("CL")


@pytest.mark.unit
def test_s3_legal_service_reports_missing_credentials() -> None:
    """S3 legal service reports missing AWS credentials clearly."""

    class MissingCredentialsS3Client:
        """S3 fake that raises the boto3 missing-credentials error."""

        def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
            """Raise the same exception boto3 raises without credentials."""
            raise NoCredentialsError()

    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=MissingCredentialsS3Client(),
    )

    with pytest.raises(
        UpstreamApiError,
        match="S3 credentials are not configured",
    ) as error_info:
        service.get_assessments_by_action_id("CL")

    assert error_info.value.status_code == 503


@pytest.mark.unit
def test_s3_legal_service_reports_partial_credentials() -> None:
    """S3 legal service reports incomplete AWS credentials clearly."""

    class PartialCredentialsS3Client:
        """S3 fake that raises the boto3 partial-credentials error."""

        def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
            """Raise the same exception boto3 raises for incomplete credentials."""
            raise PartialCredentialsError(
                provider="env",
                cred_var="AWS_SECRET_ACCESS_KEY",
            )

    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=PartialCredentialsS3Client(),
    )

    with pytest.raises(
        UpstreamApiError,
        match="S3 credentials are incomplete",
    ):
        service.get_assessments_by_action_id("CL")


@pytest.mark.unit
def test_s3_legal_service_reports_access_denied() -> None:
    """S3 legal service reports access-denied errors without leaking secrets."""

    class AccessDeniedS3Client:
        """S3 fake that raises an AccessDenied service error."""

        def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
            """Raise an AWS ClientError for access denial."""
            raise ClientError(
                {
                    "Error": {"Code": "AccessDenied", "Message": "Access denied"},
                    "ResponseMetadata": {"HTTPStatusCode": 403},
                },
                "GetObject",
            )

    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=AccessDeniedS3Client(),
    )

    with pytest.raises(UpstreamApiError, match="S3 access was denied") as error_info:
        service.get_assessments_by_action_id("CL")

    assert error_info.value.upstream_status_code == 403


@pytest.mark.unit
def test_s3_legal_service_reports_missing_object() -> None:
    """S3 legal service reports missing bucket/key errors clearly."""

    class MissingObjectS3Client:
        """S3 fake that raises a NoSuchKey service error."""

        def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
            """Raise an AWS ClientError for a missing object."""
            raise ClientError(
                {
                    "Error": {"Code": "NoSuchKey", "Message": "Not found"},
                    "ResponseMetadata": {"HTTPStatusCode": 404},
                },
                "GetObject",
            )

    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=MissingObjectS3Client(),
    )

    with pytest.raises(UpstreamApiError, match="S3 object was not found") as error_info:
        service.get_assessments_by_action_id("CL")

    assert error_info.value.upstream_status_code == 404


@pytest.mark.unit
def test_api_legal_client_is_deprecated_before_http(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API legal client raises its deprecation error before attempting HTTP."""

    def _fail_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        raise AssertionError("deprecated legal API client should not perform HTTP")

    monkeypatch.setattr(httpx.Client, "get", _fail_get)
    client = ApiLegalDataApiClient()

    with pytest.raises(UpstreamApiError, match="internal S3 legal source"):
        client.get_action_legal_assessments("CL")


@pytest.mark.unit
def test_api_action_policy_scores_client_maps_remote_payload_and_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API policy client maps remote score rows and exposes fetch metadata."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-05-20T07:02:45.134187+00:00",
                    "backend_consumer": "hiap-meed",
                    "upstream_provider": "global-api",
                    "scoring_rubric_version": "v0.2.0",
                    "api_context": {
                        "endpoint": ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
                        "locode": "CL ARI",
                        "city_name": "Arica",
                        "release_id": "release-1",
                        "top_evidence_limit": 5,
                        "src_action_id": None,
                    },
                    "total_records": 1,
                    "total_evidence_items": 1,
                    "spatial_document_coverage": {
                        "location_scopes_included": ["national", "regional"],
                        "finest_location_scope": "regional",
                        "caveat": "Policy support scores use regional documents.",
                    },
                },
                "scores": [
                    {
                        "src_action_id": "c40_0010",
                        "policy_support_score": 0.82,
                        "policy_support_category": "strong",
                        "best_relevance": "high",
                        "n_findings": 8,
                        "n_docs": 3,
                        "sum_strength": 4.2,
                        "policy_evidence": [
                            {
                                "evidence_rank": 1,
                                "signal_type": "action",
                                "signal_relation": "commits",
                                "signal_strength": "high",
                                "document_name": "Policy document",
                                "document_type": "parcc",
                                "doc_relevance": "high",
                                "explicitness": "explicit",
                                "page": 12,
                                "evidence_strength": 0.7,
                                "evidence_text": "Evidence text.",
                            }
                        ],
                    }
                ],
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiActionPolicyScoresDataApiClient()

    fetch_result = client.get_action_policy_scores("CL ARI")
    scores = fetch_result.scores_by_action_id

    assert scores["c40_0010"].policy_support_score == pytest.approx(0.82)
    assert scores["c40_0010"].policy_evidence[0]["document_name"] == "Policy document"
    assert scores["c40_0010"].source_metadata["upstream_endpoint"] == (
        ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE
    )
    assert scores["c40_0010"].source_metadata["requested_locode"] == "CL ARI"
    assert scores["c40_0010"].source_metadata["http_status_code"] == 200


@pytest.mark.unit
def test_api_action_policy_scores_client_rejects_duplicate_action_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API policy client rejects duplicate action IDs for one city."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        row = {
            "src_action_id": "c40_0010",
            "policy_support_score": 0.82,
            "policy_support_category": "strong",
            "best_relevance": "high",
            "n_findings": 8,
            "n_docs": 3,
            "sum_strength": 4.2,
            "policy_evidence": [],
        }
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-05-20T07:02:45.134187+00:00",
                    "api_context": {
                        "endpoint": ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
                        "locode": "CL ARI",
                    },
                },
                "scores": [row, dict(row)],
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiActionPolicyScoresDataApiClient()

    with pytest.raises(UpstreamApiError, match="duplicate src_action_id"):
        client.get_action_policy_scores("CL ARI")


@pytest.mark.unit
def test_api_action_policy_scores_client_maps_404_to_empty_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API policy client treats upstream 404 as no policy scores for the city."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(404, request=request, json={"detail": "not found"})

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    monkeypatch.setenv("UPSTREAM_HTTP_MAX_RETRIES", "0")
    client = ApiActionPolicyScoresDataApiClient()

    fetch_result = client.get_action_policy_scores("CL ARI")
    scores = fetch_result.scores_by_action_id

    assert scores == {}
    assert fetch_result.source_metadata["http_status_code"] == 404
    assert fetch_result.warning is not None


@pytest.mark.unit
def test_get_json_with_retries_retries_retryable_http_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shared HTTP helper retries once for retryable upstream HTTP statuses."""
    responses = iter(
        [
            httpx.Response(
                503,
                request=httpx.Request("GET", "https://example.test/city"),
            ),
            httpx.Response(
                200,
                request=httpx.Request("GET", "https://example.test/city"),
                json={"ok": True},
            ),
        ]
    )

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        del self, url, headers
        return next(responses)

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    monkeypatch.setattr("time.sleep", lambda _: None)
    monkeypatch.setenv("UPSTREAM_HTTP_MAX_RETRIES", "1")

    payload, status_code = get_json_with_retries(
        url="https://example.test/city",
        operation_name="test upstream call",
    )

    assert payload == {"ok": True}
    assert status_code == 200


@pytest.mark.unit
def test_get_json_with_retries_maps_timeout_to_504(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shared HTTP helper maps exhausted timeouts to HTTP 504."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        del self, url, headers
        raise httpx.ReadTimeout("timed out")

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    monkeypatch.setattr("time.sleep", lambda _: None)
    monkeypatch.setenv("UPSTREAM_HTTP_MAX_RETRIES", "0")

    with pytest.raises(UpstreamApiError) as error_info:
        get_json_with_retries(
            url="https://example.test/city",
            operation_name="test upstream call",
        )

    assert error_info.value.status_code == 504


@pytest.mark.unit
def test_get_json_with_retries_maps_invalid_json_to_502(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shared HTTP helper maps invalid JSON upstream payloads to HTTP 502."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            content=b"not-json",
            headers={"content-type": "application/json"},
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    monkeypatch.setenv("UPSTREAM_HTTP_MAX_RETRIES", "0")

    with pytest.raises(UpstreamApiError) as error_info:
        get_json_with_retries(
            url="https://example.test/city",
            operation_name="test upstream call",
        )

    assert error_info.value.status_code == 502


@pytest.mark.unit
def test_get_json_list_with_retries_accepts_top_level_json_lists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shared HTTP helper accepts top-level JSON lists for list endpoints."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(200, request=request, json=[{"ok": True}])

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    monkeypatch.setenv("UPSTREAM_HTTP_MAX_RETRIES", "0")

    payload, status_code = get_json_list_with_retries(
        url="https://example.test/legal",
        operation_name="test legal list call",
    )

    assert payload == [{"ok": True}]
    assert status_code == 200


@pytest.mark.unit
def test_get_action_policy_scores_data_client_defaults_to_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action policy scores dependency provider defaults to API data source."""
    monkeypatch.delenv("HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE", raising=False)

    client = get_action_policy_scores_data_api_client()

    assert isinstance(client, ApiActionPolicyScoresDataApiClient)


@pytest.mark.unit
def test_get_action_policy_scores_data_client_rejects_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Policy dependency provider rejects invalid source values."""
    monkeypatch.setenv("HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE", "apii")

    with pytest.raises(
        ValueError,
        match="HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE",
    ):
        get_action_policy_scores_data_api_client()


@pytest.mark.unit
def test_get_action_mitigation_feasibility_scores_data_client_rejects_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mitigation feasibility dependency provider rejects invalid source values."""
    monkeypatch.setenv(
        "HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE",
        "apii",
    )

    with pytest.raises(
        ValueError,
        match="HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE",
    ):
        get_action_mitigation_feasibility_scores_data_api_client()


@pytest.mark.unit
def test_get_action_financial_feasibility_scores_data_client_defaults_to_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Financial feasibility dependency provider defaults to API data source."""
    monkeypatch.delenv(
        "HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE",
        raising=False,
    )

    client = get_action_financial_feasibility_scores_data_api_client()

    assert isinstance(client, ApiActionFinancialFeasibilityScoresDataApiClient)


@pytest.mark.unit
def test_get_action_financial_feasibility_scores_data_client_rejects_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Financial feasibility dependency provider rejects invalid source values."""
    monkeypatch.setenv(
        "HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE",
        "apii",
    )

    with pytest.raises(
        ValueError,
        match="HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE",
    ):
        get_action_financial_feasibility_scores_data_api_client()


@pytest.mark.unit
def test_action_financial_feasibility_scores_service_uses_default_base_url_when_env_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Financial feasibility service falls back to the documented default host."""
    monkeypatch.delenv("CCGLOBAL_API_BASE_URL", raising=False)

    service = ActionFinancialFeasibilityScoresApiService()

    assert service.base_url == DEFAULT_ACTION_FINANCIAL_FEASIBILITY_SCORES_BASE_URL


@pytest.mark.unit
def test_action_financial_feasibility_scores_service_uses_env_base_url_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Financial feasibility service honors the configured upstream host."""
    monkeypatch.setenv(
        "CCGLOBAL_API_BASE_URL",
        "https://finance.example.test/root/ ",
    )

    service = ActionFinancialFeasibilityScoresApiService()

    assert service.base_url == "https://finance.example.test/root/"
    assert service._build_action_financial_feasibility_scores_url("CL IQQ", "CL") == (
        "https://finance.example.test/root/api/v1/cities/"
        "CL%20IQQ/climate-finance/feasibility?country_code=CL"
    )


@pytest.mark.unit
def test_finance_client_fetches_named_report_opportunities_and_projects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Report finance enrichment should preserve names, links, and locations."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        del self
        request = httpx.Request("GET", url, headers=headers)
        if "/opportunities?" in url:
            payload = {
                "meta": {
                    "generated_at_utc": "2026-07-20T00:00:00Z",
                    "count": 1,
                    "datasources": [
                        {
                            "publisher_name": "Energy Agency",
                            "publisher_url": "https://agency.example/",
                            "dataset_name": "Energy programmes",
                        }
                    ],
                },
                "data": [
                    {
                        "opportunity_name": "Closed fund",
                        "funder_name": "Energy Agency",
                        "instrument": "grant",
                        "status": "closed",
                        "status_as_of": "2026-06-08",
                        "recurrence": "sporadic",
                        "source_url": "https://agency.example/closed",
                        "city_application": ["direct"],
                        "climate_relevance": "explicit",
                    },
                    {
                        "opportunity_name": "Open capital grant",
                        "funder_name": "Energy Agency",
                        "instrument": "grant",
                        "status": "open",
                        "source_url": "https://agency.example/grant",
                        "city_application": ["direct"],
                        "climate_relevance": "explicit",
                    },
                    {
                        "opportunity_name": "Municipal energy assistance",
                        "funder_name": "Energy Agency",
                        "instrument": "technical_assistance",
                        "status": "ongoing",
                        "source_url": "https://agency.example/programme",
                        "city_application": ["direct"],
                        "climate_relevance": "explicit",
                    }
                ],
            }
        else:
            payload = {
                "meta": {
                    "generated_at_utc": "2026-07-20T00:00:00Z",
                    "total": 1,
                    "count": 1,
                    "datasources": [
                        {
                            "publisher_name": "Project System",
                            "publisher_url": "https://projects.example/",
                            "dataset_name": "Climate projects",
                        }
                    ],
                },
                "data": [
                    {
                        "project_name": "Street lighting upgrade",
                        "jurisdiction": "Santa Cruz",
                        "lifecycle_stage": "in-execution",
                        "funding_channel": "public investment",
                    }
                ],
            }
        return httpx.Response(200, request=request, json=payload)

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    evidence = ApiActionFinancialFeasibilityScoresDataApiClient().get_report_finance_evidence(
        action_id="icare_0040",
        country_code="CL",
        sector="stationary_energy",
        route="needs technical assistance",
    )

    assert evidence.opportunities[0].opportunity_name == "Municipal energy assistance"
    assert evidence.opportunities[0].source_url == "https://agency.example/programme"
    assert len(evidence.opportunities) == 2
    assert evidence.opportunities[0].report_category == "current"
    assert evidence.opportunities[1].opportunity_name == "Closed fund"
    assert evidence.opportunities[1].report_category == "monitor"
    assert evidence.opportunities[1].status_as_of == "2026-06-08"
    assert evidence.source_metadata["opportunities"]["current_count"] == 1
    assert evidence.source_metadata["opportunities"]["monitoring_count"] == 1
    assert "not matched to the selected action" in evidence.source_metadata[
        "opportunities"
    ]["selection_scope"]
    assert "limit=50" in evidence.source_metadata["opportunities"]["upstream_url"]
    assert evidence.projects[0].project_name == "Street lighting upgrade"
    assert evidence.projects[0].jurisdiction == "Santa Cruz"
    assert evidence.source_metadata["projects"]["total"] == 1

@pytest.mark.unit
def test_mock_action_financial_feasibility_scores_client_loads_scores_from_file() -> None:
    """Mock financial feasibility client reads checked-in compact score payloads."""
    mock_file_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "mock"
        / "action_financial_feasibility_scores_api_mock.json"
    )
    client = MockActionFinancialFeasibilityScoresDataApiClient(
        mock_file_path=mock_file_path
    )

    fetch_result = client.get_action_financial_feasibility_scores("CL IQQ", "CL")
    scores = fetch_result.scores_by_action_id

    assert scores["c40_0034"].financial_feasibility == pytest.approx(1.0)
    assert scores["c40_0034"].route == "self-deliverable"
    assert scores["c40_0034"].reason == (
        "Low-capital action the city can deliver itself."
    )
    assert scores["c40_0034"].inputs["finance"]["fund_access"] == "direct"
    assert scores["c40_0034"].links["detail"].endswith(
        "/climate-finance/actions/c40_0034"
    )
    assert scores["c40_0034"].source_metadata["upstream_endpoint"] == (
        ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE
    )
    assert scores["c40_0034"].source_metadata["requested_locode"] == "CL IQQ"


@pytest.mark.unit
def test_api_action_financial_feasibility_scores_client_maps_remote_payload_and_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API financial feasibility client maps compact batch rows and metadata."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-06-26T14:37:36.830291+00:00",
                    "endpoint": ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
                    "locode": "CL IQQ",
                    "country_code": "CL",
                    "caveat": "Working estimate.",
                    "filters": {"action_id": None},
                    "total_records": 1,
                },
                "data": [
                    {
                        "action_id": "c40_0034",
                        "action_name": "Material bans",
                        "sector": "waste",
                        "financial_feasibility": 1.0,
                        "route": "self-deliverable",
                        "reason": "Low-capital action.",
                        "inputs": {
                            "action": {"capital_intensity": 0.2},
                            "city": {"profile": "Self-sufficient"},
                            "finance": {"fund_access": "direct"},
                            "evidence": {"n_existing_projects": 0},
                        },
                        "links": {
                            "detail": (
                                "/api/v1/cities/CL IQQ/climate-finance/actions/c40_0034"
                            ),
                        },
                    }
                ],
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiActionFinancialFeasibilityScoresDataApiClient()

    fetch_result = client.get_action_financial_feasibility_scores("CL IQQ", "CL")
    scores = fetch_result.scores_by_action_id

    assert scores["c40_0034"].financial_feasibility == pytest.approx(1.0)
    assert scores["c40_0034"].source_metadata["upstream_endpoint"] == (
        ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE
    )
    assert scores["c40_0034"].source_metadata["requested_locode"] == "CL IQQ"
    assert scores["c40_0034"].source_metadata["requested_country_code"] == "CL"
    assert scores["c40_0034"].source_metadata["http_status_code"] == 200


@pytest.mark.unit
def test_api_action_financial_feasibility_scores_client_rejects_duplicate_action_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API financial feasibility client rejects duplicate action IDs for one city."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        row = {
            "action_id": "c40_0034",
            "financial_feasibility": 1.0,
            "inputs": {},
            "links": {},
        }
        return httpx.Response(
            200,
            request=request,
            json={
                "meta": {
                    "generated_at_utc": "2026-06-26T14:37:36.830291+00:00",
                    "endpoint": ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
                    "locode": "CL IQQ",
                    "country_code": "CL",
                    "total_records": 2,
                },
                "data": [row, dict(row)],
            },
        )

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    client = ApiActionFinancialFeasibilityScoresDataApiClient()

    with pytest.raises(UpstreamApiError, match="duplicate action_id"):
        client.get_action_financial_feasibility_scores("CL IQQ", "CL")


@pytest.mark.unit
def test_api_action_financial_feasibility_scores_client_maps_404_to_empty_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """API financial feasibility client treats upstream 404 as no scores."""

    def _mock_get(
        self: httpx.Client, url: str, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        request = httpx.Request("GET", url, headers=headers)
        return httpx.Response(404, request=request, json={"detail": "not found"})

    monkeypatch.setattr(httpx.Client, "get", _mock_get)
    monkeypatch.setenv("UPSTREAM_HTTP_MAX_RETRIES", "0")
    client = ApiActionFinancialFeasibilityScoresDataApiClient()

    fetch_result = client.get_action_financial_feasibility_scores("CL IQQ", "CL")

    assert fetch_result.scores_by_action_id == {}
    assert fetch_result.source_metadata["http_status_code"] == 404
    assert fetch_result.warning is not None


@pytest.mark.unit
def test_policy_support_score_must_be_between_zero_and_one() -> None:
    """Policy support score rejects values outside the [0, 1] contract."""
    with pytest.raises(ValidationError):
        ActionPolicyScoreApiItem(
            src_action_id="action_1",
            policy_support_score=1.2,
        )


@pytest.mark.unit
def test_action_co_benefit_impact_numeric_must_be_between_minus2_and_2() -> None:
    """Action co-benefit impact numeric values are constrained to `[-2, 2]`."""
    with pytest.raises(ValidationError):
        ActionPathwayApiItem(
            actionId="action_1",
            actionName="Action 1",
            actionType="mitigation",
            coBenefits={
                "air_quality": {
                    "impactNumeric": 3,
                }
            },
            emissions={
                "sectorNumber": "I",
                "subsectorNumber": [1],
                "gpcReferenceNumber": ["I.1.1"],
                "impactText": "high",
                "impactNumeric": 2,
            },
        )


@pytest.mark.unit
def test_action_api_item_accepts_live_camelcase_action_pathways_fields() -> None:
    """Action payload accepts live action-pathways fields and camelCase impact rows."""
    action = ActionPathwayApiItem.model_validate(
        {
            "actionId": "action_1",
            "actionType": "mitigation",
            "actionName": "Action 1",
            "interventionSummary": None,
            "outcomeSummary": "Buildings use less energy.",
            "interventionType": "infrastructure",
            "actionRole": "outcome",
            "coBenefits": {
                "air_quality": {
                    "impactNumeric": 1,
                }
            },
            "emissions": {
                "sectorNumber": "I",
                "subsectorNumber": [1],
                "gpcReferenceNumber": ["I.1.1"],
                "impactText": "high",
                "impactNumeric": 2,
            },
        }
    )

    assert action.action_type == "mitigation"
    assert action.intervention_summary is None
    assert action.outcome_summary == "Buildings use less energy."
    assert action.emissions is not None
    assert action.emissions.subsector_number == [1]
    assert action.co_benefits["air_quality"].impact_numeric == 1


@pytest.mark.unit
def test_action_api_item_rejects_scalar_subsector_number() -> None:
    """Action payload requires subsector_number to stay a list, not a scalar."""
    with pytest.raises(ValidationError):
        ActionPathwayApiItem.model_validate(
            {
                "actionId": "action_1",
                "actionType": "mitigation",
                "actionName": "Action 1",
                "emissions": {
                    "sectorNumber": "I",
                    "subsectorNumber": 1,
                    "gpcReferenceNumber": ["I.1.1"],
                    "impactText": "high",
                },
            }
        )


@pytest.mark.unit
def test_action_api_item_ignores_unexpected_upstream_field() -> None:
    """Upstream action DTO ignores additive extra fields it does not use."""
    action = ActionPathwayApiItem.model_validate(
        {
            "actionId": "action_1",
            "actionType": "mitigation",
            "actionName": "Action 1",
            "unexpectedField": "ignored",
            "emissions": {
                "sectorNumber": "I",
                "subsectorNumber": [1],
                "gpcReferenceNumber": ["I.1.1"],
                "impactText": "high",
            },
        }
    )

    assert action.action_id == "action_1"
    assert not hasattr(action, "unexpectedField")


@pytest.mark.unit
def test_prioritizer_request_accepts_activity_type_field() -> None:
    """Frontend request contract accepts `activityType` in city activity rows."""
    request = PrioritizerApiRequest.model_validate(
        {
            "meta": {
                "requestId": "req-1",
                "generatedAtUtc": "2026-05-12T00:00:00+00:00",
                "backendConsumer": "hiap-meed",
                "upstreamProvider": "city_catalyst_frontend",
                "apiContext": {
                    "endpoint": "POST /v1/prioritize",
                    "locodes": ["CL-SCL"],
                },
                "totalRecords": 1,
            },
            "requestData": {
                "requestedLanguages": ["en"],
                "cityDataList": [
                    {
                        "locode": "CL-SCL",
                        "countryCode": "CL",
                        "cityStrategicPreferenceSectors": [],
                        "cityStrategicPreferenceCoBenefitKeys": [],
                        "cityEmissionsData": {
                            "inventoryYear": 2022,
                            "gpcData": {
                                "I.1.1": {
                                    "activities": [
                                        {
                                            "activityType": "Natural gas",
                                            "totalEmissions": 12.5,
                                            "activityValue": 10.0,
                                        }
                                    ]
                                }
                            },
                        },
                    }
                ],
            },
        }
    )

    activity = (
        request.requestData.cityDataList[0]
        .cityEmissionsData.gpcData["I.1.1"]
        .activities[0]
    )
    assert activity.activityType == "Natural gas"


@pytest.mark.unit
def test_prioritizer_request_rejects_unexpected_frontend_field() -> None:
    """Frontend request contract rejects unexpected extra fields at the API boundary."""
    with pytest.raises(ValidationError):
        PrioritizerApiRequest.model_validate(
            {
                "meta": {
                    "requestId": "req-1",
                    "generatedAtUtc": "2026-05-12T00:00:00+00:00",
                    "backendConsumer": "hiap-meed",
                    "upstreamProvider": "city_catalyst_frontend",
                    "apiContext": {
                        "endpoint": "POST /v1/prioritize",
                        "locodes": ["CL-SCL"],
                    },
                    "totalRecords": 1,
                },
                "requestData": {
                    "requestedLanguages": ["en"],
                    "cityDataList": [
                        {
                            "locode": "CL-SCL",
                            "countryCode": "CL",
                            "cityStrategicPreferenceSectors": [],
                            "cityStrategicPreferenceCoBenefitKeys": [],
                            "unexpectedField": "should-fail",
                            "cityEmissionsData": {
                                "inventoryYear": 2022,
                                "gpcData": {},
                            },
                        }
                    ],
                },
            }
        )


@pytest.mark.unit
def test_prioritizer_request_rejects_negative_non_afolu_total_emissions() -> None:
    """Negative city activity emissions are only allowed for AFOLU `V.*` keys."""
    with pytest.raises(ValidationError, match="only `V\\.\\*` may be negative"):
        PrioritizerApiRequest.model_validate(
            {
                "meta": {
                    "requestId": "req-1",
                    "generatedAtUtc": "2026-05-12T00:00:00+00:00",
                    "backendConsumer": "hiap-meed",
                    "upstreamProvider": "city_catalyst_frontend",
                    "apiContext": {
                        "endpoint": "POST /v1/prioritize",
                        "locodes": ["CL-SCL"],
                    },
                    "totalRecords": 1,
                },
                "requestData": {
                    "requestedLanguages": ["en"],
                    "cityDataList": [
                        {
                            "locode": "CL-SCL",
                            "countryCode": "CL",
                            "cityStrategicPreferenceSectors": [],
                            "cityStrategicPreferenceCoBenefitKeys": [],
                            "cityEmissionsData": {
                                "inventoryYear": 2022,
                                "gpcData": {
                                    "III.1.1": {
                                        "activities": [
                                            {
                                                "activityType": "Combustion",
                                                "totalEmissions": -12.5,
                                            }
                                        ]
                                    }
                                },
                            },
                        }
                    ],
                },
            }
        )


@pytest.mark.unit
def test_prioritizer_request_accepts_negative_afolu_total_emissions() -> None:
    """Negative city activity emissions remain valid for AFOLU `V.*` keys."""
    request = PrioritizerApiRequest.model_validate(
        {
            "meta": {
                "requestId": "req-1",
                "generatedAtUtc": "2026-05-12T00:00:00+00:00",
                "backendConsumer": "hiap-meed",
                "upstreamProvider": "city_catalyst_frontend",
                "apiContext": {
                    "endpoint": "POST /v1/prioritize",
                    "locodes": ["CL-SCL"],
                },
                "totalRecords": 1,
            },
            "requestData": {
                "requestedLanguages": ["en"],
                "cityDataList": [
                    {
                        "locode": "CL-SCL",
                        "countryCode": "CL",
                        "cityStrategicPreferenceSectors": [],
                        "cityStrategicPreferenceCoBenefitKeys": [],
                        "cityEmissionsData": {
                            "inventoryYear": 2022,
                            "gpcData": {
                                "V.2": {
                                    "activities": [
                                        {
                                            "activityType": "Land sink",
                                            "totalEmissions": -12.5,
                                        }
                                    ]
                                }
                            },
                        },
                    }
                ],
            },
        }
    )

    activity = (
        request.requestData.cityDataList[0]
        .cityEmissionsData.gpcData["V.2"]
        .activities[0]
    )
    assert activity.totalEmissions == -12.5


@pytest.mark.unit
def test_activity_data_level_mapping_flag_defaults_to_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Activity-data-level mapping stays disabled unless explicitly enabled."""
    monkeypatch.delenv("ACTIVITY_DATA_LEVEL_MAPPING", raising=False)

    assert is_activity_data_level_mapping_enabled() is False

