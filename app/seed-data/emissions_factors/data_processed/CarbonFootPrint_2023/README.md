# Carbon Foot Print

## Data cleaning and transformation
- Click [here](https://www.carbonfootprint.com/docs/2023_07_international_factors_release_11.xlsx) to access the raw data

**Transformations**:
- Add UN/LOCODE Code when it applies
- Assign GPC reference number
    - Grid Supply Energy Consumed category was assign to every scope 2 reference number in Stationary Energy and Transportation
    - Grid Supply Energy Consumed category was assign to every scope 3 reference number in Stationary Energy and Transportation
- The original EF are in CO2e, to provide more glanularity the following assumptions were made to extract EF for `CO2`, `CH4`, `N2O`:
    - portion that correspond to CO2: 0.8
    - portion that correspond to CH4: 0.15
    - portion that correspond to N2O: 0.05
- and then, GWP AR6 where applied:
    - GWP_CO2: 1
    - GWP_CH4: 29.8
    - GWP_N2O: 273
- Assing the year (2021 for all the EFs)

**Note**:
The emission factor for grid supply can change each year, at this time the year available is only 2021, so these emission factors could be used for all necessary years as default factors until more versions are available .