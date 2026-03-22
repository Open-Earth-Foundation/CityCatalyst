"""Unit tests for data source selection and mock loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.data_clients import (
    MockActionDataApiClient,
    MockCityDataApiClient,
    get_action_data_api_client,
    get_city_data_api_client,
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
        Path(__file__).resolve().parents[2] / "data" / "mock" / "cities_api_mock.json"
    )
    client = MockCityDataApiClient(mock_file_path=mock_file_path)

    city = client.get_city("CL IQQ")

    assert city.comuna_name == "Iquique"
    assert city.region_name == "Tarapacá"


@pytest.mark.unit
def test_get_city_data_client_defaults_to_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """City dependency provider defaults to mock data source."""
    monkeypatch.delenv("HIAP_MEED_CITY_DATA_SOURCE", raising=False)

    client = get_city_data_api_client()

    assert isinstance(client, MockCityDataApiClient)
