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

pushd importer/osm
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./osm_geometry_import.sql
popd

# Import Carbon Monitor

pushd importer/carbon_monitor
$python_cmd importer.py \
  --database_uri $DB_URI \
  --file ./processed/carbon-monitor-cities-all-cities-FUA-v0325_processed.csv
popd

# Import Climate Trace

pushd importer/climatetrace
$python_cmd climatetrace_importer.py \
  --database_uri $DB_URI \
  --file ./climatetrace_data.tar.gz
$python_cmd climatetrace_importer_road_transportation.py \
  --database_uri $DB_URI \
  --file ./climatetrace_data.tar.gz
popd

# Import Crosswalk Labs

# Import EDGAR

pushd importer/edgar
$python_cmd citycelloverlapedgar_importer.py --database_uri $DB_URI
$python_cmd gridcellemissionsedgar_importer.py --database_uri $DB_URI
popd

# Import EPA

pushd importer/ghgrp_epa
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

pushd importer/IEA_energy
$python_cmd ./IEA_energy_transformation.py
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./IEA_energy_load.sql
popd

# Import Mendoza stationary energy

pushd importer/mendoza_arg
mkdir -p data
$python_cmd ./extraction_mendoza_stationary_energy.py --filepath data
$python_cmd ./transformation_mendoza_stationary_energy.py --filepath data
popd
pushd importer/..
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./importer/mendoza_arg/load_mendoza_stationary_energy.sql
popd

# Import Google EIE

pushd importer/google_EIE
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./load_transportation_Mendoza.sql
popd

# Import datasources

pushd importer/datasource_seeder
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./import_datasource_seeder.sql
popd

# import custom polygons
pushd importer/custom_polygons
$python_cmd custom_polygon_importer.py \
  --database_uri $DB_URI \
  --zip_file_path "./Limites Ciudad-001.zip" \
  --extract_to_path "./processed"
popd