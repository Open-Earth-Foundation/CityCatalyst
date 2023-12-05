#!/bin/bash

export DB_URI=$1
export CC_GLOBAL_API_BASE_URL=$2

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

$python_cmd climatetrace_seeder.py --database_uri $DB_URI --base_url $CC_GLOBAL_API_BASE_URL
$python_cmd edgar_seeder.py --database_uri $DB_URI --base_url $CC_GLOBAL_API_BASE_URL
