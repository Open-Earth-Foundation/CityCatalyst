# GHG Inventory Data Validation - Implementation Summary

## Overview

This implementation provides tools for validating and comparing greenhouse gas (GHG) emissions data from multiple sources to assess data quality and feasibility for GHG inventories.

## Problem Statement

Cities need to validate third-party emissions data sources (ClimateTrace, EDGAR) against city-reported inventories to:
- Assess data quality and reliability
- Identify gaps in inventory coverage
- Understand discrepancies between different methodologies
- Make informed decisions about which data sources to use

## Solution

Implemented a comprehensive validation framework in the `global-api` directory that:

1. **Fetches data from multiple sources:**
   - ClimateTrace (asset-level, bottom-up)
   - EDGAR (gridded, top-down)
   - City inventories (official reports)

2. **Compares emissions data:**
   - Calculates differences and relative differences
   - Computes statistical metrics (mean, std dev, CV)
   - Provides automated quality assessments

3. **Generates actionable insights:**
   - Data quality classification (high/moderate/low agreement)
   - Interpretation guidance
   - Best practice recommendations

## Implementation Details

### Files Created

1. **`global-api/utils/data_validation.py`** (462 lines)
   - Core validation utilities
   - Database query functions
   - Comparison and statistical analysis

2. **`global-api/examples/validate_ghg_data.py`** (277 lines)
   - Full demonstration with database access
   - Three example scenarios
   - Interpretation guide

3. **`global-api/examples/demo_validation.py`** (180 lines)
   - Simple demo with sample data (no database required)
   - Shows complete validation workflow
   - Clear output formatting

4. **`global-api/examples/README.md`** (350 lines)
   - Comprehensive documentation
   - Usage examples
   - Best practices
   - Function reference

5. **`global-api/tests/test_data_validation.py`** (260 lines)
   - 13 unit tests covering all functions
   - Mock database for testing
   - All tests passing

### Key Functions

#### `get_climatetrace_emissions(locode, year, reference_number)`
Fetches ClimateTrace asset-level emissions data from the database.

**Returns:** Dictionary with emissions by gas, CO2eq calculations, and metadata.

#### `get_edgar_emissions(locode, year, reference_number)`
Fetches EDGAR gridded emissions data from the database.

**Returns:** Dictionary with emissions by gas and CO2eq calculations.

#### `parse_city_inventory(inventory_df, reference_number)`
Parses city-reported inventory data from a CSV DataFrame.

**Returns:** Dictionary with sector emissions and metadata.

#### `compare_emissions(climatetrace_data, edgar_data, city_data)`
Compares emissions from different sources and calculates validation metrics.

**Returns:** Dictionary with:
- Available sources
- Emissions by source
- Differences and relative differences
- Validation metrics (mean, std dev, CV)
- Data quality assessment

#### `validate_ghg_inventory(locode, year, reference_numbers, city_inventory_path)`
Comprehensive validation across multiple sectors.

**Returns:** Dictionary with validation summary and sector-by-sector results.

### Validation Metrics

**Coefficient of Variation (CV):**
- CV < 20%: High agreement (reliable data)
- CV 20-50%: Moderate agreement (use with caution)
- CV > 50%: Low agreement (further investigation needed)

**Relative Difference:**
- < 30%: Generally acceptable
- 30-100%: Common for some sectors
- > 100%: Significant discrepancy

## Scientific Basis

This implementation follows the methodology described in:

**"How do IPCC estimates of urban CO2 emissions compare to inventoried estimates?"**  
Creutzig et al., Environmental Research Letters, 2023  
https://iopscience.iop.org/article/10.1088/1748-9326/acbb91

Key findings from the paper:
- Agreement varies significantly by sector and city
- Energy sectors show better agreement (CV ~ 20-40%)
- Transport shows moderate agreement (CV ~ 30-60%)
- Waste sectors often show larger discrepancies (CV > 60%)
- Local factors significantly impact accuracy

## Example Output

```
================================================================================
Validation Results:
================================================================================

Available sources: ClimateTrace, EDGAR, City

Emissions by Source (tonnes CO2eq):
  ClimateTrace   :         389,185
  EDGAR          :         357,960
  City           :         389,185

Relative Differences from City Inventory (%):
  ClimateTrace_vs_City          :        0.0%
  EDGAR_vs_City                 :       -8.0%

Validation Metrics:
  Mean emissions:                   378,777 tonnes CO2eq
  Standard deviation:                14,720 tonnes CO2eq
  Coefficient of variation:             3.9%
  Range (max - min):                 31,225 tonnes CO2eq

  Data quality assessment: HIGH_AGREEMENT
```

## Usage Examples

### Basic Usage

```python
from utils.data_validation import validate_ghg_inventory

# Validate emissions for Rio de Janeiro in 2022
results = validate_ghg_inventory(
    locode="BRRIO",
    year=2022,
    reference_numbers=["I.1.1", "I.2.1", "II.1.1"],
    city_inventory_path="/path/to/inventory.csv"
)

# Check overall quality
print(results['validation_summary']['overall_data_quality'])
```

### Running the Demo

```bash
cd global-api
python3 examples/demo_validation.py
```

## Testing

All tests pass successfully:

```bash
cd global-api
pytest tests/test_data_validation.py -v

# Result: 13 passed, 3 warnings
```

Test coverage:
- ClimateTrace emissions retrieval (2 tests)
- EDGAR emissions retrieval (2 tests)
- City inventory parsing (2 tests)
- Emissions comparison (4 tests)
- Full inventory validation (1 test)
- GWP constants (2 tests)

## Code Quality

- ✅ All tests passing
- ✅ Formatted with black
- ✅ No security vulnerabilities (CodeQL)
- ✅ Follows existing code patterns
- ✅ Comprehensive documentation

## Best Practices

### When to Use Top-Down Data (ClimateTrace/EDGAR)
- City inventory incomplete or unavailable
- Need consistent methodology across cities
- Validating city-reported data
- Screening-level assessments
- Gap-filling for missing sectors

### When to Prefer Bottom-Up Data (City Inventory)
- Available and high quality
- Includes local measurements
- Detailed sector breakdown needed
- Official reporting purposes
- Local policy decisions

### Interpreting Discrepancies

Large discrepancies may indicate:
1. Methodological differences
2. Geographic boundary differences
3. Temporal misalignment
4. Data quality issues
5. Missing emission sources

## Future Enhancements

Potential improvements:
1. Add API endpoint for validation results
2. Create visualization dashboard
3. Support additional data sources (CDP, ICLEI)
4. Implement time-series validation
5. Add sector-specific validation rules
6. Generate PDF reports

## Impact

This implementation enables:
- **Cities** to validate third-party emissions data
- **Researchers** to assess data quality systematically
- **Policy makers** to make data-driven decisions
- **Inventory managers** to identify data gaps

## Conclusion

This implementation successfully addresses the issue requirements by:
1. ✅ Comparing ClimateTrace data against city inventories
2. ✅ Including EDGAR data in comparisons
3. ✅ Following scientific methodology from referenced paper
4. ✅ Providing clear examples and documentation
5. ✅ Including comprehensive tests

The validation tools are production-ready and can be integrated into the CityCatalyst workflow.
