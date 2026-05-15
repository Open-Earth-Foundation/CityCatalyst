"""Unit tests for data source selection and mock loading."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from app.modules.prioritizer.config import is_activity_data_level_mapping_enabled
from app.modules.prioritizer.models import (
    ActionApiItem,
    PolicySignalByAction,
    PrioritizerApiRequest,
)
from app.services.city_attributes_api import (
    DEFAULT_CITY_ATTRIBUTES_BASE_URL,
    CityAttributesApiService,
)
from app.services.http_client import UpstreamApiError, get_json_with_retries
from app.services.data_clients import (
    ApiCityDataApiClient,
    MockActionDataApiClient,
    MockCityDataApiClient,
    MockPolicySignalsDataApiClient,
    get_action_data_api_client,
    get_city_data_api_client,
    get_policy_signals_data_api_client,
)


@pytest.mark.unit
def test_mock_action_client_loads_actions_from_file() -> None:
    """Mock action client reads and maps actions from the checked-in mock payload."""
    mock_file_path = (
        Path(__file__).resolve().parents[2] / "data" / "mock" / "actions_api_mock.json"
    )
    client = MockActionDataApiClient(mock_file_path=mock_file_path)

    actions = client.list_actions()

    assert len(actions) > 0
    assert actions[0].action_id
    assert actions[0].action_name
    assert isinstance(actions[0].emissions, dict)
    assert isinstance(actions[0].emissions.get("subsector_number"), list)
    assert isinstance(actions[0].co_benefits, dict)


@pytest.mark.unit
def test_get_action_data_client_uses_mock_for_unknown_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Action dependency provider defaults unknown source values to mock data."""
    monkeypatch.setenv("HIAP_MEED_ACTION_DATA_SOURCE", "unexpected")

    client = get_action_data_api_client()

    assert isinstance(client, MockActionDataApiClient)


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
    assert city.city_context
    assert any(
        row.get("attribute_name") == "unemployment_rate" for row in city.city_context
    )
    assert city.source_metadata["mock_file_path"].endswith("city_api_mock.json")


@pytest.mark.unit
def test_get_city_data_client_defaults_to_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """City dependency provider defaults to API data source."""
    monkeypatch.delenv("HIAP_MEED_CITY_DATA_SOURCE", raising=False)

    client = get_city_data_api_client()

    assert isinstance(client, ApiCityDataApiClient)


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
        == "https://city-attributes.example.test/root/api/v0/city_attributes/CL IQQ"
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
    assert city.source_metadata["upstream_generated_at_utc"] == (
        "2026-05-13T09:39:51.706285+00:00"
    )


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
        == f"{DEFAULT_CITY_ATTRIBUTES_BASE_URL.rstrip('/')}/api/v0/city_attributes/CL IQQ"
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
def test_get_policy_signals_data_client_defaults_to_mock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Policy signal dependency provider defaults to mock data source."""
    monkeypatch.delenv("HIAP_MEED_POLICY_SIGNALS_DATA_SOURCE", raising=False)

    client = get_policy_signals_data_api_client()

    assert isinstance(client, MockPolicySignalsDataApiClient)


@pytest.mark.unit
def test_policy_support_score_must_be_between_zero_and_one() -> None:
    """Policy support score rejects values outside the [0, 1] contract."""
    with pytest.raises(ValidationError):
        PolicySignalByAction(
            action_id="action_1",
            policy_signals=[],
            policy_support_score=1.2,
        )


@pytest.mark.unit
def test_action_co_benefit_impact_numeric_must_be_between_minus2_and_2() -> None:
    """Action co-benefit impact numeric values are constrained to `[-2, 2]`."""
    with pytest.raises(ValidationError):
        ActionApiItem(
            actionId="action_1",
            actionName="Action 1",
            coBenefits={
                "air_quality": {
                    "impact_numeric": 3,
                }
            },
            emissions={
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
                "impact_numeric": 2,
            },
        )


@pytest.mark.unit
def test_action_api_item_accepts_subsector_number_list_and_activity_type_description() -> None:
    """Action payload accepts one-element subsector lists and nullable mapping text."""
    action = ActionApiItem.model_validate(
        {
            "actionId": "action_1",
            "actionName": "Action 1",
            "activity_type_description": None,
            "coBenefits": {
                "air_quality": {
                    "impact_numeric": 1,
                }
            },
            "emissions": {
                "sector_number": "I",
                "subsector_number": [1],
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
                "impact_numeric": 2,
            },
        }
    )

    assert action.activity_type_description is None
    assert action.emissions is not None
    assert action.emissions.subsector_number == [1]
    assert action.coBenefits["air_quality"].impact_numeric == 1


@pytest.mark.unit
def test_action_api_item_rejects_scalar_subsector_number() -> None:
    """Action payload requires subsector_number to stay a list, not a scalar."""
    with pytest.raises(ValidationError):
        ActionApiItem.model_validate(
            {
                "actionId": "action_1",
                "actionName": "Action 1",
                "emissions": {
                    "sector_number": "I",
                    "subsector_number": 1,
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "high",
                },
            }
        )


@pytest.mark.unit
def test_action_api_item_rejects_unexpected_upstream_field() -> None:
    """Upstream action contract rejects unexpected extra fields instead of dropping them."""
    with pytest.raises(ValidationError):
        ActionApiItem.model_validate(
            {
                "actionId": "action_1",
                "actionName": "Action 1",
                "unexpectedField": "should-fail",
                "emissions": {
                    "sector_number": "I",
                    "subsector_number": [1],
                    "gpc_reference_number": ["I.1.1"],
                    "impact_text": "high",
                },
            }
        )


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
