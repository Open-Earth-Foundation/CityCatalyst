GRANT pg_read_server_files TO ccglobal;

COPY raw_data.climatetrace_staging FROM 'raw_data/climatetrace/extracted/transportation/DATA/domestic-shipping_emissions_sources_confidence.csv' WITH (FORMAT csv);