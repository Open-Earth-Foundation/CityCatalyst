#!/bin/bash

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

export PGPASSWORD=$CC_GLOBAL_API_DB_PASSWORD
export DB_URI="postgresql://$CC_GLOBAL_API_DB_USER:$CC_GLOBAL_API_DB_PASSWORD@$CC_GLOBAL_API_DB_HOST/$CC_GLOBAL_API_DB_NAME"

# export DB_URI="postgresql://ccglobal:@localhost/ccglobal"
# export CC_GLOBAL_API_DB_HOST="localhost" 
# export CC_GLOBAL_API_DB_USER="ccglobal" 
# export CC_GLOBAL_API_DB_NAME="ccglobal" 

# Argentinian



































# load cammesa

pushd importer/argentinian_datasets/cammesa/

$python_cmd ./transformation_cammesa.py --filepath ./ --database_uri $DB_URI 

psql -h $CC_GLOBAL_API_DB_HOST \
    -U $CC_GLOBAL_API_DB_USER \
    -d $CC_GLOBAL_API_DB_NAME \
    -f load_cammesa.sql

popd

# Import datasources

pushd importer/datasource_seeder
psql -h $CC_GLOBAL_API_DB_HOST \
   -U $CC_GLOBAL_API_DB_USER \
   -d $CC_GLOBAL_API_DB_NAME \
   -f ./import_datasource_seeder.sql
popd