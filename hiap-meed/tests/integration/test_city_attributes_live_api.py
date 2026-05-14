"""Live contract checks for the implemented upstream city attributes API path."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.models import CityApiResponse
from app.services.city_attributes_api import (
    CITY_ATTRIBUTES_ENDPOINT_TEMPLATE,
    CityAttributesApiService,
)
from app.services.http_client import get_json_with_retries


BASE_CITY_KEYS = {
    "area_km2",
    "city_name",
    "country_code",
    "locode",
    "populationDensity",
    "populationSize",
    "region_code",
    "region_name",
}
INDICATOR_KEYS = {
    "attribute_category",
    "attribute_units",
    "attribute_value",
    "datasource",
    "version_label",
}
EXPECTED_CITY_INDICATOR_FIELDS = {
    "electricity_access_rate",
    "employment_in_transport_and_logistics",
    "home_ownership",
    "industry_construction_employment",
    "median_household_income",
    "population",
    "poverty_rate",
    "public_transport_share",
    "renter_share",
    "unemployment_rate",
}
EXPECTED_DATASOURCE_KEYS = {
    "dataset_name",
    "dataset_url",
    "datasource_name",
    "is_latest",
    "publisher_name",
    "publisher_url",
    "released_at",
    "source_url",
    "version_label",
}


def _assert_city_indicator_shape(indicator_payload: dict[str, object], field_name: str) -> None:
    """Assert one city indicator object matches the expected contract shape."""
    assert INDICATOR_KEYS.issubset(indicator_payload.keys()), field_name
    assert isinstance(indicator_payload["attribute_value"], (int, float, str)) or (
        indicator_payload["attribute_value"] is None
    ), field_name
    assert indicator_payload["attribute_units"] is None or isinstance(
        indicator_payload["attribute_units"], str
    ), field_name
    assert indicator_payload["attribute_category"] is None or isinstance(
        indicator_payload["attribute_category"], str
    ), field_name
    assert indicator_payload["datasource"] is None or isinstance(
        indicator_payload["datasource"], str
    ), field_name
    assert indicator_payload["version_label"] is None or isinstance(
        indicator_payload["version_label"], str
    ), field_name


@pytest.mark.integration
@pytest.mark.external
def test_city_attributes_live_payload_matches_expected_contract() -> None:
    """The live upstream city payload keeps the contract our service currently implements."""
    service = CityAttributesApiService()
    url = service._build_city_url("CL IQQ")

    payload, status_code = get_json_with_retries(
        url=url,
        operation_name="city attributes API call",
        headers={"accept": "application/json"},
    )

    assert status_code == 200
    assert {"meta", "city"}.issubset(payload.keys())

    meta = payload["meta"]
    assert {"api_context", "datasources", "generated_at_utc"}.issubset(meta.keys())
    assert isinstance(meta["generated_at_utc"], str)
    assert meta["generated_at_utc"]

    api_context = meta["api_context"]
    assert {"endpoint", "locode", "version_label"}.issubset(api_context.keys())
    assert api_context["endpoint"] == CITY_ATTRIBUTES_ENDPOINT_TEMPLATE
    assert api_context["locode"] == "CL IQQ"
    assert api_context["version_label"] is None or isinstance(
        api_context["version_label"], str
    )

    datasources = meta["datasources"]
    assert isinstance(datasources, list)
    assert datasources
    for datasource in datasources:
        assert EXPECTED_DATASOURCE_KEYS.issubset(datasource.keys())
        assert isinstance(datasource["datasource_name"], str)
        assert datasource["datasource_name"]
        assert datasource["is_latest"] is None or isinstance(datasource["is_latest"], bool)

    city = payload["city"]
    assert (BASE_CITY_KEYS | EXPECTED_CITY_INDICATOR_FIELDS).issubset(city.keys())
    assert city["locode"] == "CL IQQ"
    assert isinstance(city["city_name"], str)
    assert city["city_name"]
    assert city["country_code"] is None or isinstance(city["country_code"], str)
    assert isinstance(city["region_code"], str)
    assert city["region_code"]
    assert isinstance(city["region_name"], str)
    assert city["region_name"]
    assert city["area_km2"] is None or isinstance(city["area_km2"], (int, float))
    assert isinstance(city["populationSize"], int)
    assert isinstance(city["populationDensity"], (int, float))

    for field_name in EXPECTED_CITY_INDICATOR_FIELDS:
        indicator_payload = city[field_name]
        assert isinstance(indicator_payload, dict), field_name
        _assert_city_indicator_shape(indicator_payload, field_name)

    # Keep service-model validation in the loop so missing or mistyped required fields fail.
    validated = CityApiResponse.model_validate(payload)
    assert validated.city.locode == "CL IQQ"
    assert isinstance(validated.city.city_name, str)
    assert validated.city.city_name
    assert validated.city.population_size == city["populationSize"]
    assert validated.city.population_density == pytest.approx(city["populationDensity"])


@pytest.mark.integration
@pytest.mark.external
def test_city_attributes_live_service_maps_current_upstream_payload() -> None:
    """The synchronous city service maps the live upstream payload into internal CityData."""
    city = CityAttributesApiService().get_city("CL IQQ")

    assert city.locode == "CL IQQ"
    assert isinstance(city.city_name, str)
    assert city.city_name
    assert city.source == "city_attributes_api"
    assert city.source_metadata["requested_locode"] == "CL IQQ"
    assert city.source_metadata["upstream_endpoint"] == CITY_ATTRIBUTES_ENDPOINT_TEMPLATE
    assert city.source_metadata["http_status_code"] == 200
    assert isinstance(city.source_metadata["upstream_generated_at_utc"], str)
    assert city.source_metadata["upstream_generated_at_utc"]
    assert city.raw["locode"] == "CL IQQ"
    assert isinstance(city.raw["city_name"], str)
    assert city.raw["city_name"]
    assert city.raw["population_size"] == city.population_size
    assert city.raw["population_density"] == pytest.approx(city.population_density)
