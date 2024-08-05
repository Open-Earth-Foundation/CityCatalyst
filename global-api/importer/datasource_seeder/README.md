# Datasource catalogue

This is a catalogue of datasources that are available for use by CityCatalyst.

- `datasource_seeder.csv` includes all the datasources. Add new ones at the end.
- `import_datasource_seeder.sql` imports the `datasource_seeder.csv` file into the database. It will update existing records and add new ones. You can run it like this:

```bash
python3 import_dataseeder.py --database_uri postgresql://ccglobal:@localhost/ccglobal
```

## Datasource catalogue structure

- `datasource_id`: unique UUID for the datasource
- `publisher_id`: abbreviation of the original name of the datasource (eg: EPA)
- `datasource_name`: complete name of the datasource (eg: Environmental Protection Agency)
- `dataset_name`: dataset name assign after transformation phase (eg. Manufacturing Industries and Construction Direct Emitters reported in the Greenhouse Gas Reporting Program)
- `dataset_description`: brief description of the dataset from the datasource
- `source_type`: should always be set to `third_party` for the global API. This is set to `user` for user-supplied data.
- `access_type`: the type of access the data (eg: free, paid, etc)
- `dataset_url`: the link where the data was accessed
- `geographical_location`: it contains the geographical coverage of the data (eg: AR for Argentina data, EARTH for international datasources with global coverage)
- `start_year`: data start date
- `end_year`: data end date
- `latest_accounting_year`: last year imported into the database
- `frequency_of_update`: how often the data is updated (eg: annually, monthly, etc)
- `spatial_resolution`: how the data is spatially represented (eg: point source, city, country, 0.1 degree, etc)
- `language`: original language of the dataset
- `accessibility`: if this data source can be publicly accessed or requires special access privileges (e.g. `public`, `private`, `paid`)
- `data_quality`: quality of the data based on the GPC classification (low, medium, high)
- `notes`: extra information about the dataset
- `units`: units of the emissions
- `methodology_description`: description of the methodology on how the data was obtained by the source
- `methodology_url`: link to the methodology on how the data was obtained by the source (when it is available)
- `transformation_description`: the type of transformation that has been done to the raw data, the assumptions that were made, emission factors that were applied, etc 
- `retrieval_method`: method used by CityCatalyst to access the data from the database
- `api_endpoint`: Global API endpoint to access the data
- `gpc_reference_number`: sub-sector reference number from the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (GPC)
- `scope`: the scope for which it includes data within the subsector 
