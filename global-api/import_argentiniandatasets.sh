#!/bin/bash

if command -v python3 &>/dev/null; then
    python_cmd=python3
else
    python_cmd=python
fi

export PGPASSWORD=$CC_GLOBAL_API_DB_PASSWORD
export DB_URI="postgresql://$CC_GLOBAL_API_DB_USER:$CC_GLOBAL_API_DB_PASSWORD@$CC_GLOBAL_API_DB_HOST/$CC_GLOBAL_API_DB_NAME" 

# Argentinian
pushd importer/argentinian_datasets/BEN/
$python_cmd ./extraction_BEN_AR.py --filepath ./ 

$python_cmd ./transformation_BEN_AR.py --filepath ./ --database_uri $DB_URI 

psql -h $CC_GLOBAL_API_DB_HOST \
    -U $CC_GLOBAL_API_DB_USER \
    -d $CC_GLOBAL_API_DB_NAME \
    -f loading_BEN_AR.sql

popd

pushd importer/argentinian_datasets/ENARGAS/
$python_cmd ./transformation_ENARGAS.py --filepath ./ --database_uri $DB_URI 

psql -h $CC_GLOBAL_API_DB_HOST \
    -U $CC_GLOBAL_API_DB_USER \
    -d $CC_GLOBAL_API_DB_NAME \
    -f load_ENERGAS.sql

popd

pushd importer/argentinian_datasets/SESCO/
$python_cmd ./extraction_SESCO_AR.py --filepath ./

$python_cmd ./transformation_SESCO_AR.py --filepath ./ --database_uri $DB_URI 

psql -h $CC_GLOBAL_API_DB_HOST \
    -U $CC_GLOBAL_API_DB_USER \
    -d $CC_GLOBAL_API_DB_NAME \
    -f load_SESCO.sql

popd

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

$python_cmd ./import_dataseeder.py --database_uri $DB_URI

popd