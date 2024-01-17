/* Create a staging table */

CREATE TEMP TABLE IF NOT EXISTS ghgrp_epa_staging (LIKE ghgrp_epa INCLUDING ALL);

/* Clear the staging table */

TRUNCATE ghgrp_epa_staging;

/* Load the staging table from the downloaded file */

\copy ghgrp_epa_staging (id,facility_id,facility_name,city,state,county,latitude,longitude,locode,geometry,subpart_name,subparts,sectors,final_sector,"GPC_ref_no",gas,emissions_quantity,emissions_quantity_units,"GWP_ref",year) FROM 'epa.csv' WITH CSV HEADER;

/* Update the main table with the staging table */

INSERT INTO ghgrp_epa (id,facility_id,facility_name,city,state,county,latitude,longitude,locode,geometry,subpart_name,subparts,sectors,final_sector,"GPC_ref_no",gas,emissions_quantity,emissions_quantity_units,"GWP_ref",year)
    SELECT id,facility_id,facility_name,city,state,county,latitude,longitude,locode,geometry,subpart_name,subparts,sectors,final_sector,"GPC_ref_no",gas,emissions_quantity,emissions_quantity_units,"GWP_ref",year
    FROM ghgrp_epa_staging
    ON CONFLICT ON CONSTRAINT ghgrp_epa_pkey
    DO UPDATE SET
        facility_id = excluded.facility_id,
        facility_name = excluded.facility_name,
        city = excluded.city,
        state = excluded.state,
        county = excluded.county,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        locode = excluded.locode,
        geometry = excluded.geometry,
        subpart_name = excluded.subpart_name,
        subparts = excluded.subparts,
        sectors = excluded.sectors,
        final_sector = excluded.final_sector,
        "GPC_ref_no" = excluded."GPC_ref_no",
        gas = excluded.gas,
        emissions_quantity = excluded.emissions_quantity,
        emissions_quantity_units = excluded.emissions_quantity_units,
        "GWP_ref" = excluded."GWP_ref",
        year = excluded.year;

/* Drop the staging table */

DROP TABLE ghgrp_epa_staging;
