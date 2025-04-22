DROP table if exists data_coverage;

create table data_coverage (locode varchar(16) not null, gpc_reference_number varchar(8) not null, publisher_id varchar(32) not null, year int not null, total bigint null, primary key (locode, gpc_reference_number, publisher_id, year));

/* Most city-wide emissions */

insert into data_coverage (locode, gpc_reference_number, publisher_id, year, total) select locode, "GPC_refno" as gpc_reference_number, source_name as publisher_id, year, sum(emissions_value) as total from citywide_emissions group by locode, "GPC_refno", source_name, year;

/* ClimateTrace */

insert into data_coverage (locode, year, gpc_reference_number, publisher_id, total) select locode, date_part('year', start_time) as year, reference_number as gpc_reference_number, 'ClimateTrace' as publisher_id, sum(emissions_quantity) as total from asset where locode is not null group by locode, date_part('year', start_time), reference_number;

/* EPA */

insert into data_coverage(locode, year, gpc_reference_number, publisher_id, total) select locode, CAST(year as INT), "GPC_ref_no" as gpc_reference_number, 'EPA' as publisher_id, sum(emissions_quantity) as total from ghgrp_epa group by locode, year, "GPC_ref_no";

/* EDGAR */

insert into data_coverage(locode, year, gpc_reference_number, publisher_id, total) select locode, year, reference_number as gpc_reference_number, 'EDGAR' as publisher_id, sum(emissions_quantity * fraction_in_city) as total from "CityCellOverlapEdgar" ccoe join "GridCellEmissionsEdgar" gcee on ccoe.cell_lat = gcee.cell_lat and ccoe.cell_lon = gcee.cell_lon group by locode, year, reference_number;

/* Scaled by country (e.g. IEA) */

insert into data_coverage(locode, year, gpc_reference_number, publisher_id, total)
select locode, country_code.year as year, "GPC_refno" as gpc_reference_number, source_name as publisher_id, ROUND((CAST(p1.population as float)/CAST(p2.population as float)) * CAST(emissions_value as float)) as total from dim_geography geography, population p1, population p2, country_code where geography.locode = p1.actor_id and geography.country = p2.actor_id and p1.year = p2.year and p2.year = country_code.year and geography.country = country_code.country_code;

/* Scaled by region (e.g. Argentina) */

insert into data_coverage(locode, year, gpc_reference_number, publisher_id, total)
select locode, regionwide_emissions.year as year, "GPC_refno" as gpc_reference_number, source_name as publisher_id, ROUND((CAST(p1.population as float)/CAST(p2.population as float)) * CAST(emissions_value as float)) as total from dim_geography geography, population p1, population p2, regionwide_emissions where geography.locode = p1.actor_id and geography.region = p2.actor_id and p1.year = p2.year and p2.year = regionwide_emissions.year and geography.region = regionwide_emissions.region_code;
