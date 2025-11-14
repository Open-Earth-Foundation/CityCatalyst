"""
Example: Validating GHG Inventory Data

This script demonstrates how to validate and compare greenhouse gas emissions data
from multiple sources (ClimateTrace, EDGAR, and city-reported inventories).

This approach follows the methodology described in:
"How do IPCC estimates of urban CO2 emissions compare to inventoried estimates?"
https://iopscience.iop.org/article/10.1088/1748-9326/acbb91

The paper compares top-down global datasets (like EDGAR) with bottom-up city inventories
and finds that agreement varies significantly by sector and city.
"""

import sys
import os
import json
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.data_validation import (
    validate_ghg_inventory,
    get_climatetrace_emissions,
    get_edgar_emissions,
    parse_city_inventory,
    compare_emissions,
)
import pandas as pd


def example_single_sector_comparison():
    """
    Example 1: Compare a single sector across all data sources
    """
    print("=" * 80)
    print("Example 1: Single Sector Comparison")
    print("=" * 80)

    # Example parameters
    locode = "BRRIO"  # Rio de Janeiro
    year = 2022
    reference_number = "I.1.1"  # Residential buildings

    print(f"\nComparing emissions for {locode} in {year}")
    print(f"Sector: {reference_number} (Residential buildings)\n")

    # Fetch from each source
    print("Fetching ClimateTrace data...")
    ct_data = get_climatetrace_emissions(locode, year, reference_number)
    if ct_data:
        print(f"  ✓ Found {ct_data['num_assets']} assets")
        print(f"  CO2eq (100yr): {ct_data['emissions']['CO2eq_100yr']:,.0f} tonnes")
    else:
        print("  ✗ No data found")

    print("\nFetching EDGAR data...")
    edgar_data = get_edgar_emissions(locode, year, reference_number)
    if edgar_data:
        print(f"  ✓ Data available")
        print(f"  CO2eq (100yr): {edgar_data['emissions']['CO2eq_100yr']:,.0f} tonnes")
    else:
        print("  ✗ No data found")

    print("\nFetching City Inventory data...")
    # Example: Load city inventory from CSV
    inventory_path = f"/home/runner/work/CityCatalyst/CityCatalyst/hiap/app/cap_off_app/data/ghgi_exports/inventory-{locode.replace('BR', 'BR ')}-{year}.csv"

    city_data = None
    if os.path.exists(inventory_path):
        inventory_df = pd.read_csv(inventory_path)
        city_data = parse_city_inventory(inventory_df, reference_number)
        if city_data:
            print(f"  ✓ Found {city_data['num_entries']} inventory entries")
            print(
                f"  CO2eq (reported): {city_data['emissions'].get('CO2eq_reported', 0):,.0f} tonnes"
            )
        else:
            print(f"  ✗ No data for sector {reference_number}")
    else:
        print(f"  ✗ Inventory file not found: {inventory_path}")

    # Compare the data
    print("\n" + "-" * 80)
    print("Comparison Results:")
    print("-" * 80)

    comparison = compare_emissions(ct_data, edgar_data, city_data)

    print(f"\nAvailable sources: {', '.join(comparison['available_sources'])}")

    if comparison["emissions_co2eq_100yr"]:
        print("\nEmissions (tonnes CO2eq):")
        for source, value in comparison["emissions_co2eq_100yr"].items():
            print(f"  {source:15s}: {value:>15,.0f}")

    if comparison["relative_differences"]:
        print("\nRelative differences (%):")
        for pair, diff in comparison["relative_differences"].items():
            print(f"  {pair:30s}: {diff:>10.1f}%")

    if comparison.get("validation_metrics"):
        metrics = comparison["validation_metrics"]
        print(f"\nValidation Metrics:")
        print(f"  Mean emissions: {metrics.get('mean_emissions', 0):,.0f} tonnes CO2eq")
        print(f"  Std deviation: {metrics.get('std_deviation', 0):,.0f} tonnes CO2eq")
        print(
            f"  Coefficient of variation: {metrics.get('coefficient_of_variation_pct', 0):.1f}%"
        )
        print(f"  Data quality: {metrics.get('data_quality_assessment', 'unknown')}")

    print("\n")


def example_full_inventory_validation():
    """
    Example 2: Validate multiple sectors for a complete inventory assessment
    """
    print("=" * 80)
    print("Example 2: Full Inventory Validation")
    print("=" * 80)

    locode = "BRRIO"  # Rio de Janeiro
    year = 2022

    # Define sectors to validate
    sectors = [
        "I.1.1",  # Residential buildings - stationary energy
        "I.2.1",  # Commercial buildings - stationary energy
        "I.3.1",  # Manufacturing - stationary energy
        "I.4.1",  # Energy industries
        "II.1.1",  # On-road transportation
        "II.2.1",  # Railways
        "III.1.1",  # Solid waste disposal
    ]

    print(f"\nValidating inventory for {locode} in {year}")
    print(f"Analyzing {len(sectors)} sectors\n")

    # Check if city inventory exists
    inventory_path = f"/home/runner/work/CityCatalyst/CityCatalyst/hiap/app/cap_off_app/data/ghgi_exports/inventory-{locode.replace('BR', 'BR ')}-{year}.csv"

    if not os.path.exists(inventory_path):
        print(f"Note: City inventory not found at {inventory_path}")
        print("Will compare ClimateTrace and EDGAR only\n")
        inventory_path = None

    # Run validation
    results = validate_ghg_inventory(locode, year, sectors, inventory_path)

    # Display summary
    print("=" * 80)
    print("Validation Summary")
    print("=" * 80)
    summary = results["validation_summary"]
    print(f"Sectors analyzed: {summary['sectors_analyzed']}")
    print(f"Sectors with data: {summary['sectors_with_data']}")
    print(f"Sectors with multiple sources: {summary['sectors_with_multiple_sources']}")
    print(f"Overall data quality: {summary['overall_data_quality']}")

    # Display sector-by-sector results
    print("\n" + "=" * 80)
    print("Sector-by-Sector Results")
    print("=" * 80)

    for ref_num, comparison in results["sector_comparisons"].items():
        sources = comparison.get("available_sources", [])
        if not sources:
            continue

        print(f"\n{ref_num}:")
        print(f"  Sources: {', '.join(sources)}")

        if comparison.get("emissions_co2eq_100yr"):
            for source, value in comparison["emissions_co2eq_100yr"].items():
                print(f"    {source}: {value:,.0f} tonnes CO2eq")

        if comparison.get("validation_metrics"):
            quality = comparison["validation_metrics"].get("data_quality_assessment")
            cv = comparison["validation_metrics"].get("coefficient_of_variation_pct", 0)
            print(f"  Quality: {quality} (CV: {cv:.1f}%)")

    # Save results to JSON
    output_path = "/tmp/ghg_validation_results.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n✓ Full results saved to: {output_path}\n")


def example_interpret_results():
    """
    Example 3: How to interpret validation results
    """
    print("=" * 80)
    print("Example 3: Interpreting Validation Results")
    print("=" * 80)
    print(
        """
Based on the referenced paper (https://iopscience.iop.org/article/10.1088/1748-9326/acbb91),
here's how to interpret the validation metrics:

1. COEFFICIENT OF VARIATION (CV):
   - CV < 20%: High agreement between sources (reliable data)
   - CV 20-50%: Moderate agreement (use with caution)
   - CV > 50%: Low agreement (further investigation needed)

2. RELATIVE DIFFERENCES:
   - < 30%: Generally acceptable for inventory purposes
   - 30-100%: Common for some sectors (e.g., waste, agriculture)
   - > 100%: Significant discrepancy requiring investigation

3. DATA QUALITY ASSESSMENT:
   - High agreement: Data suitable for GHG inventory
   - Moderate agreement: Data can be used with uncertainty quantification
   - Low agreement: Consider additional data sources or local measurements

4. SECTOR-SPECIFIC CONSIDERATIONS:
   The paper found that:
   - Energy sectors: Generally show better agreement (CV ~ 20-40%)
   - Transport: Moderate agreement (CV ~ 30-60%)
   - Waste: Often show larger discrepancies (CV > 60%)
   - Buildings: Agreement varies by city and data availability

5. RECOMMENDATIONS:
   - Use city-reported inventory as primary source when available
   - Use ClimateTrace/EDGAR to fill data gaps
   - Validate outliers with local experts
   - Document uncertainty and data quality in inventory reports
   - Consider ensemble approaches for sectors with poor agreement

6. WHEN TO USE TOP-DOWN DATA (ClimateTrace/EDGAR):
   - City inventory is incomplete or unavailable
   - Need consistent methodology across cities
   - Validating city-reported data
   - Screening-level assessments

7. WHEN TO PREFER BOTTOM-UP DATA (City Inventory):
   - Available and high quality
   - Includes local measurements
   - Detailed sector breakdown needed
   - Official reporting purposes
"""
    )


if __name__ == "__main__":
    print("\nGHG Inventory Data Validation Examples")
    print("=" * 80)
    print("\nThis script demonstrates validation of greenhouse gas inventory data")
    print("by comparing ClimateTrace, EDGAR, and city-reported emissions.\n")

    # Run examples
    try:
        example_single_sector_comparison()
        input("\nPress Enter to continue to Example 2...")

        example_full_inventory_validation()
        input("\nPress Enter to continue to Example 3...")

        example_interpret_results()

        print("\n" + "=" * 80)
        print("Examples completed!")
        print("=" * 80)
        print("\nFor more information, see:")
        print("- Paper: https://iopscience.iop.org/article/10.1088/1748-9326/acbb91")
        print("- Code: global-api/utils/data_validation.py")
        print("- Results: /tmp/ghg_validation_results.json")
        print("\n")

    except KeyboardInterrupt:
        print("\n\nExecution interrupted by user.")
    except Exception as e:
        print(f"\n\nError during execution: {e}")
        import traceback

        traceback.print_exc()
