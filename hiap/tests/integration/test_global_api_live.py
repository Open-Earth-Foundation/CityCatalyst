"""Live contract checks for the upstream Global API endpoints used by HIAP."""

from __future__ import annotations

import pytest

from services.get_actions import get_actions
from services.get_ccra import get_ccra
from services.get_context import get_context


REQUIRED_ACTION_KEYS = {
    "ActionID",
    "ActionName",
    "ActionType",
}
REQUIRED_CONTEXT_KEYS = {
    "name",
    "region",
    "regionName",
    "populationDensity",
    "area",
    "elevation",
    "biome",
}
REQUIRED_CCRA_KEYS = {
    "hazard",
    "keyimpact",
    "normalised_risk_score",
}


@pytest.mark.integration
@pytest.mark.external
def test_actions_live_payload_matches_required_contract() -> None:
    """The live climate actions payload should keep the fields HIAP expects."""
    actions = get_actions(language="en")

    assert isinstance(actions, list)
    assert actions

    action = actions[0]
    assert REQUIRED_ACTION_KEYS.issubset(action.keys())
    assert isinstance(action["ActionID"], str)
    assert action["ActionID"]
    assert isinstance(action["ActionType"], list)
    assert action["ActionType"]
    assert all(isinstance(action_type, str) for action_type in action["ActionType"])
    assert action["ActionName"] is not None


@pytest.mark.integration
@pytest.mark.external
def test_city_context_live_payload_matches_required_contract() -> None:
    """The live city context payload should keep the fields HIAP reads into city data."""
    city_context = get_context("BR RIO")

    assert isinstance(city_context, dict)
    assert REQUIRED_CONTEXT_KEYS.issubset(city_context.keys())
    assert isinstance(city_context["name"], str)
    assert city_context["name"]
    assert city_context["region"] is None or isinstance(city_context["region"], str)
    assert city_context["regionName"] is None or isinstance(
        city_context["regionName"],
        str,
    )
    assert city_context["populationDensity"] is None or isinstance(
        city_context["populationDensity"],
        (int, float),
    )
    assert city_context["area"] is None or isinstance(city_context["area"], (int, float))
    assert city_context["elevation"] is None or isinstance(
        city_context["elevation"],
        (int, float),
    )
    assert city_context["biome"] is None or isinstance(city_context["biome"], str)


@pytest.mark.integration
@pytest.mark.external
def test_ccra_live_payload_matches_required_contract() -> None:
    """The live CCRA payload should keep the fields HIAP later extracts and stores."""
    ccra_rows = get_ccra("BR MGE", "current")

    assert isinstance(ccra_rows, list)
    if not ccra_rows:
        pytest.skip("Live upstream returned no CCRA rows for BR MGE.")

    ccra_row = ccra_rows[0]
    assert REQUIRED_CCRA_KEYS.issubset(ccra_row.keys())
    assert isinstance(ccra_row["hazard"], str)
    assert ccra_row["hazard"]
    assert isinstance(ccra_row["keyimpact"], str)
    assert ccra_row["keyimpact"]
    assert isinstance(ccra_row["normalised_risk_score"], (int, float))
