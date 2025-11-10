#!/usr/bin/env python3
"""
Simple demonstration of GHG inventory validation without database access.

This script shows how the validation functions work using sample data.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_validation import compare_emissions


def main():
    print("=" * 80)
    print("GHG Inventory Validation - Demo with Sample Data")
    print("=" * 80)
    print()
    print("This demonstrates how to compare emissions from different data sources.")
    print("Reference: https://iopscience.iop.org/article/10.1088/1748-9326/acbb91")
    print()

    # Sample data for Rio de Janeiro residential buildings (I.1.1) in 2022
    # These are hypothetical values for demonstration
    climatetrace_data = {
        "source": "ClimateTrace",
        "locode": "BRRIO",
        "year": 2022,
        "reference_number": "I.1.1",
        "emissions": {
            "CO2": 386998.022,  # tonnes
            "CH4": 186.872,  # tonnes
            "N2O": 1999.955,  # tonnes
            "CO2eq_100yr": 389184.849,  # tonnes CO2eq
            "CO2eq_20yr": 404162.515,  # tonnes CO2eq
        },
        "num_assets": 45,
        "quality": "high",
    }

    edgar_data = {
        "source": "EDGAR",
        "locode": "BRRIO",
        "year": 2022,
        "reference_number": "I.1.1",
        "emissions": {
            "CO2": 350000.0,
            "CH4": 200.0,
            "N2O": 1800.0,
            "CO2eq_100yr": 357960.0,
            "CO2eq_20yr": 367500.0,
        },
        "quality": "medium",
    }

    city_data = {
        "source": "City Inventory",
        "reference_number": "I.1.1",
        "emissions": {
            "CO2": 386998.022,
            "CH4": 186.872,
            "N2O": 1999.955,
            "CO2eq_reported": 389184.849,
            "CO2eq_100yr": 389184.849,
        },
        "subsector_name": "Residential buildings",
        "num_entries": 1,
    }

    print("Sample Data for Rio de Janeiro (BRRIO)")
    print("Sector: I.1.1 - Residential Buildings")
    print("Year: 2022")
    print()

    print("-" * 80)
    print("Input Data Summary:")
    print("-" * 80)
    print(f"ClimateTrace: {climatetrace_data['emissions']['CO2eq_100yr']:>15,.0f} tonnes CO2eq")
    print(f"EDGAR:        {edgar_data['emissions']['CO2eq_100yr']:>15,.0f} tonnes CO2eq")
    print(f"City Report:  {city_data['emissions']['CO2eq_reported']:>15,.0f} tonnes CO2eq")
    print()

    # Compare the data
    comparison = compare_emissions(climatetrace_data, edgar_data, city_data)

    print("=" * 80)
    print("Validation Results:")
    print("=" * 80)
    print()
    print(f"Available sources: {', '.join(comparison['available_sources'])}")
    print()

    print("Emissions by Source (tonnes CO2eq):")
    for source, value in comparison["emissions_co2eq_100yr"].items():
        print(f"  {source:15s}: {value:>15,.0f}")
    print()

    if comparison["relative_differences"]:
        print("Relative Differences from City Inventory (%):")
        for pair, diff in comparison["relative_differences"].items():
            # Format positive/negative values
            sign = "+" if diff > 0 else ""
            print(f"  {pair:30s}: {sign}{diff:>10.1f}%")
        print()

    if comparison.get("validation_metrics"):
        metrics = comparison["validation_metrics"]
        print("Validation Metrics:")
        print(f"  Mean emissions:           {metrics.get('mean_emissions', 0):>15,.0f} tonnes CO2eq")
        print(f"  Standard deviation:       {metrics.get('std_deviation', 0):>15,.0f} tonnes CO2eq")
        print(f"  Coefficient of variation: {metrics.get('coefficient_of_variation_pct', 0):>15.1f}%")
        print(f"  Range (max - min):        {metrics.get('range', 0):>15,.0f} tonnes CO2eq")
        print()
        print(f"  Data quality assessment: {metrics.get('data_quality_assessment', 'unknown').upper()}")
        print()

    print("=" * 80)
    print("Interpretation:")
    print("=" * 80)
    print()

    cv = comparison["validation_metrics"]["coefficient_of_variation_pct"]

    if cv < 20:
        print("✓ HIGH AGREEMENT (CV < 20%)")
        print("  The three data sources show excellent agreement.")
        print("  This data is reliable and suitable for GHG inventory purposes.")
    elif cv < 50:
        print("⚠ MODERATE AGREEMENT (CV 20-50%)")
        print("  The data sources show reasonable agreement but with some variation.")
        print("  This data can be used with appropriate uncertainty quantification.")
    else:
        print("✗ LOW AGREEMENT (CV > 50%)")
        print("  The data sources show significant disagreement.")
        print("  Further investigation or additional data sources are recommended.")

    print()
    print("Based on the referenced paper, discrepancies may arise from:")
    print("  • Different methodologies and emission factors")
    print("  • Geographic boundary differences")
    print("  • Temporal misalignment")
    print("  • Data quality and completeness issues")
    print("  • Sector-specific characteristics")
    print()

    # Show recommendations
    edgar_diff = comparison["relative_differences"].get("EDGAR_vs_City", 0)
    ct_diff = comparison["relative_differences"].get("ClimateTrace_vs_City", 0)

    print("Recommendations:")
    if abs(edgar_diff) > 20:
        print(f"  • EDGAR differs by {edgar_diff:.1f}% from city inventory")
        print("    → Consider local factors that may not be captured in global gridded data")
    if abs(ct_diff) < 5:
        print("  • ClimateTrace closely matches city inventory")
        print("    → High confidence in ClimateTrace asset-level approach for this sector")
    print("  • Use city-reported inventory as primary source when available")
    print("  • Use ClimateTrace/EDGAR to fill gaps or validate reported data")
    print()

    print("=" * 80)
    print("For more information:")
    print("  • Paper: https://iopscience.iop.org/article/10.1088/1748-9326/acbb91")
    print("  • Documentation: global-api/examples/README.md")
    print("  • Code: global-api/utils/data_validation.py")
    print("=" * 80)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
