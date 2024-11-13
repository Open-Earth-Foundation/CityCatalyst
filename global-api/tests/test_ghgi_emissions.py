import pytest
from fastapi.testclient import TestClient
from main import app  # Assuming your FastAPI app is in a file named main.py

client = TestClient(app)

@pytest.mark.parametrize("gwp", ["ar2", "ar3", "ar4", "ar5", "ar6"])
def test_get_emissions_by_city_and_year(gwp, mocker):
    # Mock the database query functions
    mocker.patch("main.db_query_total", return_value=[
        ("CO2", 1000, 1, 1000, 1000),
        ("CH4", 50, 28, 1400, 1800),
        ("N2O", 10, 265, 2650, 3000)
    ])
    mocker.patch("main.db_query", return_value=[
        (1000, "CO2", 0.5, "Activity 1", 2000, "kg", "Subcategory 1", "Method 1", "POINT(0 0)", 1, 1000, 1000),
        (50, "CH4", 0.1, "Activity 2", 500, "kg", "Subcategory 2", "Method 2", "POINT(1 1)", 28, 1400, 1800)
    ])
    mocker.patch("main.db_source_dq", return_value="High")
    mocker.patch("main.db_query_eq_total", return_value=(5050, 5800))

    # Make a request to the API
    response = client.get(f"/api/v1/source/TestSource/City/TestCity/2023/I.1/{gwp}")

    # Assert the response status code
    assert response.status_code == 200

    # Assert the structure and content of the response
    data = response.json()
    assert "totals" in data
    assert "records" in data

    # Check totals
    totals = data["totals"]["emissions"]
    assert totals["co2_mass"] == "1000"
    assert totals["ch4_mass"] == "50"
    assert totals["n2o_mass"] == "10"
    assert totals["co2eq_100yr"] == "5050"
    assert totals["co2eq_20yr"] == "5800"
    assert totals["gpc_quality"] == "High"

    # Check records
    assert len(data["records"]) == 2
    assert data["records"][0]["gas_name"] == "CO2"
    assert data["records"][1]["gas_name"] == "CH4"

# @pytest.mark.parametrize("gwp", ["invalid", "ar7"])
# def test_get_emissions_invalid_gwp(gwp):
#     response = client.get(f"/api/v1/source/TestSource/City/TestCity/2023/I.1/{gwp}")
#     assert response.status_code == 422  # Unprocessable Entity

# def test_get_emissions_no_data(mocker):
#     mocker.patch("main.db_query_total", return_value=[])

#     response = client.get("/api/v1/source/TestSource/City/TestCity/2023/I.1/ar5")
#     assert response.status_code == 404
#     assert response.json()["detail"] == "No data available"
