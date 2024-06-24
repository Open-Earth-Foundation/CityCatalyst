# Carbon Footprint - GHG Factors for International Grid Electricity

The international country-level grid electricity factors are designed for organizations reporting their carbon emissions. Carbon Footprint Ltd has compiled these emission factors from various sources, making it easier for organizations and individuals to measure and report their emissions from international electricity consumption.

Carbon emissions per kWh of electricity vary by country, depending on the fuels used to generate the energy. Countries that rely heavily on fossil fuels for electricity production generally have higher carbon emissions per unit of electricity compared to those that use more renewable or nuclear energy.

1. Extract the raw data from the source [GHG Factors for International Grid Electricity](https://www.carbonfootprint.com/international_electricity_factors.html):
```bash
python ./extraction.py
```
2. Clean the raw data:
```bash
python ./clean_raw_data.py
```
3. Load the cleaned raw data into a new table:
[....]

### Directory tree
```sh
.
├── README.md                  # top level readme
├── extraction.py              # extraction script
├── clean_raw_data.py          # transformation script
└── loading_raw_data.py        # loading script    
```