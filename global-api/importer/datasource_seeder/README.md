# Datasource catalogue

This is a catalogue of datasources that are available for use by CityCatalyst.

- `datasource_seeder.csv` includes all the datasources. Add new ones at the end.
- `import_datasource_seeder.sql` imports the `datasource_seeder.csv` file into the database. It will update existing records and add new ones. You can run it like this:

```bash
psql -U ccglobal -d ccglobal -f import_datasource_seeder.sql
```
## Datasource catalogue structure

- `datasource_id`: unique UUID for the datasource
- `publisher_id`: abbreviation of the original name of the datasource (eg: EPA)
- `name`: complete name of the datasource (eg: Environmental Protection Agency)
- `description`: brief description of the dataset from the datasource
- `source_type`: [?]
- `access_type`: the type of access the data (eg: free, paid, etc)
- `URL`: the link where the data was accessed
- `geographical_location`: it contains the geographical coverage of the data (eg: AR for Argentina data, EARTH for international datasources with global coverage)
- `start_year`: data start date
- `end_year`: data end date
- `latest_accounting_year`: last year imported into the database
- `frequency_of_update`: how often the data is updated (eg: annually, monthly, etc)
- `spatial_resolution`: how the data is spatially represented (eg: point source, city, country, 0.1 degree, etc)
- `language`: original language of the dataset
- `accessibility`: [?]
- `data_quality`: quality of the data based on the GPC classification (low, medium, high)
- `notes`: extra information about the dataset (eg: brief description of the methodology applied to obtain emission values when the raw data is activity data)
- `units`: units of the emissions
- `methodology_url`: link to the methodology on how the data was obtained by the source
- `retrieval_method`: method used by CityCatalyst to access the data from the database
- `api_endpoint`: Global API endpoint to access the data
- `gpc_reference_number`: Sub-sector reference number from the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (GPC)
