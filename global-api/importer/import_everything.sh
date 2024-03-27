#!/bin/bash

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

export PGPASSWORD=$CC_GLOBAL_API_DB_PASSWORD
export DB_URI="postgresql://$CC_GLOBAL_API_DB_USER:$CC_GLOBAL_API_DB_PASSWORD@$CC_GLOBAL_API_DB_HOST/$CC_GLOBAL_API_DB_NAME"

# A script to import all of our data into the Global API database

# Import OSM

# Import Carbon Monitor

pushd carbon_monitor
$python_cmd importer.py \
  --database_uri $DB_URI \
  --file ./processed/carbon-monitor-cities-all-cities-FUA-v0325_processed.csv
popd

# Import Climate Trace

pushd climatetrace
$python_cmd climatetrace_importer.py \
  --database_uri $DB_URI \
  --file ./climatetrace_data.tar.gz
$python_cmd climatetrace_importer_road_transportation.py \
  --database_uri $DB_URI \
  --file ./climatetrace_data.tar.gz
popd

# Import Crosswalk Labs

# Import EDGAR

# Import EPA

pushd ghgrp_epa
$python_cmd ./ghgrp_importer.py \
  --file ./2022_data_summary_spreadsheets_0.zip \
  --output ./epa.csv \
  --apibase $CC_GLOBAL_API_BASE
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./ghgrp_epa_load.sql
popd

# Import IEA

pushd IEA_energy
$python_cmd ./IEA_energy_transformation.py
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./IEA_energy_load.sql
popd

# Import Mendoza

pushd mendoza_arg
mkdir -p data
$python_cmd ./extraction_mendoza_stationary_energy.py --filepath data
$python_cmd ./transformation_mendoza_stationary_energy.py --filepath data
popd
pushd ..
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./importer/mendoza_arg/load_mendoza_stationary_energy.sql
popd

# Import datasources

pushd datasource_seeder
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./import_datasource_seeder.sql
popd
