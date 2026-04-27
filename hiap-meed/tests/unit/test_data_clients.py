"""Unit tests for data source selection and mock loading."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.modules.prioritizer.models import ActionApiItem, PolicySignalByAction
from app.services.data_clients import (
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

    assert city.comuna_name == "Iquique"
    assert city.region_name == "Tarapacá"
    assert city.city_context
    assert any(
        row.get("attribute_name") == "unemployment_rate" for row in city.city_context
    )


@pytest.mark.unit
def test_get_city_data_client_defaults_to_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """City dependency provider defaults to mock data source."""
    monkeypatch.delenv("HIAP_MEED_CITY_DATA_SOURCE", raising=False)

    client = get_city_data_api_client()

    assert isinstance(client, MockCityDataApiClient)


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
                    "sector_number": "I",
                    "subsector_number": 1,
                    "gpc_reference_number": ["I.1.1"],
                    "impact_numeric": 3,
                }
            },
            emissions={
                "sector_number": "I",
                "subsector_number": 1,
                "gpc_reference_number": ["I.1.1"],
                "impact_text": "high",
                "impact_numeric": 2,
            },
        )
