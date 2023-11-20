# GHGRP Importer Scripts

These scripts are utilized to populate the database with Greenhouse Gas Reporting Program (GHGRP) data.

```bash
python ghgrp_importer.py --database_uri [database_uri] --file [zip file path] --log_file [.log file path]
```

The emissions data included here correspond to the `Direct Emitters` from the [EPA database](https://www.epa.gov/ghgreporting/data-sets ) 
and their were classified following the [EPA classification](https://ccdsupport.com/confluence/display/ghgp/Understanding+Facility+Types )

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

