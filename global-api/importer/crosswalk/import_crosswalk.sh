#!/bin/bash

DB_URI=$1

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

$python_cmd crosswalk_grid_importer.py --database_uri $DB_URI
$python_cmd crosswalk_data_importer.py --database_uri $DB_URI
$python_cmd ccrosswalk_city_data_importer.py --database_uri $DB_URI
