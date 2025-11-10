"""
Tests for GHG Inventory Data Validation utilities
"""

import pytest
import pandas as pd
from unittest.mock import Mock, patch, MagicMock
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_validation import (
    get_climatetrace_emissions,
    get_edgar_emissions,
    parse_city_inventory,
    compare_emissions,
    validate_ghg_inventory,
    GWP_100YR,
    GWP_20YR,
)


class TestClimateTraceEmissions:
    """Tests for ClimateTrace emissions retrieval"""

    @patch("utils.data_validation.SessionLocal")
    def test_get_climatetrace_emissions_success(self, mock_session):
        """Test successful retrieval of ClimateTrace data"""
        # Mock database response
        mock_result = [
            {"gas": "co2", "emissions_quantity": 1000.0, "asset_name": "Asset1"},
            {"gas": "ch4", "emissions_quantity": 10.0, "asset_name": "Asset2"},
            {"gas": "n2o", "emissions_quantity": 5.0, "asset_name": "Asset3"},
        ]

        mock_session_instance = MagicMock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.execute.return_value.fetchall.return_value = mock_result

        result = get_climatetrace_emissions("BRRIO", 2022, "I.1.1")

        assert result is not None
        assert result["source"] == "ClimateTrace"
        assert result["locode"] == "BRRIO"
        assert result["year"] == 2022
        assert result["reference_number"] == "I.1.1"
        assert result["num_assets"] == 3

        # Check emissions calculations
        emissions = result["emissions"]
        assert emissions["CO2"] == 1000.0
        assert emissions["CH4"] == 10.0
        assert emissions["N2O"] == 5.0

        # Check CO2eq calculations
        expected_co2eq_100 = (
            1000.0 + (10.0 * GWP_100YR["CH4"]) + (5.0 * GWP_100YR["N2O"])
        )
        assert abs(emissions["CO2eq_100yr"] - expected_co2eq_100) < 0.01

    @patch("utils.data_validation.SessionLocal")
    def test_get_climatetrace_emissions_no_data(self, mock_session):
        """Test handling of no data found"""
        mock_session_instance = MagicMock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.execute.return_value.fetchall.return_value = []

        result = get_climatetrace_emissions("BRRIO", 2022, "I.1.1")

        assert result is None


class TestEdgarEmissions:
    """Tests for EDGAR emissions retrieval"""

    @patch("utils.data_validation.SessionLocal")
    def test_get_edgar_emissions_success(self, mock_session):
        """Test successful retrieval of EDGAR data"""
        mock_result = [
            ("CO2", 2000.0),
            ("CH4", 20.0),
            ("N2O", 10.0),
        ]

        mock_session_instance = MagicMock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.execute.return_value.fetchall.return_value = mock_result

        result = get_edgar_emissions("BRRIO", 2022, "I.1.1")

        assert result is not None
        assert result["source"] == "EDGAR"
        assert result["locode"] == "BRRIO"
        assert result["year"] == 2022

        emissions = result["emissions"]
        assert emissions["CO2"] == 2000.0
        assert emissions["CH4"] == 20.0
        assert emissions["N2O"] == 10.0

        # Check CO2eq calculations
        expected_co2eq_100 = (
            2000.0 + (20.0 * GWP_100YR["CH4"]) + (10.0 * GWP_100YR["N2O"])
        )
        assert abs(emissions["CO2eq_100yr"] - expected_co2eq_100) < 0.01

    @patch("utils.data_validation.SessionLocal")
    def test_get_edgar_emissions_no_data(self, mock_session):
        """Test handling of no data found"""
        mock_session_instance = MagicMock()
        mock_session.return_value.__enter__.return_value = mock_session_instance
        mock_session_instance.execute.return_value.fetchall.return_value = []

        result = get_edgar_emissions("BRRIO", 2022, "I.1.1")

        assert result is None


class TestCityInventoryParsing:
    """Tests for city inventory parsing"""

    def test_parse_city_inventory_success(self):
        """Test successful parsing of city inventory"""
        # Create mock inventory DataFrame
        data = {
            "GPC Reference Number": ["I.1.1", "I.1.1", "I.2.1"],
            "Subsector name": ["Residential", "Residential", "Commercial"],
            "Total Emissions": [1000.0, 500.0, 2000.0],
            "CO2 Emissions": [900.0, 450.0, 1800.0],
            "CH4 Emissions": [10.0, 5.0, 20.0],
            "N2O Emissions": [5.0, 2.5, 10.0],
        }
        df = pd.DataFrame(data)

        result = parse_city_inventory(df, "I.1.1")

        assert result is not None
        assert result["source"] == "City Inventory"
        assert result["reference_number"] == "I.1.1"
        assert result["subsector_name"] == "Residential"
        assert result["num_entries"] == 2

        emissions = result["emissions"]
        assert emissions["CO2"] == 1350.0  # 900 + 450
        assert emissions["CH4"] == 15.0  # 10 + 5
        assert emissions["N2O"] == 7.5  # 5 + 2.5
        assert emissions["CO2eq_reported"] == 1500.0  # 1000 + 500

    def test_parse_city_inventory_no_data(self):
        """Test handling of sector not in inventory"""
        data = {
            "GPC Reference Number": ["I.2.1"],
            "Subsector name": ["Commercial"],
            "Total Emissions": [2000.0],
        }
        df = pd.DataFrame(data)

        result = parse_city_inventory(df, "I.1.1")

        assert result is None


class TestCompareEmissions:
    """Tests for emissions comparison"""

    def test_compare_emissions_all_sources(self):
        """Test comparison with all three data sources"""
        ct_data = {"source": "ClimateTrace", "emissions": {"CO2eq_100yr": 1000.0}}
        edgar_data = {"source": "EDGAR", "emissions": {"CO2eq_100yr": 1100.0}}
        city_data = {"source": "City", "emissions": {"CO2eq_reported": 1050.0}}

        result = compare_emissions(ct_data, edgar_data, city_data)

        assert len(result["available_sources"]) == 3
        assert "ClimateTrace" in result["available_sources"]
        assert "EDGAR" in result["available_sources"]
        assert "City" in result["available_sources"]

        # Check emissions values
        assert result["emissions_co2eq_100yr"]["ClimateTrace"] == 1000.0
        assert result["emissions_co2eq_100yr"]["EDGAR"] == 1100.0
        assert result["emissions_co2eq_100yr"]["City"] == 1050.0

        # Check relative differences (City is reference)
        assert "ClimateTrace_vs_City" in result["relative_differences"]
        assert "EDGAR_vs_City" in result["relative_differences"]

        # Calculate expected relative difference
        ct_diff = ((1000.0 - 1050.0) / 1050.0) * 100
        assert (
            abs(result["relative_differences"]["ClimateTrace_vs_City"] - ct_diff) < 0.01
        )

        # Check validation metrics
        metrics = result["validation_metrics"]
        assert "mean_emissions" in metrics
        assert "std_deviation" in metrics
        assert "coefficient_of_variation_pct" in metrics
        assert "data_quality_assessment" in metrics

    def test_compare_emissions_two_sources(self):
        """Test comparison with only two sources"""
        ct_data = {"source": "ClimateTrace", "emissions": {"CO2eq_100yr": 1000.0}}
        edgar_data = {"source": "EDGAR", "emissions": {"CO2eq_100yr": 1000.0}}

        result = compare_emissions(ct_data, edgar_data, None)

        assert len(result["available_sources"]) == 2
        assert (
            result["validation_metrics"]["data_quality_assessment"] == "high_agreement"
        )

    def test_compare_emissions_insufficient_data(self):
        """Test comparison with only one source"""
        ct_data = {"source": "ClimateTrace", "emissions": {"CO2eq_100yr": 1000.0}}

        result = compare_emissions(ct_data, None, None)

        assert len(result["available_sources"]) == 1
        assert result["validation_metrics"]["status"] == "insufficient_data"

    def test_compare_emissions_quality_assessment(self):
        """Test data quality assessment categories"""
        # High agreement (CV < 20%)
        ct_data = {"source": "ClimateTrace", "emissions": {"CO2eq_100yr": 1000.0}}
        edgar_data = {"source": "EDGAR", "emissions": {"CO2eq_100yr": 1050.0}}

        result = compare_emissions(ct_data, edgar_data, None)
        assert (
            result["validation_metrics"]["data_quality_assessment"] == "high_agreement"
        )
        assert result["validation_metrics"]["coefficient_of_variation_pct"] < 20

        # Moderate agreement (CV 20-50%)
        edgar_data = {"source": "EDGAR", "emissions": {"CO2eq_100yr": 1600.0}}

        result = compare_emissions(ct_data, edgar_data, None)
        assert (
            result["validation_metrics"]["data_quality_assessment"]
            == "moderate_agreement"
        )
        cv = result["validation_metrics"]["coefficient_of_variation_pct"]
        assert 20 <= cv < 50

        # Low agreement (CV >= 50%)
        edgar_data = {"source": "EDGAR", "emissions": {"CO2eq_100yr": 3000.0}}

        result = compare_emissions(ct_data, edgar_data, None)
        assert (
            result["validation_metrics"]["data_quality_assessment"] == "low_agreement"
        )
        assert result["validation_metrics"]["coefficient_of_variation_pct"] >= 50


class TestValidateGHGInventory:
    """Tests for full inventory validation"""

    @patch("utils.data_validation.get_climatetrace_emissions")
    @patch("utils.data_validation.get_edgar_emissions")
    @patch("utils.data_validation.parse_city_inventory")
    @patch("pandas.read_csv")
    def test_validate_ghg_inventory_success(
        self, mock_read_csv, mock_parse, mock_edgar, mock_ct
    ):
        """Test successful inventory validation"""
        # Mock data sources
        mock_ct.return_value = {
            "source": "ClimateTrace",
            "emissions": {"CO2eq_100yr": 1000.0},
        }
        mock_edgar.return_value = {
            "source": "EDGAR",
            "emissions": {"CO2eq_100yr": 1100.0},
        }
        mock_parse.return_value = {
            "source": "City",
            "emissions": {"CO2eq_reported": 1050.0},
        }
        mock_read_csv.return_value = pd.DataFrame()

        sectors = ["I.1.1", "I.2.1"]
        result = validate_ghg_inventory(
            "BRRIO", 2022, sectors, "/tmp/test_inventory.csv"
        )

        assert result["locode"] == "BRRIO"
        assert result["year"] == 2022

        summary = result["validation_summary"]
        assert summary["sectors_analyzed"] == 2
        assert summary["sectors_with_data"] == 2
        assert summary["sectors_with_multiple_sources"] == 2

        # Check sector comparisons
        assert "I.1.1" in result["sector_comparisons"]
        assert "I.2.1" in result["sector_comparisons"]


class TestGWPValues:
    """Tests for GWP constants"""

    def test_gwp_100yr_values(self):
        """Test AR6 100-year GWP values"""
        assert GWP_100YR["CO2"] == 1
        assert GWP_100YR["CH4"] == 29.8
        assert GWP_100YR["N2O"] == 273

    def test_gwp_20yr_values(self):
        """Test AR6 20-year GWP values"""
        assert GWP_20YR["CO2"] == 1
        assert GWP_20YR["CH4"] == 82.5
        assert GWP_20YR["N2O"] == 273


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
