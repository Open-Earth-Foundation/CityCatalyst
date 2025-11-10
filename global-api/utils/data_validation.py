"""
Data Validation Utilities for GHG Inventories

This module provides functions to validate and compare greenhouse gas emissions data
from multiple sources (ClimateTrace, EDGAR, and city-reported inventories).

Reference: https://iopscience.iop.org/article/10.1088/1748-9326/acbb91
"""

import pandas as pd
from typing import Dict, List, Optional, Tuple
import logging
from sqlalchemy import text
from db.database import SessionLocal

logger = logging.getLogger(__name__)

# GWP values (AR6)
GWP_100YR = {
    "CO2": 1,
    "CH4": 29.8,
    "N2O": 273
}

GWP_20YR = {
    "CO2": 1,
    "CH4": 82.5,
    "N2O": 273
}


def get_climatetrace_emissions(locode: str, year: int, reference_number: str) -> Optional[Dict]:
    """
    Fetch emissions data from ClimateTrace database.
    
    Args:
        locode: City location code
        year: Year of emissions
        reference_number: GPC reference number
        
    Returns:
        Dictionary with emissions data or None if no data found
    """
    try:
        with SessionLocal() as session:
            query = text(
                """
                SELECT * FROM asset
                WHERE reference_number = :reference_number
                AND locode = :locode
                AND EXTRACT(YEAR FROM end_time) = :year;
                """
            )
            params = {"locode": locode, "year": year, "reference_number": reference_number}
            result = session.execute(query, params).fetchall()
            
            if not result:
                return None
                
            df = pd.DataFrame(result)
            
            # Calculate total emissions by gas
            emissions = {}
            for gas in ["co2", "ch4", "n2o"]:
                gas_data = df[df["gas"] == gas]
                if not gas_data.empty:
                    emissions[gas.upper()] = float(gas_data["emissions_quantity"].sum())
                else:
                    emissions[gas.upper()] = 0.0
            
            # Calculate CO2eq
            emissions["CO2eq_100yr"] = (
                emissions["CO2"] + 
                emissions["CH4"] * GWP_100YR["CH4"] + 
                emissions["N2O"] * GWP_100YR["N2O"]
            )
            
            emissions["CO2eq_20yr"] = (
                emissions["CO2"] + 
                emissions["CH4"] * GWP_20YR["CH4"] + 
                emissions["N2O"] * GWP_20YR["N2O"]
            )
            
            return {
                "source": "ClimateTrace",
                "locode": locode,
                "year": year,
                "reference_number": reference_number,
                "emissions": emissions,
                "num_assets": len(df),
                "quality": "TBD"
            }
    except Exception as e:
        logger.error(f"Error fetching ClimateTrace data: {e}")
        return None


def get_edgar_emissions(locode: str, year: int, reference_number: str) -> Optional[Dict]:
    """
    Fetch emissions data from EDGAR database.
    
    Args:
        locode: City location code
        year: Year of emissions
        reference_number: GPC reference number
        
    Returns:
        Dictionary with emissions data or None if no data found
    """
    try:
        with SessionLocal() as session:
            query = text(
                """
                SELECT
                    gce.gas,
                    SUM(gce.emissions_quantity * cco.fraction_in_city) AS total_emissions
                FROM
                    "CityCellOverlapEdgar" cco
                JOIN
                    "GridCellEmissionsEdgar" gce
                ON
                    cco.cell_lat = gce.cell_lat AND cco.cell_lon = gce.cell_lon
                WHERE cco.locode = :locode
                AND gce.reference_number = :reference_number
                AND gce.year = :year
                GROUP BY gce.gas
                """
            )
            params = {"locode": locode, "year": year, "reference_number": reference_number}
            result = session.execute(query, params).fetchall()
            
            if not result:
                return None
            
            emissions = {"CO2": 0.0, "CH4": 0.0, "N2O": 0.0}
            
            for record in result:
                gas = record[0]
                mass = float(record[1])
                emissions[gas] = mass
            
            # Calculate CO2eq
            emissions["CO2eq_100yr"] = (
                emissions["CO2"] + 
                emissions["CH4"] * GWP_100YR["CH4"] + 
                emissions["N2O"] * GWP_100YR["N2O"]
            )
            
            emissions["CO2eq_20yr"] = (
                emissions["CO2"] + 
                emissions["CH4"] * GWP_20YR["CH4"] + 
                emissions["N2O"] * GWP_20YR["N2O"]
            )
            
            return {
                "source": "EDGAR",
                "locode": locode,
                "year": year,
                "reference_number": reference_number,
                "emissions": emissions,
                "quality": "medium"
            }
    except Exception as e:
        logger.error(f"Error fetching EDGAR data: {e}")
        return None


def parse_city_inventory(inventory_df: pd.DataFrame, reference_number: str) -> Optional[Dict]:
    """
    Parse city-reported inventory data for a specific GPC reference number.
    
    Args:
        inventory_df: DataFrame with city inventory data
        reference_number: GPC reference number to filter
        
    Returns:
        Dictionary with emissions data or None if no data found
    """
    try:
        # Filter by GPC reference number
        sector_data = inventory_df[inventory_df["GPC Reference Number"] == reference_number]
        
        if sector_data.empty:
            return None
        
        # Sum emissions across all entries for this sector
        total_co2eq = sector_data["Total Emissions"].sum()
        
        # Try to get individual gas emissions if available
        co2_emissions = sector_data["CO2 Emissions"].sum() if "CO2 Emissions" in sector_data.columns else 0
        ch4_emissions = sector_data["CH4 Emissions"].sum() if "CH4 Emissions" in sector_data.columns else 0
        n2o_emissions = sector_data["N2O Emissions"].sum() if "N2O Emissions" in sector_data.columns else 0
        
        emissions = {
            "CO2": float(co2_emissions) if pd.notna(co2_emissions) else 0.0,
            "CH4": float(ch4_emissions) if pd.notna(ch4_emissions) else 0.0,
            "N2O": float(n2o_emissions) if pd.notna(n2o_emissions) else 0.0,
            "CO2eq_reported": float(total_co2eq) if pd.notna(total_co2eq) else 0.0
        }
        
        # Calculate CO2eq from individual gases if available
        if emissions["CO2"] > 0 or emissions["CH4"] > 0 or emissions["N2O"] > 0:
            emissions["CO2eq_100yr"] = (
                emissions["CO2"] + 
                emissions["CH4"] * GWP_100YR["CH4"] + 
                emissions["N2O"] * GWP_100YR["N2O"]
            )
        
        return {
            "source": "City Inventory",
            "reference_number": reference_number,
            "emissions": emissions,
            "subsector_name": sector_data["Subsector name"].iloc[0] if not sector_data.empty else "Unknown",
            "num_entries": len(sector_data)
        }
    except Exception as e:
        logger.error(f"Error parsing city inventory: {e}")
        return None


def compare_emissions(
    climatetrace_data: Optional[Dict],
    edgar_data: Optional[Dict],
    city_data: Optional[Dict]
) -> Dict:
    """
    Compare emissions from different data sources and calculate validation metrics.
    
    Args:
        climatetrace_data: ClimateTrace emissions data
        edgar_data: EDGAR emissions data
        city_data: City-reported inventory data
        
    Returns:
        Dictionary with comparison results and validation metrics
    """
    comparison = {
        "available_sources": [],
        "emissions_co2eq_100yr": {},
        "differences": {},
        "relative_differences": {},
        "validation_metrics": {}
    }
    
    # Collect available data
    sources = []
    if climatetrace_data:
        sources.append(("ClimateTrace", climatetrace_data))
        comparison["available_sources"].append("ClimateTrace")
    if edgar_data:
        sources.append(("EDGAR", edgar_data))
        comparison["available_sources"].append("EDGAR")
    if city_data:
        sources.append(("City", city_data))
        comparison["available_sources"].append("City")
    
    if len(sources) < 2:
        comparison["validation_metrics"]["status"] = "insufficient_data"
        comparison["validation_metrics"]["message"] = "Need at least 2 data sources for comparison"
        return comparison
    
    # Extract CO2eq values
    for name, data in sources:
        emissions = data.get("emissions", {})
        # Use reported CO2eq if available, otherwise use calculated 100yr value
        co2eq = emissions.get("CO2eq_reported") or emissions.get("CO2eq_100yr", 0)
        comparison["emissions_co2eq_100yr"][name] = co2eq
    
    # Calculate differences and relative differences
    emissions_values = list(comparison["emissions_co2eq_100yr"].values())
    
    if len(sources) >= 2:
        # Use city inventory as reference if available, otherwise use first source
        reference_name = "City" if city_data else sources[0][0]
        reference_value = comparison["emissions_co2eq_100yr"][reference_name]
        
        for name, value in comparison["emissions_co2eq_100yr"].items():
            if name != reference_name and reference_value > 0:
                diff = value - reference_value
                rel_diff = (diff / reference_value) * 100
                comparison["differences"][f"{name}_vs_{reference_name}"] = diff
                comparison["relative_differences"][f"{name}_vs_{reference_name}"] = rel_diff
    
    # Calculate validation metrics
    if len(emissions_values) >= 2:
        mean_emissions = sum(emissions_values) / len(emissions_values)
        std_dev = (sum((x - mean_emissions) ** 2 for x in emissions_values) / len(emissions_values)) ** 0.5
        coefficient_of_variation = (std_dev / mean_emissions * 100) if mean_emissions > 0 else 0
        
        comparison["validation_metrics"] = {
            "mean_emissions": mean_emissions,
            "std_deviation": std_dev,
            "coefficient_of_variation_pct": coefficient_of_variation,
            "min_emissions": min(emissions_values),
            "max_emissions": max(emissions_values),
            "range": max(emissions_values) - min(emissions_values),
            "data_quality_assessment": (
                "high_agreement" if coefficient_of_variation < 20 else
                "moderate_agreement" if coefficient_of_variation < 50 else
                "low_agreement"
            )
        }
    
    return comparison


def validate_ghg_inventory(
    locode: str,
    year: int,
    reference_numbers: Optional[List[str]] = None,
    city_inventory_path: Optional[str] = None
) -> Dict:
    """
    Comprehensive validation of GHG inventory data across multiple sources.
    
    This function compares emissions data from ClimateTrace, EDGAR, and city-reported
    inventories to assess data quality and agreement between sources.
    
    Args:
        locode: City location code
        year: Year of emissions
        reference_numbers: List of GPC reference numbers to validate. If None, uses common sectors.
        city_inventory_path: Path to city inventory CSV file. If None, skips city data.
        
    Returns:
        Dictionary with validation results for each sector
    """
    if reference_numbers is None:
        # Default to common sectors for validation
        reference_numbers = [
            "I.1.1",  # Residential buildings
            "I.2.1",  # Commercial buildings
            "II.1.1", # On-road transportation
            "II.2.1", # Railways
            "III.1.1", # Solid waste disposal
        ]
    
    results = {
        "locode": locode,
        "year": year,
        "validation_summary": {
            "sectors_analyzed": 0,
            "sectors_with_data": 0,
            "sectors_with_multiple_sources": 0,
            "overall_data_quality": None
        },
        "sector_comparisons": {}
    }
    
    # Load city inventory if provided
    city_inventory_df = None
    if city_inventory_path:
        try:
            city_inventory_df = pd.read_csv(city_inventory_path)
        except Exception as e:
            logger.error(f"Error loading city inventory: {e}")
    
    quality_scores = []
    
    for ref_num in reference_numbers:
        results["validation_summary"]["sectors_analyzed"] += 1
        
        # Fetch data from all sources
        ct_data = get_climatetrace_emissions(locode, year, ref_num)
        edgar_data = get_edgar_emissions(locode, year, ref_num)
        city_data = None
        if city_inventory_df is not None:
            city_data = parse_city_inventory(city_inventory_df, ref_num)
        
        # Compare the data
        comparison = compare_emissions(ct_data, edgar_data, city_data)
        
        if len(comparison["available_sources"]) > 0:
            results["validation_summary"]["sectors_with_data"] += 1
        
        if len(comparison["available_sources"]) >= 2:
            results["validation_summary"]["sectors_with_multiple_sources"] += 1
            
            # Track quality for overall assessment
            quality = comparison.get("validation_metrics", {}).get("data_quality_assessment")
            if quality:
                quality_scores.append(quality)
        
        results["sector_comparisons"][ref_num] = comparison
    
    # Overall quality assessment
    if quality_scores:
        high_count = quality_scores.count("high_agreement")
        moderate_count = quality_scores.count("moderate_agreement")
        low_count = quality_scores.count("low_agreement")
        
        if high_count >= len(quality_scores) / 2:
            results["validation_summary"]["overall_data_quality"] = "high"
        elif moderate_count + high_count >= len(quality_scores) / 2:
            results["validation_summary"]["overall_data_quality"] = "moderate"
        else:
            results["validation_summary"]["overall_data_quality"] = "low"
    
    return results
