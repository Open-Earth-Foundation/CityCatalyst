COPY climatetrace_staging 
FROM 'raw_data/climatetrace/extracted/transportation/DATA/domestic-shipping_emissions_sources.csv' 
WITH (FORMAT CSV, HEADER);