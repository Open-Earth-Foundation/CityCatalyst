# GHGRP Importer Scripts

These scripts are utilized to populate the database with Greenhouse Gas Reporting Program (GHGRP) data.

```bash
python ./importer/ghgrp_epa/ghgrp_importer.py --database_uri [database_uri] --file [zip file path] --log_file [.log file path]
```

The emissions data included here correspond to the `Direct Emitters` from the [EPA database](https://www.epa.gov/ghgreporting/data-sets )
and their were classified following the [EPA classification](https://ccdsupport.com/confluence/display/ghgp/Understanding+Facility+Types )

### Loader

The transformation and the load are now separate. To load the data, run the following command:

```bash
psql -U ccglobal ccglobal -f ghgrp_epa_load.sql
```

### EPA Methodology

The EPA classifies facilities based on nine different industry groups, and these facilities report their direct emissions from 23 different facility-level processes.

Some facilities have multiple proccesses that generate GHG emissions, so they would be included in all industry groups to which it belongs.

How classify them?

If a facility reports emissions from a single activity, it is included in that specific industry group.
If a facility reports emissions from a single activity plus stationary combustion, the emissions from stationary energy are added to the single activity value, and then it is included in that specific industry group.
If a facility reports emissions from multiple activities plus stationary combustion, the emissions from stationary combustion are added to the activity with the maximum value of emissions. Then, it is included in that specific industry group, and the other values are classified into their respective industry groups.

### Facility emissions data in CityCatalyst

The emissions reported by the facilities in the GHGRP had to be adapted to the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (GPC) format.

The emissions from stationary combustion were assigned following the EPA methodology, and the sectors from the EPA were matched with the GPC sectors based on different conditions (see the utils.py file). When there was not enough clarity on how to classify the emissions of some facilities, they were not added to the database.

The following classification was made to match the final sectors from GHGRP with the GPC sectors and subsectors:

gpc_classification = {
    'subpart_name': {
        'Adipic Acid Production': {'gpc_refno': 'IV.1'},
        'Aluminum Production': {'gpc_refno': 'IV.1'},
        'Ammonia Manufacturing': {'gpc_refno': 'IV.1'},
        'Cement Production': {'gpc_refno': 'IV.1'},
        'Electricity Generation': {
            'final_sector': {
                'Power Plants': {'gpc_refno': 'I.4.4'},
                'Waste': {'gpc_refno': 'I.4.4'},
                'Minerals': {'gpc_refno': 'I.4.1'},
                'Other': {'gpc_refno': 'I.4.1'},
                'Chemicals': {'gpc_refno': 'I.4.1'},
                'Metals': {'gpc_refno': 'I.4.1'},
                'Pulp and Paper': {'gpc_refno': 'I.4.1'},
                'Petroleum and Natural Gas Systems': {'gpc_refno': 'I.4.1'},
                'Petroleum Product Suppliers': {'gpc_refno': 'I.4.1'},
                'Injection of CO2': {'gpc_refno': 'I.4.1'},
                'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno': 'I.4.1'},
                'Refineries': {'gpc_refno': 'I.4.1'},
                'Import and Export of Equipment Containing Fluorinated GHGs': {'gpc_refno': 'I.4.1'},
                'Industrial Gas Suppliers': {'gpc_refno': 'I.4.1'}
            }
        },
        'Electronics Manufacture': {'gpc_refno': 'IV.1'},
        'Ferroalloy Production': {'gpc_refno': 'IV.1'},
        'Fluorinated GHG Production': {'gpc_refno': 'IV.1'},
        'Glass Production': {'gpc_refno': 'IV.1'},
        'HCFC–22 Production from HFC–23 Destruction': {'gpc_refno': 'IV.1'},
        'Hydrogen Production': {'gpc_refno': 'IV.1'},
        'Industrial Waste Landfills': {
            'final_sector': {
                'Waste': {'gpc_refno': 'III.1.1'},
                'Power Plants': {'gpc_refno': 'III.1.1'},
                'Minerals': {'gpc_refno': 'III.1.1'},
                'Other': {'gpc_refno': 'III.1.1'},
                'Chemicals': {'gpc_refno': 'III.1.1'},
                'Metals': {'gpc_refno': 'III.1.1'},
                'Pulp and Paper': {'gpc_refno': 'III.1.1'},
                'Petroleum and Natural Gas Systems': {'gpc_refno': 'III.1.1'},
                'Petroleum Product Suppliers': {'gpc_refno': 'III.1.1'},
                'Injection of CO2': {'gpc_refno': 'III.1.1'},
                'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno': 'III.1.1'},
                'Refineries': {'gpc_refno': 'III.1.1'},
                'Import and Export of Equipment Containing Fluorinated GHGs': {'gpc_refno': 'III.1.1'},
                'Industrial Gas Suppliers': {'gpc_refno': 'III.1.1'}
            }
        },
        'Industrial Wastewater Treatment': {
            'final_sector': {
                'Waste': {'gpc_refno': 'III.4.1'},
                'Power Plants': {'gpc_refno': 'III.4.1'},
                'Minerals': {'gpc_refno': 'III.4.1'},
                'Other': {'gpc_refno': 'III.4.1'},
                'Chemicals': {'gpc_refno': 'III.4.1'},
                'Metals': {'gpc_refno': 'III.4.1'},
                'Pulp and Paper': {'gpc_refno': 'III.4.1'},
                'Petroleum and Natural Gas Systems': {'gpc_refno': 'III.4.1'},
                'Petroleum Product Suppliers': {'gpc_refno': 'III.4.1'},
                'Injection of CO2': {'gpc_refno': 'III.4.1'},
                'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno': 'III.4.1'},
                'Refineries': {'gpc_refno': 'III.4.1'},
                'Import and Export of Equipment Containing Fluorinated GHGs': {'gpc_refno': 'III.4.1'},
                'Industrial Gas Suppliers': {'gpc_refno': 'III.4.1'}
            }
        },
        'Iron and Steel Production': {'gpc_refno': 'IV.1'},
        'Lead Production': {'gpc_refno': 'IV.1'},
        'Lime Production': {'gpc_refno': 'IV.1'},
        'Magnesium Production': {'gpc_refno': 'IV.1'},
        'Manufacture of Electric Transmission and Distribution Equipment': {'gpc_refno': 'IV.1'},
        'Miscellaneous Use of Carbonates': {'gpc_refno': 'IV.1'},
        'Municipal Landfills': {
            'final_sector': {
                'Waste': {'gpc_refno': 'III.1.1'},
                'Power Plants': {'gpc_refno': 'III.1.1'},
                'Minerals': {'gpc_refno': 'III.1.1'},
                'Other': {'gpc_refno': 'III.1.1'},
                'Chemicals': {'gpc_refno': 'III.1.1'},
                'Metals': {'gpc_refno': 'III.1.1'},
                'Pulp and Paper': {'gpc_refno': 'III.1.1'},
                'Petroleum and Natural Gas Systems': {'gpc_refno': 'III.1.1'},
                'Petroleum Product Suppliers': {'gpc_refno': 'III.1.1'},
                'Injection of CO2': {'gpc_refno': 'III.1.1'},
                'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno': 'III.1.1'},
                'Refineries': {'gpc_refno': 'III.1.1'},
                'Import and Export of Equipment Containing Fluorinated GHGs': {'gpc_refno': 'III.1.1'},
                'Industrial Gas Suppliers': {'gpc_refno': 'III.1.1'}
            }
        },
        'Nitric Acid Production': {'gpc_refno': 'IV.1'},
        'Petrochemical Production': {'gpc_refno': 'IV.1'},
        'Petroleum Refining': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – LNG Import/Export': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – LNG Storage': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Offshore Production': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Processing': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Transmission/Compression': {'gpc_refno': 'I.8.1'},
        'Petroleum and Natural Gas Systems – Underground Storage': {'gpc_refno': 'I.8.1'},
        'Phosphoric Acid Production': {'gpc_refno': 'IV.1'},
        'Pulp and Paper Manufacturing': {'gpc_refno': 'IV.1'},
        'Silicon Carbide Production': {'gpc_refno': 'IV.1'},
        'Soda Ash Manufacturing': {'gpc_refno': 'IV.1'},
        'Stationary Combustion': {
            'final_sector': {
                'Waste': {'gpc_refno': 'III.3.1'},
                'Power Plants': {'gpc_refno': 'I.4.1'},
                'Chemicals': {'gpc_refno': 'I.3.1'},
                'Metals': {'gpc_refno': 'I.3.1'},
                'Minerals': {'gpc_refno': 'I.3.1'},
                'Pulp and Paper': {'gpc_refno': 'I.3.1'},
                'Refineries': {'gpc_refno': 'I.3.1'},
                'Other': {'gpc_refno': 'I.6.1'},
                'Petroleum and Natural Gas Systems': {'gpc_refno': 'I.8.1'},
                'Petroleum Product Suppliers': {'gpc_refno': 'I.7.1'},
                'Injection of CO2': {'gpc_refno': 'I.7.1'},
                'Natural Gas and Natural Gas Liquids Suppliers': {'gpc_refno': 'I.7.1'},
                'Refineries': {'gpc_refno': 'I.8.1'},
                'Import and Export of Equipment Containing Fluorinated GHGs': {'gpc_refno': 'I.7.1'},
                'Industrial Gas Suppliers': {'gpc_refno': 'I.7.1'}
            }
        },
        'Titanium Dioxide Production': {'gpc_refno': 'IV.1'},
        'Underground Coal Mines': {'gpc_refno': 'IV.1'},
        'Zinc Production': {'gpc_refno': 'IV.1'}
    }
}
