#!/bin/bash

DB_URI=$1
FILE=$(PWD)/processed/carbon-monitor-cities-all-cities-FUA-v0325_processed.csv

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

$python_cmd importer.py --database_uri $DB_URI --file $FILE
