"""Unit tests for action data source selection and mock loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.data_clients import (
    MockActionDataApiClient,
    StubActionDataApiClient,
    get_action_data_api_client,
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
def test_get_action_data_client_uses_stub_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Action dependency provider returns stub client when env source is stub."""
    monkeypatch.setenv("HIAP_MEED_ACTION_DATA_SOURCE", "stub")

    client = get_action_data_api_client()

    assert isinstance(client, StubActionDataApiClient)
