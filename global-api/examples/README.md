# GHG Inventory Data Validation

This directory contains tools for validating and comparing greenhouse gas (GHG) emissions data from multiple sources.

## Overview

The data validation utilities enable comparison of emissions data from:
- **ClimateTrace**: Bottom-up asset-level emissions data
- **EDGAR**: Top-down gridded emissions estimates
- **City Inventories**: Self-reported city GHG inventories

This approach helps assess data quality and feasibility for GHG inventories, following methodologies outlined in academic research.

## Reference

The validation approach is based on:

**"How do IPCC estimates of urban CO2 emissions compare to inventoried estimates?"**  
Environmental Research Letters, 2023  
https://iopscience.iop.org/article/10.1088/1748-9326/acbb91

Key findings from the paper:
- Agreement between top-down (EDGAR) and bottom-up (city inventories) varies significantly
- Energy sectors generally show better agreement (CV ~ 20-40%)
- Transport shows moderate agreement (CV ~ 30-60%)
- Waste sectors often show larger discrepancies (CV > 60%)
- Local factors and data availability significantly impact accuracy

## Files

- `data_validation.py` - Core validation utilities
- `validate_ghg_data.py` - Example script demonstrating validation

## Usage

### Basic Example

```python
from utils.data_validation import validate_ghg_inventory

# Validate emissions for Rio de Janeiro in 2022
results = validate_ghg_inventory(
    locode="BRRIO",
    year=2022,
    reference_numbers=["I.1.1", "I.2.1", "II.1.1"],  # Sectors to validate
    city_inventory_path="/path/to/inventory.csv"
)

# Check overall quality
print(results['validation_summary']['overall_data_quality'])

# Check sector-specific results
for sector, comparison in results['sector_comparisons'].items():
    print(f"{sector}: {comparison['validation_metrics']['data_quality_assessment']}")
```

### Running the Example Script

```bash
cd global-api
python examples/validate_ghg_data.py
```

This will run three examples:
1. Single sector comparison across all data sources
2. Full inventory validation for multiple sectors
3. Guide to interpreting validation results

## Validation Metrics

### Coefficient of Variation (CV)

Measures agreement between data sources:
- **CV < 20%**: High agreement (reliable data)
- **CV 20-50%**: Moderate agreement (use with caution)
- **CV > 50%**: Low agreement (further investigation needed)

### Relative Difference

Compares each source to a reference (usually city inventory):
- **< 30%**: Generally acceptable
- **30-100%**: Common for some sectors
- **> 100%**: Significant discrepancy

### Data Quality Assessment

Automated classification based on CV:
- **high_agreement**: Data suitable for GHG inventory
- **moderate_agreement**: Data usable with uncertainty quantification
- **low_agreement**: Additional data sources needed

## Functions

### `get_climatetrace_emissions(locode, year, reference_number)`

Fetches ClimateTrace asset-level emissions data.

**Returns:**
```python
{
    "source": "ClimateTrace",
    "locode": "BRRIO",
    "year": 2022,
    "reference_number": "I.1.1",
    "emissions": {
        "CO2": 386998.022,
        "CH4": 186.872,
        "N2O": 1999.955,
        "CO2eq_100yr": 389184.849,
        "CO2eq_20yr": 404162.515
    },
    "num_assets": 45,
    "quality": "TBD"
}
```

### `get_edgar_emissions(locode, year, reference_number)`

Fetches EDGAR gridded emissions data.

**Returns:**
```python
{
    "source": "EDGAR",
    "locode": "BRRIO",
    "year": 2022,
    "reference_number": "I.1.1",
    "emissions": {
        "CO2": 350000.0,
        "CH4": 200.0,
        "N2O": 1800.0,
        "CO2eq_100yr": 357960.0,
        "CO2eq_20yr": 367500.0
    },
    "quality": "medium"
}
```

### `parse_city_inventory(inventory_df, reference_number)`

Parses city-reported inventory data from a DataFrame.

**Parameters:**
- `inventory_df`: pandas DataFrame with city inventory data
- `reference_number`: GPC reference number (e.g., "I.1.1")

**Returns:**
```python
{
    "source": "City Inventory",
    "reference_number": "I.1.1",
    "emissions": {
        "CO2": 386998.022,
        "CH4": 186.872,
        "N2O": 1999.955,
        "CO2eq_reported": 389184.849
    },
    "subsector_name": "Residential buildings",
    "num_entries": 1
}
```

### `compare_emissions(climatetrace_data, edgar_data, city_data)`

Compares emissions from different sources and calculates validation metrics.

**Returns:**
```python
{
    "available_sources": ["ClimateTrace", "EDGAR", "City"],
    "emissions_co2eq_100yr": {
        "ClimateTrace": 389184.849,
        "EDGAR": 357960.0,
        "City": 389184.849
    },
    "differences": {
        "ClimateTrace_vs_City": 0.0,
        "EDGAR_vs_City": -31224.849
    },
    "relative_differences": {
        "ClimateTrace_vs_City": 0.0,
        "EDGAR_vs_City": -8.02
    },
    "validation_metrics": {
        "mean_emissions": 378776.566,
        "std_deviation": 18020.449,
        "coefficient_of_variation_pct": 4.76,
        "min_emissions": 357960.0,
        "max_emissions": 389184.849,
        "range": 31224.849,
        "data_quality_assessment": "high_agreement"
    }
}
```

### `validate_ghg_inventory(locode, year, reference_numbers, city_inventory_path)`

Comprehensive validation across multiple sectors.

**Parameters:**
- `locode`: City location code (e.g., "BRRIO")
- `year`: Year of emissions (e.g., 2022)
- `reference_numbers`: List of GPC reference numbers to validate
- `city_inventory_path`: Path to city inventory CSV file (optional)

**Returns:**
```python
{
    "locode": "BRRIO",
    "year": 2022,
    "validation_summary": {
        "sectors_analyzed": 5,
        "sectors_with_data": 5,
        "sectors_with_multiple_sources": 4,
        "overall_data_quality": "high"
    },
    "sector_comparisons": {
        "I.1.1": {...},
        "I.2.1": {...},
        ...
    }
}
```

## Best Practices

### When to Use Top-Down Data (ClimateTrace/EDGAR)
- City inventory is incomplete or unavailable
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

Large discrepancies between sources may indicate:
1. **Methodological differences**: Different emission factors or activity data
2. **Boundary differences**: Geographic or sectoral scope variations
3. **Temporal misalignment**: Different reference periods
4. **Data quality issues**: Measurement errors or outdated data
5. **Missing sources**: Incomplete inventories

### Recommendations

1. **Triangulate data**: Use multiple sources to build confidence
2. **Document uncertainty**: Report data quality and limitations
3. **Validate outliers**: Investigate large discrepancies with local experts
4. **Update regularly**: Emissions profiles change over time
5. **Use ensemble approaches**: Combine sources for sectors with poor agreement

## Testing

Run tests for the validation utilities:

```bash
cd global-api
pytest tests/test_data_validation.py
```

## Contributing

When adding new data sources or validation methods:
1. Update `data_validation.py` with new functions
2. Add examples to `validate_ghg_data.py`
3. Update this README with documentation
4. Add tests for new functionality

## Related Resources

- [CityCatalyst Global API Documentation](../README.md)
- [GPC Reference Guide](https://ghgprotocol.org/greenhouse-gas-protocol-accounting-reporting-standard-cities)
- [ClimateTrace Data](https://climatetrace.org/)
- [EDGAR Database](https://edgar.jrc.ec.europa.eu/)
