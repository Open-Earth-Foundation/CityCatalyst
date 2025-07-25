import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# --- Test successful emissions retrieval ---
def test_get_emissions_success(monkeypatch):
    """Test successful retrieval of emissions data with all gases"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        # Detailed records query
                        return [
                            ("IPCC", "POINT(0 0)", "Electricity Consumption", "MWh", {"type": "energy"}, [{"gas_name": "CO2", "emissions_value": 1000}])
                        ]
                    else:
                        # Totals query
                        return [
                            ("CO2", 1000, 1.0, 1000, 1000),
                            ("CH4", 50, 25.0, 1250, 1250),
                            ("N2O", 10, 298.0, 2980, 2980)
                        ]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return ("High",)
                    else:
                        return (5270, 5270)  # total emissions_value_100yr, emissions_value_20yr
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check totals structure
    assert "totals" in data
    assert "emissions" in data["totals"]
    emissions = data["totals"]["emissions"]
    
    # Check CO2 values
    assert emissions["co2_mass"] == "1000"
    assert emissions["co2_co2eq"] == "1000"
    
    # Check CH4 values
    assert emissions["ch4_mass"] == "50"
    assert emissions["ch4_co2eq_100yr"] == "1250"
    assert emissions["ch4_co2eq_20yr"] == "1250"
    
    # Check N2O values
    assert emissions["n2o_mass"] == "10"
    assert emissions["n2o_co2eq_100yr"] == "2980"
    assert emissions["n2o_co2eq_20yr"] == "2980"
    
    # Check total CO2eq values
    assert emissions["co2eq_100yr"] == "5270"
    assert emissions["co2eq_20yr"] == "5270"
    
    # Check data quality
    assert emissions["gpc_quality"] == "High"
    
    # Check records structure
    assert "records" in data
    assert isinstance(data["records"], list)
    assert len(data["records"]) == 1


def test_get_emissions_single_gas(monkeypatch):
    """Test emissions retrieval with only CO2 data"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 500, 1.0, 500, 500)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (500, 500)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY456/2022/I.2")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["co2_mass"] == "500"
    assert emissions["co2_co2eq"] == "500"
    assert emissions["ch4_mass"] == "0"
    assert emissions["n2o_mass"] == "0"
    assert emissions["co2eq_100yr"] == "500"


def test_get_emissions_with_data_quality(monkeypatch):
    """Test emissions retrieval with data quality information"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return ("High",)
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY789/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["gpc_quality"] == "High"


def test_get_emissions_with_detailed_records(monkeypatch):
    """Test emissions retrieval with detailed activity records"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return [
                            ("IPCC", "POINT(0 0)", "Electricity Consumption", "MWh", {"type": "energy"}, [{"gas_name": "CO2", "emissions_value": 1000}])
                        ]
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY999/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    
    assert len(data["records"]) == 1
    record = data["records"][0]
    assert record["methodology_name"] == "IPCC"
    assert record["activity_name"] == "Electricity Consumption"
    assert record["activity_units"] == "MWh"
    assert record["activity_subcategory_type"] == {"type": "energy"}


# --- Test different GWP values ---
def test_get_emissions_ar2_gwp(monkeypatch):
    """Test emissions retrieval with AR2 GWP"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CH4", 50, 21.0, 1050, 1050)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1050, 1050)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/I.1?gwp=ar2")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["ch4_co2eq_100yr"] == "1050"


def test_get_emissions_ar6_gwp(monkeypatch):
    """Test emissions retrieval with AR6 GWP"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("N2O", 10, 273.0, 2730, 2730)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (2730, 2730)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/I.1?gwp=ar6")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["n2o_co2eq_100yr"] == "2730"


# --- Test different spatial granularities ---
def test_get_emissions_country_granularity(monkeypatch):
    """Test emissions retrieval with country spatial granularity"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 10000, 1.0, 10000, 10000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (10000, 10000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/country/COUNTRY123/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["co2_mass"] == "10000"


def test_get_emissions_region_granularity(monkeypatch):
    """Test emissions retrieval with region spatial granularity"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 5000, 1.0, 5000, 5000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (5000, 5000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/region/REGION123/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["co2_mass"] == "5000"


# --- Test error cases ---
def test_get_emissions_no_data(monkeypatch):
    """Test emissions retrieval when no data is available"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def fetchall(self): return []
                def fetchone(self): return None
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/NONEXISTENT/2023/I.1")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


def test_get_emissions_invalid_gwp(monkeypatch):
    """Test emissions retrieval with invalid GWP value"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            # Check if the GWP parameter is invalid
            if params.get("gwp") not in {"ar2", "ar3", "ar4", "ar5", "ar6"}:
                raise ValueError("Invalid GWP provided.")
            class DummyResult:
                def fetchall(self): return []
                def fetchone(self): return None
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    # The route will call db_query_total first, which validates GWP and raises ValueError
    # This should result in a 500 error since the exception isn't caught
    with pytest.raises(ValueError, match="Invalid GWP provided."):
        client.get("/api/v1/source/test_source/city/CITY123/2023/I.1?gwp=invalid")


def test_get_emissions_invalid_gpc_reference(monkeypatch):
    """Test emissions retrieval with invalid GPC reference number"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            class DummyResult:
                def fetchall(self): return []
                def fetchone(self): return None
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/INVALID.REF")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "No data available"


# --- Test edge cases ---
def test_get_emissions_zero_emissions(monkeypatch):
    """Test emissions retrieval with zero emissions values"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 0, 1.0, 0, 0)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (0, 0)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["co2_mass"] == "0"
    assert emissions["co2_co2eq"] == "0"
    assert emissions["co2eq_100yr"] == "0"


def test_get_emissions_missing_data_quality(monkeypatch):
    """Test emissions retrieval when data quality is not available"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    emissions = data["totals"]["emissions"]
    
    assert emissions["gpc_quality"] == ""


def test_get_emissions_null_values_in_records(monkeypatch):
    """Test emissions retrieval with null values in detailed records"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return [
                            (None, None, None, None, None, [])
                        ]
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/I.1")
    
    assert response.status_code == 200
    data = response.json()
    
    assert len(data["records"]) == 1
    record = data["records"][0]
    assert record["methodology_name"] is None
    assert record["emissions_geometry"] is None
    assert record["activity_name"] is None
    assert record["activity_units"] is None
    assert record["activity_subcategory_type"] is None


# --- Test URL parameter validation ---
def test_get_emissions_missing_parameters():
    """Test emissions retrieval with missing URL parameters"""
    # Test missing actor_id
    response = client.get("/api/v1/source/test_source/city//2023/I.1")
    assert response.status_code == 404
    
    # Test missing emissions_year
    response = client.get("/api/v1/source/test_source/city/CITY123//I.1")
    assert response.status_code == 404
    
    # Test missing gpc_reference_number
    response = client.get("/api/v1/source/test_source/city/CITY123/2023/")
    assert response.status_code == 404


def test_get_emissions_invalid_url():
    """Test emissions retrieval with invalid URL"""
    response = client.get("/api/v1/source/invalid/path")
    assert response.status_code == 404


# --- Test database query parameters ---
def test_database_query_parameters(monkeypatch):
    """Test that the correct parameters are passed to the database queries"""
    captured_params = {}
    
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            nonlocal captured_params
            captured_params = params
            class DummyResult:
                def fetchall(self): return []
                def fetchone(self): return None
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    client.get("/api/v1/source/test_source/city/TESTCITY/2023/I.1?gwp=ar4")
    
    # Verify the parameters passed to the database query
    assert captured_params["datasource_name"] == "test_source"
    assert captured_params["spatial_granularity"] == "city"
    assert captured_params["actor_id"] == "TESTCITY"
    assert captured_params["emissions_year"] == 2023
    assert captured_params["gpc_reference_number"] == "I.1"
    assert captured_params["gwp"] == "ar4"


# --- Test different GPC reference numbers ---
def test_get_emissions_different_gpc_references(monkeypatch):
    """Test emissions retrieval with different GPC reference numbers"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    # Test different GPC reference numbers
    gpc_refs = ["I.1", "I.2", "II.1", "III.1", "IV.1", "V.1"]
    
    for gpc_ref in gpc_refs:
        response = client.get(f"/api/v1/source/test_source/city/CITY123/2023/{gpc_ref}")
        assert response.status_code == 200
        data = response.json()
        assert "totals" in data
        assert "emissions" in data["totals"]


# --- Test different years ---
def test_get_emissions_different_years(monkeypatch):
    """Test emissions retrieval with different years"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    # Test different years
    years = [2020, 2021, 2022, 2023, 2024]
    
    for year in years:
        response = client.get(f"/api/v1/source/test_source/city/CITY123/{year}/I.1")
        assert response.status_code == 200
        data = response.json()
        assert "totals" in data
        assert "emissions" in data["totals"]


# --- Test all GWP values ---
def test_get_emissions_all_gwp_values(monkeypatch):
    """Test emissions retrieval with all valid GWP values"""
    class DummySession:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def execute(self, query, params):
            query_str = str(query)
            class DummyResult:
                def fetchall(self):
                    if "activity_data" in query_str:
                        return []
                    else:
                        return [("CO2", 1000, 1.0, 1000, 1000)]
                def fetchone(self):
                    if "data_quality" in query_str:
                        return None
                    else:
                        return (1000, 1000)
            return DummyResult()
    
    monkeypatch.setattr("routes.ghgi_emissions.SessionLocal", lambda: DummySession())
    
    # Test all valid GWP values
    gwp_values = ["ar2", "ar3", "ar4", "ar5", "ar6"]
    
    for gwp in gwp_values:
        response = client.get(f"/api/v1/source/test_source/city/CITY123/2023/I.1?gwp={gwp}")
        assert response.status_code == 200
        data = response.json()
        assert "totals" in data
        assert "emissions" in data["totals"] 