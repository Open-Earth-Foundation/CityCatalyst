#!/bin/bash

DB_URI=$1

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

$python_cmd osm_importer.py --database_uri $DB_URI
