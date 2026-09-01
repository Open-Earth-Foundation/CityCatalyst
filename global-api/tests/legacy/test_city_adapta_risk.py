import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_adapta_db(monkeypatch):
    monkeypatch.setattr("routes.legacy.city_adapta_risk._has_any_adapta_rows", lambda actor_id, scenario: True)

    def _mock_rows(actor_id, timeframe, scenario, level, omit_timeframe_filter=False):
        row_base = {
            "actor_id": actor_id,
            "city_name": "Abadia de Goias",
            "country_code": "BR",
            "scenario": scenario,
            "scenario_family": None,
            "sector_id": 1,
            "sector_name": "Water resources",
            "risk_id": 2,
            "risk_name": "Risk of water stress",
            "risk_component_id": None,
            "risk_component_name": None,
            "impact_chain_id_1": 10 if level == "chain" else None,
            "impact_chain_name_1": "Chain 1" if level == "chain" else None,
            "impact_chain_id_2": None,
            "impact_chain_name_2": None,
            "impact_chain_id_3": None,
            "impact_chain_name_3": None,
            "base_indicator_id": 500 if level == "chain" else None,
            "base_indicator_name": "Indicator A" if level == "chain" else None,
            "base_indicator_level": 2 if level == "chain" else None,
            "risk_value_numeric": 0.66,
            "risk_value_string": "High",
            "risk_component_value_numeric": None,
            "risk_component_value_string": None,
            "impact_chain_1_value_numeric": 0.33 if level == "chain" else None,
            "impact_chain_1_value_string": "Medium" if level == "chain" else None,
            "impact_chain_2_value_numeric": None,
            "impact_chain_2_value_string": None,
            "impact_chain_3_value_numeric": None,
            "impact_chain_3_value_string": None,
            "base_indicator_value_numeric": 10.0 if level == "chain" else None,
            "base_indicator_value_string": "10" if level == "chain" else None,
            "null_type": "none",
            "release_id": None,
            "source_dataset": "br-mcti/adaptabrasil",
            "release_version": "v1",
            "source_vintage": None,
            "spatial_support_level": "municipal",
        }
        if omit_timeframe_filter and level == "chain":
            r1 = {**row_base, "timeframe": 2015, "base_indicator_id": 500}
            r2 = {**row_base, "timeframe": 2020, "base_indicator_id": 501}
            return [r1, r2]
        row = {**row_base, "timeframe": timeframe if timeframe is not None else 2020}
        return [row]

    monkeypatch.setattr("routes.legacy.city_adapta_risk.db_city_adapta_risk_fact", _mock_rows)


def test_get_city_adapta_risk_summary():
    response = client.get("/api/v1/cities/BR%20ADG/climate-risk/adapta")
    assert response.status_code == 200
    payload = response.json()

    assert payload["meta"]["actor_id"] == "BR ADG"
    assert payload["meta"]["timeframe"] is None
    assert payload["meta"]["timeframe_resolution"] == "all_years"
    assert payload["meta"]["scenario"] == "current"
    assert payload["meta"]["level"] == "summary"

    first = payload["data"][0]
    assert first["timeframe"] == 2020
    assert first["risk_name"] == "Risk of water stress"
    assert first["null_type"] == "none"
    assert first["value_status"] == "ok"
    assert "base_indicator_id" not in first


def test_get_city_adapta_risk_summary_explicit_timeframe_is_single_year():
    response = client.get("/api/v1/cities/BR%20ADG/climate-risk/adapta?timeframe=2020")
    assert response.status_code == 200
    meta = response.json()["meta"]
    assert meta["timeframe"] == 2020
    assert meta["timeframe_resolution"] == "single_year"
    assert response.json()["data"][0]["timeframe"] == 2020


def test_get_city_adapta_risk_chain():
    response = client.get("/api/v1/cities/BR%20ADG/climate-risk/adapta?level=chain&scenario=current&timeframe=2020")
    assert response.status_code == 200
    payload = response.json()
    first = payload["data"][0]

    assert payload["meta"]["level"] == "chain"
    assert payload["meta"]["timeframe"] == 2020
    assert payload["meta"]["timeframe_resolution"] == "single_year"
    assert first["timeframe"] == 2020
    assert first["impact_chain_id_1"] == 10
    assert first["base_indicator_id"] == 500


def test_get_city_adapta_risk_chain_all_years():
    response = client.get("/api/v1/cities/BR%20ADG/climate-risk/adapta?level=chain&scenario=current")
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["timeframe"] is None
    assert payload["meta"]["timeframe_resolution"] == "all_years"
    assert len(payload["data"]) == 2
    tfs = {row["timeframe"] for row in payload["data"]}
    assert tfs == {2015, 2020}


def test_get_city_adapta_risk_invalid_level():
    response = client.get("/api/v1/cities/BR%20ADG/climate-risk/adapta?level=invalid")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid level. Use 'summary' or 'chain'."


def test_get_city_adapta_risk_not_found(monkeypatch):
    monkeypatch.setattr("routes.legacy.city_adapta_risk._has_any_adapta_rows", lambda actor_id, scenario: False)
    response = client.get("/api/v1/cities/BR%20XYZ/climate-risk/adapta")
    assert response.status_code == 404
    assert response.json() == {"detail": "No data available"}


def test_data_gap_value_status(monkeypatch):
    def _mock_data_gap(actor_id, timeframe, scenario, level, omit_timeframe_filter=False):
        return [
            {
                "actor_id": actor_id,
                "city_name": "Abadia de Goias",
                "country_code": "BR",
                "timeframe": 2020,
                "scenario": scenario,
                "scenario_family": None,
                "sector_id": 1,
                "sector_name": "Water resources",
                "risk_id": 2,
                "risk_name": "Risk of water stress",
                "risk_component_id": None,
                "risk_component_name": None,
                "impact_chain_id_1": None,
                "impact_chain_name_1": None,
                "impact_chain_id_2": None,
                "impact_chain_name_2": None,
                "impact_chain_id_3": None,
                "impact_chain_name_3": None,
                "base_indicator_id": None,
                "base_indicator_name": None,
                "base_indicator_level": None,
                "risk_value_numeric": None,
                "risk_value_string": "Data unavailable",
                "risk_component_value_numeric": None,
                "risk_component_value_string": None,
                "impact_chain_1_value_numeric": None,
                "impact_chain_1_value_string": None,
                "impact_chain_2_value_numeric": None,
                "impact_chain_2_value_string": None,
                "impact_chain_3_value_numeric": None,
                "impact_chain_3_value_string": None,
                "base_indicator_value_numeric": None,
                "base_indicator_value_string": None,
                "null_type": "data_gap_null",
                "release_id": None,
                "source_dataset": "br-mcti/adaptabrasil",
                "release_version": "v1",
                "source_vintage": None,
                "spatial_support_level": "municipal",
            }
        ]

    monkeypatch.setattr("routes.legacy.city_adapta_risk.db_city_adapta_risk_fact", _mock_data_gap)
    response = client.get("/api/v1/cities/BR%20ADG/climate-risk/adapta")
    assert response.status_code == 200
    assert response.json()["data"][0]["value_status"] == "data_unavailable"
