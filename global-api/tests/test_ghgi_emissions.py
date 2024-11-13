from fastapi.testclient import TestClient
import pytest
from main import app # Replace 'yourmodule' with the actual module name where your APIRouter is defined

client = TestClient(app)

# Mocking the database session
@pytest.fixture
def mock_db_session(mocker):
    # You can use mocker to stub out the methods of the database session
    mock_session = mocker.patch('db.database.SessionLocal')
    return mock_session

def test_get_emissions_by_city_and_year(mock_db_session):
    # Given: Setting up expected data and response
    # Mock the database query results
    mock_db_session.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = [
        ("CO2", 1000, 288, 288000, 288000)
    ]
    mock_db_session.return_value.__enter__.return_value.execute.return_value.fetchone.return_value = (
        288000, 288000
    )

    # Additionally mock any other necessary database operations or fixture set up
    # Mocking data quality
    mock_db_session.return_value.__enter__.return_value.execute.return_value.fetchone.side_effect = [
        ('High',),  # return for dq quality
        (288000, 288000)  # return for emissions_value_20yr and emissions_value_100yr
    ]

    # When: Sending a GET request to the API
    response = client.get("/api/v1/source/test_source/test_granularity/test_actor/2021/test_gpc", params={"gwp": "ar5"})

    # Then: Verifying the response
    assert response.status_code == 200
    assert response.json() == {
        "totals": {
            "emissions": {
                "co2_mass": "1000",
                "co2_co2eq": "288000",
                "ch4_mass": "0",
                "ch4_co2eq_100yr": "0",
                "ch4_co2eq_20yr": "0",
                "n2o_mass": "0",
                "n2o_co2eq_100yr": "0",
                "n2o_co2eq_20yr": "0",
                "co2eq_100yr": "288000",
                "co2eq_20yr": "288000",
                "gpc_quality": "High",
            }
        },
        "records": [
            {
                "emissions_value": "1000",
                "gas_name": "CO2",
                "emissionfactor_value": "None",
                "activity_name": "None",
                "activity_value": "None",
                "activity_units": "None",
                "activity_subcategory_type": None,
                "methodology_name": "None",
                "emissions_geometry": "None",
                "gwp_100yr": "288",
                "emissions_value_100yr": "288000"
            }
        ]
    }
