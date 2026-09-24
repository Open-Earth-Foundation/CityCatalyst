"""The CNB city profile mirrors the CityCatalyst city page, without geometry."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.services.citycatalyst_client import CityCatalystClientError
from app.services.concept_note_city_context import (
    ConceptNoteCityContextDataError,
    load_city_profile,
)

CITY_ID = uuid4()


def _client(*, city: dict, population=None, population_error=None):
    client = AsyncMock()
    client.get_city.return_value = {"data": city}
    if population_error is not None:
        client.get_city_population.side_effect = population_error
    else:
        client.get_city_population.return_value = {"data": population}
    return client


def _city(**overrides) -> dict:
    return {
        "cityId": str(CITY_ID),
        "name": "Kraków",
        "locode": "PL KRK",
        "country": "Poland",
        "countryLocode": "PL",
        "region": "Lesser Poland",
        "regionLocode": "PL-12",
        "area": 326.85,
        "shape": {"type": "MultiPolygon", "coordinates": [[[[19.9, 50.0]]]]},
        "projectId": str(uuid4()),
        **overrides,
    }


async def _load(client):
    return await load_city_profile(
        cc_client=client, user_id="owner", city_id=CITY_ID, token="token"
    )


async def test_profile_includes_city_page_fields_and_latest_population():
    client = _client(
        city=_city(),
        population={"cityId": str(CITY_ID), "population": 804237, "year": 2024},
    )

    profile = await _load(client)

    assert profile == {
        "name": "Kraków",
        "locode": "PL KRK",
        "country": "Poland",
        "country_locode": "PL",
        "region": "Lesser Poland",
        "region_locode": "PL-12",
        "area_km2": 326.85,
        "population": 804237,
        "population_year": 2024,
        "source": "citycatalyst",
    }
    client.get_city.assert_awaited_once_with(
        city_id=str(CITY_ID), token="token", user_id="owner"
    )


async def test_missing_or_failed_population_keeps_the_rest_of_the_profile():
    empty = await _load(
        _client(city=_city(area=None), population={"cityId": str(CITY_ID)})
    )
    failed = await _load(
        _client(
            city=_city(),
            population_error=CityCatalystClientError("down", status_code=503),
        )
    )

    assert empty["population"] is None and empty["population_year"] is None
    assert empty["area_km2"] is None
    assert failed["name"] == "Kraków"
    assert failed["population"] is None


async def test_profile_for_a_different_city_is_rejected():
    with pytest.raises(ConceptNoteCityContextDataError):
        await _load(_client(city=_city(cityId=str(uuid4())), population={}))
