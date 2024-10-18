import csv
import duckdb
import math
import os
import pandas as pd
import numpy as np
from pathlib import Path
import re
import statistics
from utils import (
    make_dir,
    write_dic_to_csv,
    uuid_generate_v3,
    uuid_generate_v4,
    get_filename,
    set_seed,
    string_to_hash,
)

if __name__ == "__main__":
    # set random.seed so UUID is reproducible
    #! assumes records always generated in same order
    seed_string = get_filename()
    seed_value = string_to_hash(seed_string)
    set_seed(seed_value)

    # output directory
    output_dir = "../data_processed/EFDB_2006_IPCC_guidelines/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/EFDB_2006_IPCC_guidelines/EFDB_output.xlsx"
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "name": "IPCC",
        "URL": "https://www.ipcc.ch/",
    }
    publisher_data["publisher_id"] = uuid_generate_v3(name=publisher_data.get("name"))

    write_dic_to_csv(output_dir, "Publisher", publisher_data)

    # =================================================================
    # DataSource
    # =================================================================
    datasource_data = {
        "datasource_name": "IPCC",
        "dataset_name": "IPCC Emission Factor Database (EFDB) [2006 IPCC Guidelines]",
        "URL": "https://www.ipcc-nggip.iges.or.jp/EFDB/main.php",
        "publisher_id": publisher_data.get("publisher_id"),
    }
    datasource_data["datasource_id"] = uuid_generate_v3(
        name=datasource_data.get("dataset_name")
    )

    write_dic_to_csv(output_dir, "DataSource", datasource_data)

    # =================================================================
    # Methodology
    # =================================================================
    methodologies = [
            "methane-commitment-solid-waste-inboundary-methodology",
            "first-order-of-decay-solid-waste-inboundary-methodology",
            "methane-commitment-solid-waste-outboundary-methodology",
            "first-order-of-decay-solid-waste-outboundary-methodology",
            "biological-treatment-inboundary-methodology",
            "biological-treatment-outboundary-methodology",
            "incineration-waste-inboundary-methodology",
            "incineration-waste-outboundary-methodology",
            "wastewater-inside-domestic-calculator-activity",
            "wastewater-outside-domestic-calculator-activity",
            "wastewater-inside-industrial-calculator-activity",
            "wastewater-outside-industrial-calculator-activity"
        ]

    methodology_data_list = []

    for methodology in methodologies:
            methodology_data = {
                "methodology_id": uuid_generate_v3(methodology),
                "methodology": methodology,
                "methodology_url": "",  # Add the URL if needed
                "datasource_id": datasource_data.get("datasource_id")
            }
            methodology_data_list.append(methodology_data)

    # Write data to CSV
    write_dic_to_csv(output_dir, "Methodology", methodology_data_list)

    # =================================================================
    # Formula Input Values
    # =================================================================
    conn = duckdb.connect(':memory:')

    query = f"""
            INSTALL spatial;
			LOAD spatial;

             CREATE OR REPLACE TABLE waste_ef AS
             SELECT "EF ID" AS ef_id,
             REPLACE(REGEXP_REPLACE("IPCC 2006 Source/Sink Category", '\n', '|'), CHR(10), '|') AS ipcc_sector_multi,
             REPLACE(REGEXP_REPLACE("Gas", '\n', '|'), CHR(10), '|')  AS gas_multi,
             "Fuel 1996" AS fuel_1996,
             "Fuel 2006" AS fuel_2006,
             "C pool" c_pool,
             "Type of parameter" AS type_parameter,
             Description,
             "Technologies / Practices" AS technologies_paractises,
             "Parameters / Conditions" AS parameters_conditions,
             "Region / Regional Conditions" AS region,
             "Abatement / Control Technologies" AS control_paractises,
             "Other properties" AS properties,
             Value AS emissionsfactor_value,
             Unit AS emissionsfactor_units,
             Equation AS ipcc_equation,
             "IPCC Worksheet" as ipcc_worksheet,
             "Technical Reference" as technical_reference,
             "Source of data" as dataset_name,
             "Data provider" AS data_source
             FROM ST_READ('{input_fl}')
             WHERE lower("IPCC 2006 Source/Sink Category") LIKE '%waste%'
             AND regexp_matches("IPCC 1996 Source/Sink Category", '\n')
            ;

             CREATE OR REPLACE TABLE waste_emissionfactor AS
             WITH waste_ef_split AS (
             SELECT 	ef_id,
                     UNNEST(STRING_SPLIT(ipcc_sector_multi, '|')) AS ipcc_sector,
                     gas_multi,
                     fuel_1996,
                     fuel_2006,
                     c_pool,
                     type_parameter,
                     Description,
                     technologies_paractises,
                     parameters_conditions,
                     region,
                     control_paractises,
                     properties,
                     emissionsfactor_value,
                     emissionsfactor_units,
                     ipcc_equation,
                     data_source,
                     ipcc_worksheet,
                     technical_reference,
                     dataset_name
             FROM waste_ef),
             waste_ef_split_gas AS (
             SELECT 	ef_id,
                     ipcc_sector,
                     UNNEST(STRING_SPLIT(gas_multi, '|')) AS gas,
                     fuel_1996,
                     fuel_2006,
                     c_pool,
                     type_parameter,
                     Description,
                     technologies_paractises,
                     parameters_conditions,
                     region,
                     control_paractises,
                     properties,
                     emissionsfactor_value,
                     emissionsfactor_units,
                     ipcc_equation,
                     data_source,
                     ipcc_worksheet,
                     technical_reference,
                     dataset_name
             FROM waste_ef_split
             WHERE ipcc_sector != '')
             SELECT ef_id,
                     ipcc_sector,
                     gas,
                     type_parameter,
                     description,
                     technologies_paractises,
                     parameters_conditions,
                     region,
                     control_paractises,
                     properties,
                     emissionsfactor_value,
                     emissionsfactor_units,
                     ipcc_equation,
                     data_source,
                     ipcc_worksheet,
                     technical_reference,
                     dataset_name,
                     trim(COALESCE(ipcc_sector, '')) || ' ' || trim(COALESCE(description, '')) || ' ' || trim(COALESCE(technologies_paractises, '') || ' ' || COALESCE(parameters_conditions,'') || '' || COALESCE(control_paractises,'') || ' '|| COALESCE(properties,'')) as emissionfactor_details
             FROM waste_ef_split_gas
             WHERE gas != ''
            ;

             CREATE OR REPLACE TABLE country_region_codes AS
             SELECT * FROM (VALUES
                 ('Austria', 'AT'),
                 ('Belgium', 'BE'),
                 ('Sweden', 'SE'),
                 ('United Kingdom of Great Britain and Northern Ireland', 'GB'),
                 ('Guatemala', 'GT'),
                 ('Malaysia', 'MY'),
                 ('Argentina', 'AR'),
                 ('Bulgaria', 'BG'),
                 ('Lithuania', 'LT'),
                 ('Canada', 'CA'),
                 ('Brazil', 'BR'),
                 ('Kuwait', 'KW'),
                 ('Spain', 'ES'),
                 ('India', 'IN'),
                 ('South Korea', 'KR'),
                 ('Thailand', 'TH'),
                 ('Japan', 'JP'),
                 ('Iraq', 'IQ'),
                 ('Egypt', 'EG'),
                 ('Iran', 'IR'),
                 ('Tunisia', 'TN'),
                 ('Nigeria', 'NG'),
                 ('South Africa', 'ZA'),
                 ('Rwanda', 'RW'),
                 ('Democratic Republic of the Congo', 'CD'),
                 ('Madagascar', 'MG'),
                 ('Finland', 'FI'),
                 ('France', 'FR'),
                 ('Italy', 'IT'),
                 ('The Netherlands', 'NL'),
                 ('Cyprus', 'CY'),
                 ('Russia', 'RU'),
                 ('United States of America', 'US'),
                 ('Singapore', 'SG'),
                 ('Zimbabwe', 'ZW'),
                 ('Mauritius', 'MU'),
                 ('Lebanon', 'LB'),
                 ('Honduras', 'HN'),
                 ('Dominican Republic', 'DO'),
                 ('Cambodia', 'KH'),
                 ('Kenya', 'KE'),
                 ('Chad', 'TD'),
                 ('Mali', 'ML'),
                 ('Niger', 'NE'),
                 ('Senegal', 'SN'),
                 ('United Arab Emirates', 'AE'),
                 ('Comoros', 'KM'),
                 ('Eswatini', 'SZ'),
                 ('Saint Lucia', 'LC'),
                 ('Saint Kitts and Nevis', 'KN'),
                 ('Antigua and Barbuda', 'AG'),
                 ('Jamaica', 'JM'),
                 ('Vanuatu', 'VU'),
                 ('Gabon', 'GA'),
                 ('Georgia', 'GE'),
                 ('Armenia', 'AM'),
                 ('Azerbaijan', 'AZ'),
                 ('China',	'CN'),
				('Indonesia','ID'),
				('Pakistan','PK'),
				('Bangladesh','BD'),
				('Russian Federation','RU'),
				('Germany','DE'),
				('Mexico','MX'),
				('Australia and New Zealand','AU'),
				('Greece', 'GR'),
				('Denmark', 'DK'),
				('Netherlands', 'NL'),
				('Region: Generic', 'world'),
				('Region: Western Europe, Country: Netherlands', 'NL'),
				('Region: Western Europe,Country: Netherlands', 'NL'),
				('Region: North America, Country: United States of America', 'US'),
				('Japan (JPN)', 'JP'),
				('Central America', 'BZ, CR, SV, GT, HN, NI, PA'),
				('Eastern Africa', 'DJ, ER, ET, KE, RW, SO, SS, TZ, UG, ZM, ZW'),
				('Eastern Asia', 'CN, JP, KR, MN, TW'),
				('Middle Africa', 'CD, CM, CF, TD, GA'),
				('North America', 'US, CA'),
				('Portugal', 'PT'),
				('Republic of Korea', 'KR'),
				('South Asia (Indian subcontinent)', 'IN, PK, BD, NP, LK, BT'),
				('South-Central Asia', 'PK, AF'),
				('South-East Asia', 'MY, ID, PH, SG, TH, VN, BN, KH, LA, MM'),
				('Southern Africa', 'ZA, BW, LS, SZ, NA, MW, MZ, ZM, ZW'),
				('Southern Europe', 'AL, AD, AT, BA, HR, IT, MT, ME, PT, RS, SI, SK, ES'),
				('Western Africa', 'BF, BJ, CI, GM, GH, GN, GW, LR, MA, ML, NE, NG, RE, SC, SL, SN, ST, TG'),
				('Western Asia & Middle East', 'AE, AM, AZ, BH, CY, GE, IL, JO, KW, LB, OM, QA, SA, SY, TR, YE'),
				('Western Europe', 'AT, BE, CH, DE, DK, ES, FI, FR, IE, LU, MC, NL, NO, PT, SE, GB'),
				('Sub-Saharan Africa', 'AO, BJ, BW, BF, BI, CV, CM, CF, TD, DJ, ER, ET, GA, GM, GH, GN, GW, KE, LS, LR, MA, MG, MW, ML, MR, MU, MZ, NA, NE, NG, RW, ST, SN, SC, SL, SO, ZA, SS, SD, TZ, TG, UG, ZM, ZW'),
				('Northern Africa', 'MA, DZ, LY, TN, EG'),
				('Oceania: Australia and New Zealand', 'AU, NZ'),
				('Oceania', 'AU, NZ, PG, FJ, SB, TV, VU'),
				('Northern Europe', 'DK, EE, FI, IS, IE, LV, LT, NO, SE, GB'),
				('Near East (Middle East) and North Africa', 'EG, IL, JO, KW, LB, LY, MA, OM, QA, SA, SY, TN, AE, YE'),
				('Latin America and Caribbean', 'AR, BO, BR, CL, CO, CR, CU, DO, EC, SV, GT, HN, MX, NI, PA'),
				('Eastern Europe (including Russia)', 'BY, BG, CZ, GE, HU, MD, PL, RO, RU, SK, UA'),
				('Eastern Europe', 'AM, AZ, BY, BG, CZ, GE, HU, MD, PL, RO, RU, SK, UA'),
				('East Asia and South-East Asia (Asia)', 'CN, HK, JP, KP, KR, MO, MN, MY, PH, SG, TH, VN, ID, TL'),
				('Caribbean', 'AG, BS, BB, CU, DM, DO, GD, HT, JM, KN, LC, VC, TT'),
				('Africa', 'DZ, AO, BJ, BW, BF, BI, CV, CM, CF, TD, KM, CG, CD, DJ, EG, GQ, ER, SZ, ET, GA, GM, GH, GN, GW, KE, LS, LR, LY, MG, MW, ML, MR, MU, MA, MZ, NA, NE, NG, RW, ST, SN, SC, SL, SO, ZA, SS, SD, TZ, TG, UG, EH, ZM, ZW'),
				('Region: Africa', 'DZ, AO, BJ, BW, BF, BI, CV, CM, CF, TD, KM, CD, CG, DJ, EG, GQ, ER, SZ, ET, GA, GM, GH, GN, GW, CI, KE, LS, LR, LY, MG, MW, ML, MR, MU, MA, MZ, NA, NE, NG, RW, ST, SN, SC, SL, SO, ZA, SS, SD, TZ, TG, TN, UG, ZM, ZW'),
				('Region: Asia', 'AF, AM, AZ, BH, BD, BT, BN, KH, CN, CY, GE, IN, ID, IR, IQ, IL, JP, JO, KZ, KW, KG, LA, LB, MY, MV, MN, MM, NP, KP, OM, PK, PS, PH, QA, SA, SG, KR, LK, SY, TJ, TH, TL, TR, TM, AE, UZ, VN, YE'),
				('Region: Latin America And Caribbean', 'AG, AR, BS, BB, BZ, BO, BR, CL, CO, CR, CU, DM, DO, EC, SV, GD, GT, GY, HT, HN, JM, MX, NI, PA, PY, PE, KN, LC, VC, SR, TT, UY, VE'),
				('Region: Australia And New Zealand', 'AU, NZ')
             ) AS t (country_name, country_code)
            ;

            CREATE OR REPLACE TABLE waste_emissionfactor_clean AS
            WITH gpc_sector AS (
            SELECT *
			FROM (
			    VALUES
			        ('4.A', 'III.1.1 + III.1.2 + III.1.3'),
			        ('4.A.1', 'III.1.1 + III.1.2 + III.1.3'),
			        ('4.A.2', 'III.1.1 + III.1.2 + III.1.3'),
			        ('4.A.3', 'III.1.1 + III.1.2 + III.1.3'),
			        ('4.B', 'III.2.1 + III.2.2 + III.2.3'),
			        ('4.C', 'III.3.1 + III.3.2 + III.3.3'),
			        ('4.C.1', 'III.3.1 + III.3.2 + III.3.3'),
			        ('4.C.2', 'III.3.1 + III.3.2 + III.3.3'),
			        ('4.D', 'III.4.1 + III.4.2 + III.4.3'),
			        ('4.D.1', 'III.4.1 + III.4.2 + III.4.3'),
			        ('4.D.2', 'III.4.1 + III.4.2 + III.4.3')
			) AS lookup_table(id, gpc_sector)
			)
             SELECT 	ef_id,
            			TRIM(STRING_SPLIT(ipcc_sector, '-')[1]) as ipcc_category_code,
   					gpc_sector,
   					CASE WHEN gas = 'CARBON DIOXIDE' THEN 'CO2'
					WHEN gas = 'NITROUS OXIDE' THEN 'N2O'
					WHEN gas = 'METHANE' THEN 'CH4' END AS gas_name,
   					CASE WHEN regexp_extract(technical_reference, '([0-9]{4})') = '' OR regexp_extract(technical_reference, '([0-9]{4})') IS NULL THEN regexp_extract(type_parameter, '([0-9]{4})')
              		ELSE regexp_extract(technical_reference, '([0-9]{4})')
              		END AS technical_reference_year,
              		case when Region is null then 'world' else Region end as Region,
              		case when Region is null then 'world' else country_code end as country_code,
					Description,
					emissionsfactor_value,
					emissionsfactor_units,
					technologies_paractises,parameters_conditions,
   					control_paractises,properties,
   					type_parameter,ipcc_equation,data_source,ipcc_worksheet,technical_reference,emissionfactor_details
            FROM waste_emissionfactor a
            LEFT JOIN gpc_sector b
            ON b.id = TRIM(STRING_SPLIT(ipcc_sector, '-')[1])
            LEFT JOIN country_region_codes c
            ON lower(a.region) = lower(c.country_name)
           ;

           --domestic-wastewater-------------------------------------------

           -- income-group
           CREATE OR REPLACE TABLE waterwater_income_group AS
           WITH income_group_raw AS (
           SELECT ef_id,ipcc_category_code,gpc_sector,
           		 gas_name,
           		 technical_reference_year,region,country_code,
           		 'i' as parameter_code,
           		 'income-group' as parameter_name,
           		 STRING_SPLIT(emissionsfactor_value, ',') AS emissionsfactor_value,
           		 emissionsfactor_units,
           		 'wastewater-inside-domestic-calculator-activity, wastewater-outside-domestic-calculator-activity' as methodology,
           		 'domestic-wastewater' as formula_name
           FROM waste_emissionfactor_clean
           WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
           AND Description = 'Urbanization'),
           income_group_ig AS (
           SELECT 	ef_id,
           			ipcc_category_code,
           			gpc_sector,
           			gas_name,
           			technical_reference_year,
           			region,
           			country_code,
           			parameter_code,
           			parameter_name,
           			STRING_SPLIT(TRIM(UNNEST(emissionsfactor_value)), '=')[1] AS emissionsfactor_valuename,
           			STRING_SPLIT(TRIM(UNNEST(emissionsfactor_value)), '=')[2] AS emissionsfactor_value,
           			case when emissionsfactor_valuename = 'rural' then 'income-group-type-rural'
           			when emissionsfactor_valuename = 'urban-high' then 'income-group-type-urban-high-income'
           			when emissionsfactor_valuename = 'urban-low' then 'income-group-type-urban-low-income'
           			else null end as emissionsfactor_valuenamejson,
           			emissionsfactor_units,
           			methodology,
           			formula_name
           FROM income_group_raw),
           income_group_src AS (
           SELECT 	ef_id,
           			ipcc_category_code,
           			TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) AS gpc_refno,
           			parameter_code,
           			parameter_name,
           			gas_name,
           			technical_reference_year,
           			region,
           			country_code as actor_id,
           			emissionsfactor_value AS formula_input_value,
           			emissionsfactor_units AS formula_input_units,
           			JSON_OBJECT(
				        parameter_name,
				        emissionsfactor_valuenamejson
				    ) AS metadata,
           			formula_name
           FROM 		income_group_ig)
           SELECT 	gas_name as gas,
           			parameter_code,
           			parameter_name,
           			case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-domestic-calculator-activity'
        				else 'wastewater-outside-domestic-calculator-activity' end as methodology,
           			gpc_refno,
           			technical_reference_year AS year,
           			formula_input_value,
           			formula_input_units,
           			formula_name,
           			metadata,
           			region,
           			actor_id,
           			'IPCC' AS datasource
           FROM 		income_group_src
          ;

         -- BOD domestic
         CREATE OR REPLACE TABLE waterwater_bod_domestic AS
         WITH bod_domestic AS (
         SELECT *,
         		CASE
                     WHEN REGEXP_MATCHES(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)') THEN
                         ROUND((
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 1), '')::decimal +
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 2), '')::decimal
                         ) / 2.0::decimal, 3)
                     WHEN NOT REGEXP_MATCHES(emissionsfactor_value, '[a-zA-Z]') THEN
                         emissionsfactor_value::numeric
                     ELSE NULL
                 END AS formula_input_value
         FROM waste_emissionfactor_clean
         WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
         AND Description LIKE '%BOD%'
         AND Description NOT LIKE 'Correction%'
         AND country_code IS NOT NULL
         AND emissionsfactor_units LIKE '%person%')
         ,
         bod_domestic_1 AS (
         SELECT 	gas_name AS gas,
         		'BOD' AS parameter_code,
         		'degradable-organic-component'AS parameter_name,
         		--'wastewater-inside-domestic-calculator-activity, wastewater-outside-domestic-calculator-activity' AS methodology,
         		TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
         		technical_reference_year as year,
         		CASE WHEN emissionsfactor_units = 'kg/1000 persons/yr' THEN formula_input_value/1000
         		ELSE formula_input_value END AS formula_input_value,
         		'g/person/day' as formula_input_units,
         		 'domestic-wastewater' as formula_name,
         		null as metadata,
         		region,
         		country_code as actor_id,
         		'IPCC' as datasource
         FROM bod_domestic)
         SELECT 	gas,
         		parameter_code,
         		parameter_name,
         		case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-domestic-calculator-activity'
        			else 'wastewater-outside-domestic-calculator-activity' end as methodology,
         		gpc_refno,
         		year,
         		formula_input_value,
         		formula_input_units,
         		formula_name,
         		metadata,
         		Region,
         		TRIM(UNNEST(STRING_SPLIT(actor_id,','))) AS actor_id,
         		datasource
        	FROM bod_domestic_1;

        -- MCF
        CREATE OR REPLACE TABLE waterwater_mcf_domestic AS
        WITH mcf_domestic_raw AS (
        SELECT 	*,
		       CASE
				    WHEN lower(emissionfactor_details) LIKE '%industrial%' OR lower(emissionfactor_details) LIKE 'industry' THEN 'industrial'
				    WHEN lower(emissionfactor_details) LIKE '%domestic%' OR lower(emissionfactor_details) LIKE '%municipal%'THEN 'domestic'
				    ELSE 'unknown'
				  END AS wastewater_subcategory,
		         CASE
				    WHEN emissionfactor_details LIKE '%untreated%' OR emissionfactor_details LIKE '%discharge%' THEN 'treatment-status-type-wastewater-untreated'
				    ELSE 'treatment-status-type-wastewater-treated'
				  END AS treatment_status,
				  CASE
				    WHEN lower(emissionfactor_details) LIKE '%aerobic%well%managed%' THEN 'treatment-type-centralized-aerobic-treatment-plan-well-managed'
				    WHEN lower(emissionfactor_details) LIKE '%centralized%aerobic%' THEN 'treatment-type-centralized-aerobic-treatment-not-plan-well-managed'
				    WHEN emissionfactor_details LIKE '%Anaerobic digester for sludge%' THEN 'treatment-type-anaerobic-digester-for-sludge'
				    WHEN emissionfactor_details LIKE '%Anaerobic shallow lagoon%' THEN 'treatment-type-anaerobic-shallow-lagoon'
				    WHEN emissionfactor_details LIKE '%Anaerobic deep lagoon%' THEN 'treatment-type-anaerobic-deep-lagoon'
				    WHEN lower(emissionfactor_details) LIKE '%anaerobic%' THEN 'treatment-type-anaerobic-reactor'
				    WHEN emissionfactor_details LIKE '%Septic system%' THEN 'treatment-type-septic-system'
				    WHEN emissionfactor_details LIKE '%Latrine%' THEN
				      CASE
				        WHEN emissionfactor_details LIKE '%dry climate small family%' THEN 'treatment-type-latrine-dry-climate-small-family'
				        WHEN emissionfactor_details LIKE '%dry climate communal%' THEN 'treatment-type-latrine-dry-climate-communal'
				        WHEN emissionfactor_details LIKE '%wet climate%' THEN 'treatment-type-latrine-wet-climate'
				        ELSE 'treatment-type-latrine-regular-sediment'
				      END
				    WHEN lower(emissionfactor_details) LIKE '%sea%river%lake%discharge%' THEN 'discharge-pathway-sea-river-lake'
				    WHEN emissionfactor_details LIKE '%Stagnant sewer%' THEN 'discharge-pathway-stagnant-sewer'
				    WHEN emissionfactor_details LIKE '%Flowing sewer%' THEN 'discharge-pathway-flowing-sewer'
				    --ELSE 'discharge-pathway-to-ground'
				  END AS specific_treatment_type
        FROM waste_emissionfactor_clean
        WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
        AND Description like '%MCF%'),
        mcf_domestic_1 AS (
        SELECT 	gas_name as gas,
        			'MCF' as parameter_code,
        			'methane-correction-factor' as parameter_name,
        			gpc_sector,
        			technical_reference_year as year,
        			case when emissionsfactor_units = '%' then (emissionsfactor_value::numeric/100)
        			else emissionsfactor_value::numeric end as formula_input_value,
        			'fraction' as formula_input_units,
        			'domestic-wastewater' as formula_name,
        			json_object(
        				'treatment-status', treatment_status,
        				'treatment-type', specific_treatment_type
        				) as metadata,
        			region,
        			TRIM(UNNEST(STRING_SPLIT(country_code,','))) AS actor_id,
        			'IPCC' as datasource
        FROM 	mcf_domestic_raw
        WHERE 	wastewater_subcategory = 'domestic'),
        mcf_domestic_2 AS (
        SELECT 	gas,
        			parameter_code,
        			parameter_name,
        			TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
        			year,
        			formula_input_value,
        			formula_input_units,
        			formula_name,
        			metadata,
        			region,
        			actor_id,
        			datasource
        FROM 	mcf_domestic_1)
        SELECT 	gas,
        			parameter_code,
        			parameter_name,
        			case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-domestic-calculator-activity'
        			else 'wastewater-outside-domestic-calculator-activity' end as methodology,
        			gpc_refno,
        			year,
        			formula_input_value,
        			formula_input_units,
        			formula_name,
        			metadata,
        			region,
        			actor_id,
        			datasource
        FROM 	mcf_domestic_2
       ;

       --- Bo
       CREATE OR REPLACE TABLE waterwater_bo_domestic AS
       WITH bo_raw AS (
       SELECT gas_name as gas,
       		 'Bo' as parameter_code,
       		 'maximum-methane-producing-capacity' as parameter_name,
       		 TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
       		 technical_reference_year as year,
       		 emissionsfactor_value::numeric as formula_input_value,
       		 'Kg/Kg' as formula_input_units,
       		 'domestic-wastewater' as formula_name,
       		 null as metadata,
       		 region,
       		 country_code as actor_id,
       		 'IPCC' as datasource
       FROM waste_emissionfactor_clean
       WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
       AND Description like '%Bo%'
       AND emissionfactor_details like '%Domestic%'
       AND parameters_conditions = 'BOD based')
       SELECT gas,
		      parameter_code,
		      parameter_name,
		      case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-domestic-calculator-activity'
        			else 'wastewater-outside-domestic-calculator-activity' end as methodology,
		      gpc_refno,
		      year,
		      formula_input_value,
		      formula_input_units,
		      formula_name,
		      metadata,
		      region,
		      actor_id,
       		  datasource
       FROM bo_raw;

      -- industrial-wastewater

      -- COD
      CREATE OR REPLACE TABLE waterwater_cod_industrial AS
      WITH cod_raw AS (
      SELECT  *,
		     CASE
			    WHEN LOWER(emissionfactor_details) LIKE '%alcohol refining%' THEN 'industry-type-alcohol-refining'
			    WHEN LOWER(emissionfactor_details) LIKE '%coffee%' THEN 'industry-type-coffee'
			    WHEN LOWER(emissionfactor_details) LIKE '%dairy products%' THEN 'industry-type-dairy-products'
			    WHEN LOWER(emissionfactor_details) LIKE '%fish processing%' OR LOWER(emissionfactor_details) LIKE '%fish%' THEN 'industry-type-fish-processing'
			    WHEN LOWER(emissionfactor_details) LIKE '%meat%poultry%' OR LOWER(emissionfactor_details) LIKE '%poultry%' OR LOWER(emissionfactor_details) LIKE '%meat%' THEN 'industry-type-meat-and-poultry'
			    WHEN LOWER(emissionfactor_details) LIKE '%organic chemicals%' THEN 'industry-type-organic-chemicals'
			    WHEN LOWER(emissionfactor_details) LIKE '%petroleum refineries%' OR LOWER(emissionfactor_details) LIKE '%petroleum refining%' THEN 'industry-type-petroleum-refineries'
			    WHEN LOWER(emissionfactor_details) LIKE '%plastics%resins%' THEN 'industry-type-plastics-and-resins'
			    WHEN LOWER(emissionfactor_details) LIKE '%pulp%paper%' OR LOWER(emissionfactor_details) LIKE '%pulp mill%' OR LOWER(emissionfactor_details) LIKE '%paper%' THEN 'industry-type-pulp-and-paper'
			    WHEN LOWER(emissionfactor_details) LIKE '%soap%' THEN 'industry-type-soap-and-detergents'
			    WHEN LOWER(emissionfactor_details) LIKE '%starch production%' OR LOWER(emissionfactor_details) LIKE '%starch%' THEN 'industry-type-starch-production'
			    WHEN LOWER(emissionfactor_details) LIKE '%sugar refining%' THEN 'industry-type-sugar-refining'
			    WHEN LOWER(emissionfactor_details) LIKE '%vegetable oils%' OR LOWER(emissionfactor_details) LIKE '%vegetable oil%' THEN 'industry-type-vegetable-oils'
			    WHEN LOWER(emissionfactor_details) LIKE '%vegetables%fruits%juices%' THEN 'industry-type-vegetables-fruits-juices'
			    WHEN LOWER(emissionfactor_details) LIKE '%wine%vinegar%' THEN 'industry-type-wine-and-vinegar'
			    ELSE 'Undefined' END AS industry_type
      FROM waste_emissionfactor_clean
      WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
      AND Description like '%COD%'
      AND gas_name = 'CH4'
      AND (lower(emissionfactor_details) LIKE '%industrial%' OR  lower(emissionfactor_details) LIKE '%industry%')
      ),
      cod_clean_1 AS (
      SELECT gas_name as gas,
      		'COD' AS parameter_code,
      		'chemical-oxygen-demand' AS parameter_name,
      		TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
      		technical_reference_year as year,
      		CASE
                     WHEN REGEXP_MATCHES(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)') THEN
                         ROUND((
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 1), '')::decimal +
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 2), '')::decimal
                         ) / 2.0::decimal, 3)
                     WHEN NOT REGEXP_MATCHES(emissionsfactor_value, '[a-zA-Z]') THEN
                         emissionsfactor_value::numeric
                     ELSE NULL
                 END AS formula_input_value,
             'Kg/m3' as formula_input_units,
             'industrial-wastewater' AS formula_name,
             json_object(
             		'industry_type', industry_type
             ) as metadata,
             region,
             country_code as actor_id,
             'IPCC' as datasource
      FROM 	cod_raw
      WHERE 	industry_type != 'Undefined'
      AND 	emissionsfactor_units = 'kg COD/m3 wastewater')
      SELECT gas,
      		parameter_code,
      		parameter_name,
      		case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-industrial-calculator-activity'
        			else 'wastewater-outside-industrial-calculator-activity' end as methodology,
      		gpc_refno,
      		year,
      		formula_input_value,
      		formula_input_units,
      		formula_name,
      		metadata,
      		region,
      		actor_id,
      		datasource
      FROM cod_clean_1;


     -- Wi wastewater-generated
     CREATE OR REPLACE TABLE waterwater_generated_industrial AS
     WITH wastewater_generation AS (
     SELECT  *,
		     CASE
			    WHEN LOWER(emissionfactor_details) LIKE '%alcohol refining%' THEN 'industry-type-alcohol-refining'
			    WHEN LOWER(emissionfactor_details) LIKE '%coffee%' THEN 'industry-type-coffee'
			    WHEN LOWER(emissionfactor_details) LIKE '%dairy products%' THEN 'industry-type-dairy-products'
			    WHEN LOWER(emissionfactor_details) LIKE '%fish processing%' OR LOWER(emissionfactor_details) LIKE '%fish%' THEN 'industry-type-fish-processing'
			    WHEN LOWER(emissionfactor_details) LIKE '%meat%poultry%' OR LOWER(emissionfactor_details) LIKE '%poultry%' OR LOWER(emissionfactor_details) LIKE '%meat%' THEN 'industry-type-meat-and-poultry'
			    WHEN LOWER(emissionfactor_details) LIKE '%organic chemicals%' THEN 'industry-type-organic-chemicals'
			    WHEN LOWER(emissionfactor_details) LIKE '%petroleum refineries%' OR LOWER(emissionfactor_details) LIKE '%petroleum refining%' THEN 'industry-type-petroleum-refineries'
			    WHEN LOWER(emissionfactor_details) LIKE '%plastics%resins%' THEN 'industry-type-plastics-and-resins'
			    WHEN LOWER(emissionfactor_details) LIKE '%pulp%paper%' OR LOWER(emissionfactor_details) LIKE '%pulp mill%' OR LOWER(emissionfactor_details) LIKE '%paper%' THEN 'industry-type-pulp-and-paper'
			    WHEN LOWER(emissionfactor_details) LIKE '%soap%' THEN 'industry-type-soap-and-detergents'
			    WHEN LOWER(emissionfactor_details) LIKE '%starch production%' OR LOWER(emissionfactor_details) LIKE '%starch%' THEN 'industry-type-starch-production'
			    WHEN LOWER(emissionfactor_details) LIKE '%sugar refining%' THEN 'industry-type-sugar-refining'
			    WHEN LOWER(emissionfactor_details) LIKE '%vegetable oils%' OR LOWER(emissionfactor_details) LIKE '%vegetable oil%' THEN 'industry-type-vegetable-oils'
			    WHEN LOWER(emissionfactor_details) LIKE '%vegetables%fruits%juices%' THEN 'industry-type-vegetables-fruits-juices'
			    WHEN LOWER(emissionfactor_details) LIKE '%wine%vinegar%' THEN 'industry-type-wine-and-vinegar'
			    ELSE 'Undefined' END AS industry_type
      FROM waste_emissionfactor_clean
      WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
      AND lower(description) like '%wastewater%generation%'
      AND gas_name = 'CH4'
      AND (lower(emissionfactor_details) LIKE '%industrial%' OR  lower(emissionfactor_details) LIKE '%industry%')
      ),
      wastewater_generation_1 AS (
      SELECT  gas_name as gas,
      		'Wi' AS parameter_code,
      		'wastewater-generation' AS parameter_name,
      		TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
      		technical_reference_year as year,
      		CASE
                     WHEN REGEXP_MATCHES(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)') THEN
                         ROUND((
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 1), '')::decimal +
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 2), '')::decimal
                         ) / 2.0::decimal, 3)
                     WHEN NOT REGEXP_MATCHES(emissionsfactor_value, '[a-zA-Z]') THEN
                         emissionsfactor_value::numeric
                     ELSE NULL
                 END AS formula_input_value,
              emissionsfactor_units,
             'industrial-wastewater' AS formula_name,
             json_object(
             		'industry_type', industry_type
             ) as metadata,
             region,
             country_code as actor_id,
             'IPCC' as datasource
      FROM wastewater_generation
      WHERE industry_type != 'Undefined'
      AND emissionsfactor_units != 'm3/animal')
      SELECT gas,
      		parameter_code,
      		parameter_name,
      		case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-industrial-calculator-activity'
        			else 'wastewater-outside-industrial-calculator-activity' end as methodology,
      		gpc_refno,
      		year,
      		case when emissionsfactor_units = 'm3/Mg' then formula_input_value/1000000000
      		else formula_input_value end as formula_input_value,
      		'm3/tonne' as emissionsfactor_units,
      		formula_name,
      		metadata,
      		region,
      		actor_id,
      		datasource
      FROM wastewater_generation_1;


     -- MCF methane-correction-factor
     CREATE OR REPLACE TABLE waterwater_mcf_industrial AS
     WITH mcf_industrial_raw AS (
     SELECT  *,
		       CASE
				    WHEN lower(emissionfactor_details) LIKE '%industrial%' OR lower(emissionfactor_details) LIKE 'industry' THEN 'industrial'
				    WHEN lower(emissionfactor_details) LIKE '%domestic%' OR lower(emissionfactor_details) LIKE '%municipal%'THEN 'domestic'
				    ELSE 'unknown'
				  END AS wastewater_subcategory,
		         CASE
				    WHEN emissionfactor_details LIKE '%untreated%' OR emissionfactor_details LIKE '%discharge%' THEN 'treatment-status-type-wastewater-untreated'
				    ELSE 'treatment-status-type-wastewater-treated'
				  END AS treatment_status,
				  CASE
				    WHEN lower(emissionfactor_details) LIKE '%aerobic%well%managed%' THEN 'treatment-type-centralized-aerobic-treatment-plan-well-managed'
				    WHEN lower(emissionfactor_details) LIKE '%centralized%aerobic%' THEN 'treatment-type-centralized-aerobic-treatment-not-plan-well-managed'
				    WHEN emissionfactor_details LIKE '%Anaerobic digester for sludge%' THEN 'treatment-type-anaerobic-digester-for-sludge'
				    WHEN emissionfactor_details LIKE '%Anaerobic shallow lagoon%' THEN 'treatment-type-anaerobic-shallow-lagoon'
				    WHEN emissionfactor_details LIKE '%Anaerobic deep lagoon%' THEN 'treatment-type-anaerobic-deep-lagoon'
				    WHEN lower(emissionfactor_details) LIKE '%anaerobic%' THEN 'treatment-type-anaerobic-reactor'
				    WHEN emissionfactor_details LIKE '%Septic system%' THEN 'treatment-type-septic-system'
				    WHEN emissionfactor_details LIKE '%Latrine%' THEN
				      CASE
				        WHEN emissionfactor_details LIKE '%dry climate small family%' THEN 'treatment-type-latrine-dry-climate-small-family'
				        WHEN emissionfactor_details LIKE '%dry climate communal%' THEN 'treatment-type-latrine-dry-climate-communal'
				        WHEN emissionfactor_details LIKE '%wet climate%' THEN 'treatment-type-latrine-wet-climate'
				        ELSE 'treatment-type-latrine-regular-sediment'
				      END
				    WHEN lower(emissionfactor_details) LIKE '%sea%river%lake%discharge%' THEN 'discharge-pathway-sea-river-lake'
				    WHEN emissionfactor_details LIKE '%Stagnant sewer%' THEN 'discharge-pathway-stagnant-sewer'
				    WHEN emissionfactor_details LIKE '%Flowing sewer%' THEN 'discharge-pathway-flowing-sewer'
				    --ELSE 'discharge-pathway-to-ground'
				  END AS specific_treatment_type
     FROM waste_emissionfactor_clean
     WHERE gpc_sector = 'III.4.1 + III.4.2 + III.4.3'
     AND description like '%MCF%'),
     mcf_industrial_1 AS (
     SELECT 		gas_name as gas,
        			'MCF' as parameter_code,
        			'methane-correction-factor' as parameter_name,
        			gpc_sector,
        			technical_reference_year as year,
        			case when emissionsfactor_units = '%' then (emissionsfactor_value::numeric/100)
        			else emissionsfactor_value::numeric end as formula_input_value,
        			'fraction' as formula_input_units,
        			'domestic-wastewater' as formula_name,
        			json_object(
        				'treatment-status', treatment_status,
        				'treatment-type', specific_treatment_type
        				) as metadata,
        			region,
        			TRIM(UNNEST(STRING_SPLIT(country_code,','))) AS actor_id,
        			'IPCC' as datasource
     FROM mcf_industrial_raw
    	WHERE wastewater_subcategory = 'industrial'),
     mcf_industrial_2 AS (
     SELECT 		gas,
        			parameter_code,
        			parameter_name,
        			TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
        			year,
        			formula_input_value,
        			formula_input_units,
        			formula_name,
        			metadata,
        			region,
        			actor_id,
        			datasource
     FROM 		mcf_industrial_1)
     SELECT 		gas,
        			parameter_code,
        			parameter_name,
        			case when gpc_refno IN ('III.4.1', 'III.4.3') then 'wastewater-inside-industrial-calculator-activity'
        			else 'wastewater-outside-industrial-calculator-activity' end as methodology,
        			gpc_refno,
        			year,
        			formula_input_value,
        			formula_input_units,
        			formula_name,
        			metadata,
        			region,
        			actor_id,
        			datasource
        FROM 	mcf_industrial_2;


       -- end of wastewater ---

       -- waste incineration --

       -- dry matter content
       CREATE OR REPLACE TABLE incineration_dmi AS
       WITH dmi_raw AS (
       SELECT *,
       CASE
         WHEN LOWER(emissionfactor_details) LIKE '%food%' THEN 'waste-type-food'
         WHEN LOWER(emissionfactor_details) LIKE '%garden%' OR LOWER(emissionfactor_details) LIKE '%park%' THEN 'waste-type-garden'
         WHEN LOWER(emissionfactor_details) LIKE '%paper%' OR LOWER(emissionfactor_details) LIKE '%cardboard%' THEN 'waste-type-paper'
         WHEN LOWER(emissionfactor_details) LIKE '%wood%' THEN 'waste-type-wood'
         WHEN LOWER(emissionfactor_details) LIKE '%textile%' OR LOWER(emissionfactor_details) LIKE '%textiles%' THEN 'waste-type-textiles'
         WHEN LOWER(emissionfactor_details) LIKE '%glass%' THEN 'waste-type-glass'
         WHEN LOWER(emissionfactor_details) LIKE '%metal%' THEN 'waste-type-metal'
         WHEN LOWER(emissionfactor_details) LIKE '%plastics%' THEN 'waste-type-plastics'
         WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
         WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
         WHEN LOWER(emissionfactor_details) LIKE '%other%' THEN 'waste-type-other-inert'
         WHEN LOWER(emissionfactor_details) LIKE '%nappies%' THEN 'waste-type-nappies'
         WHEN (emissionfactor_details LIKE '%MSW%' OR lower(emissionfactor_details) LIKE '%municipal%') THEN 'waste-type-muncipal-solid-waste'
         WHEN lower(emissionfactor_details) LIKE '%sewage sludge%' THEN 'waste-type-sewage-sludge'
         WHEN lower(emissionfactor_details) LIKE '%sludge%' THEN 'waste-type-sludge'
         WHEN lower(emissionfactor_details) LIKE '%industrial%' THEN 'waste-type-industrial'
         WHEN lower(emissionfactor_details) LIKE '%clinical%' THEN 'waste-type-clinical'
         WHEN lower(emissionfactor_details) LIKE '%sewage%' THEN 'waste-type-sewage'
         WHEN lower(emissionfactor_details) LIKE '%hazardous%' THEN 'waste-type-hazardous'
     	END AS waste_composition
       FROM waste_emissionfactor_clean
       WHERE gpc_sector = 'III.3.1 + III.3.2 + III.3.3'
       AND lower(Description) like '%dry%matter%'
       AND emissionsfactor_value not like 'Paper%'
       ),
       dmi_1 AS (
       SELECT gas_name as gas,
       		 'dmi' as parameter_code,
       		 'dry-matter-content' as parameter_name,
       		  TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
       		  technical_reference_year as year,
       		  emissionsfactor_value::numeric/ 100 as formula_input_value,
       		  'fraction' as formula_input_units,
       		  'incineration-waste' as formula_name,
       		  json_object(
       		  		'waste-type', waste_composition
       		  ) as metadata,
       		  region as region,
       		  country_code as actor_id,
       		  'IPCC' as datasource
       FROM 	dmi_raw
       WHERE waste_composition IS NOT NULL)
       SELECT 	gas,
       			parameter_code,
       			parameter_name,
       			case when gpc_refno IN ('III.3.1', 'III.3.3') then 'incineration-waste-inboundary-methodology'
        			else 'incineration-waste-outboundary-methodology' end as methodology,
       			gpc_refno,
       			year,
       			formula_input_value,
       			formula_input_units,
       			formula_name,
       			metadata,
       			region,
       			actor_id,
       			datasource
       FROM 		dmi_1;

       CREATE OR REPLACE TABLE incineration_water_content AS
              WITH dmi_raw AS (
              SELECT *,
              CASE
                WHEN LOWER(emissionfactor_details) LIKE '%food%' THEN 'waste-type-food'
                WHEN LOWER(emissionfactor_details) LIKE '%garden%' OR LOWER(emissionfactor_details) LIKE '%park%' THEN 'waste-type-garden'
                WHEN LOWER(emissionfactor_details) LIKE '%paper%' OR LOWER(emissionfactor_details) LIKE '%cardboard%' THEN 'waste-type-paper'
                WHEN LOWER(emissionfactor_details) LIKE '%wood%' THEN 'waste-type-wood'
                WHEN LOWER(emissionfactor_details) LIKE '%textile%' OR LOWER(emissionfactor_details) LIKE '%textiles%' THEN 'waste-type-textiles'
                WHEN LOWER(emissionfactor_details) LIKE '%glass%' THEN 'waste-type-glass'
                WHEN LOWER(emissionfactor_details) LIKE '%metal%' THEN 'waste-type-metal'
                WHEN LOWER(emissionfactor_details) LIKE '%plastics%' THEN 'waste-type-plastics'
                WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
                WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
                WHEN LOWER(emissionfactor_details) LIKE '%other%' THEN 'waste-type-other-inert'
                WHEN LOWER(emissionfactor_details) LIKE '%nappies%' THEN 'waste-type-nappies'
                WHEN (emissionfactor_details LIKE '%MSW%' OR lower(emissionfactor_details) LIKE '%municipal%') THEN 'waste-type-muncipal-solid-waste'
                WHEN lower(emissionfactor_details) LIKE '%sewage sludge%' THEN 'waste-type-sewage-sludge'
                WHEN lower(emissionfactor_details) LIKE '%sludge%' THEN 'waste-type-sludge'
                WHEN lower(emissionfactor_details) LIKE '%industrial%' THEN 'waste-type-industrial'
                WHEN lower(emissionfactor_details) LIKE '%clinical%' THEN 'waste-type-clinical'
                WHEN lower(emissionfactor_details) LIKE '%sewage%' THEN 'waste-type-sewage'
                WHEN lower(emissionfactor_details) LIKE '%hazardous%' THEN 'waste-type-hazardous'
            	END AS waste_composition
              FROM waste_emissionfactor_clean
              WHERE gpc_sector = 'III.3.1 + III.3.2 + III.3.3'
              AND (lower(Description) like '%water%content%')
              AND emissionsfactor_value not like 'Paper%'
              ),
              dmi_1 AS (
              SELECT gas_name as gas,
              		 'wc' as parameter_code,
              		 'water-content' as parameter_name,
              		  TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
              		  technical_reference_year as year,
              		  emissionsfactor_value::numeric/ 100 as formula_input_value,
              		  'fraction' as formula_input_units,
              		  'incineration-waste' as formula_name,
              		  json_object(
              		  		'waste-type', waste_composition
              		  ) as metadata,
              		  region as region,
              		  country_code as actor_id,
              		  'IPCC' as datasource
              FROM 	dmi_raw
              WHERE waste_composition IS NOT NULL)
              SELECT 	gas,
              			parameter_code,
              			parameter_name,
              			case when gpc_refno IN ('III.3.1', 'III.3.3') then 'incineration-waste-inboundary-methodology'
               			else 'incineration-waste-outboundary-methodology' end as methodology,
              			gpc_refno,
              			year,
              			formula_input_value,
              			formula_input_units,
              			formula_name,
              			metadata,
              			region,
              			actor_id,
              			datasource
              FROM 	dmi_1;

       -- CFi fraction of fossil carbon in dry matter
       CREATE OR REPLACE TABLE incineration_cfi_fossil AS
       WITH fraction_fossil_carbon_raw AS (
       SELECT *,
       			CASE
                     WHEN REGEXP_MATCHES(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)') THEN
                         ROUND((
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 1), '')::decimal +
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 2), '')::decimal
                         ) / 2.0::decimal, 3)
                     WHEN NOT REGEXP_MATCHES(emissionsfactor_value, '[a-zA-Z]') THEN
                         emissionsfactor_value::numeric
                     ELSE NULL
                 END AS formula_input_value,
       CASE
         WHEN LOWER(emissionfactor_details) LIKE '%food%' THEN 'waste-type-food'
         WHEN LOWER(emissionfactor_details) LIKE '%garden%' OR LOWER(emissionfactor_details) LIKE '%park%' THEN 'waste-type-garden'
         WHEN LOWER(emissionfactor_details) LIKE '%paper%' OR LOWER(emissionfactor_details) LIKE '%cardboard%' THEN 'waste-type-paper'
         WHEN LOWER(emissionfactor_details) LIKE '%wood%' THEN 'waste-type-wood'
         WHEN LOWER(emissionfactor_details) LIKE '%textile%' OR LOWER(emissionfactor_details) LIKE '%textiles%' THEN 'waste-type-textiles'
         WHEN LOWER(emissionfactor_details) LIKE '%glass%' THEN 'waste-type-glass'
         WHEN LOWER(emissionfactor_details) LIKE '%metal%' THEN 'waste-type-metal'
         WHEN LOWER(emissionfactor_details) LIKE '%plastics%' THEN 'waste-type-plastics'
         WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
         WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
         WHEN LOWER(emissionfactor_details) LIKE '%other%' THEN 'waste-type-other-inert'
         WHEN LOWER(emissionfactor_details) LIKE '%nappies%' THEN 'waste-type-nappies'
         WHEN (emissionfactor_details LIKE '%MSW%' OR lower(emissionfactor_details) LIKE '%municipal%') THEN 'waste-type-muncipal-solid-waste'
         WHEN lower(emissionfactor_details) LIKE '%sewage sludge%' THEN 'waste-type-sewage-sludge'
         WHEN lower(emissionfactor_details) LIKE '%sludge%' THEN 'waste-type-sludge'
         WHEN lower(emissionfactor_details) LIKE '%industrial%' THEN 'waste-type-industrial'
         WHEN lower(emissionfactor_details) LIKE '%clinical%' THEN 'waste-type-clinical'
         WHEN lower(emissionfactor_details) LIKE '%sewage%' THEN 'waste-type-sewage'
         WHEN lower(emissionfactor_details) LIKE '%hazardous%' THEN 'waste-type-hazardous'
     	END AS waste_composition
       FROM waste_emissionfactor_clean
       WHERE gpc_sector = 'III.3.1 + III.3.2 + III.3.3'
       AND lower(Description) like '%fossil%carbon%'),
       fraction_fossil_carbon_1 AS (
       SELECT 	DISTINCT gas_name as gas,
       			'FCFi' as parameter_code,
       			'fraction-of-fossil-carbon' as parameter_name,
       			TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) as gpc_refno,
       			technical_reference_year as year,
       			formula_input_value/100 as formula_input_value,
       			'fraction' as formula_input_units,
       			'incineration-waste' as formula_name,
       			json_object(
       		  		'waste-type', waste_composition
       		  		) as metadata,
       		  region as region,
       		  country_code as actor_id,
       		  'IPCC' as datasource
       FROM fraction_fossil_carbon_raw
       WHERE country_code IS NOT NULL AND waste_composition IS NOT NULL)
       SELECT DISTINCT gas,
       		parameter_code,
       		parameter_name,
       		case when gpc_refno IN ('III.3.1', 'III.3.3') then 'incineration-waste-inboundary-methodology'
        			else 'incineration-waste-outboundary-methodology' end as methodology,
       		gpc_refno,
       		year,
       		formula_input_value,
       		formula_input_units,
       		formula_name,
       		metadata,
       		region,
       		actor_id,
       		datasource
       FROM fraction_fossil_carbon_1
       WHERE formula_input_value IS NOT NULL;

       -- CFi fraction-of-carbon
      CREATE OR REPLACE TABLE incineration_cfi AS
      WITH fraction_carbon_raw AS (
      SELECT *,
       			CASE
                     WHEN REGEXP_MATCHES(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)') THEN
                         ROUND((
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 1), '')::decimal +
                             NULLIF(SPLIT_PART(REGEXP_EXTRACT(emissionsfactor_value, '(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'), '-', 2), '')::decimal
                         ) / 2.0::decimal, 3)
                     WHEN NOT REGEXP_MATCHES(emissionsfactor_value, '[a-zA-Z]') THEN
                         emissionsfactor_value::numeric
                     ELSE NULL
                 END AS formula_input_value,
       CASE
         WHEN LOWER(emissionfactor_details) LIKE '%food%' THEN 'waste-type-food'
         WHEN LOWER(emissionfactor_details) LIKE '%garden%' OR LOWER(emissionfactor_details) LIKE '%park%' THEN 'waste-type-garden'
         WHEN LOWER(emissionfactor_details) LIKE '%paper%' OR LOWER(emissionfactor_details) LIKE '%cardboard%' THEN 'waste-type-paper'
         WHEN LOWER(emissionfactor_details) LIKE '%wood%' THEN 'waste-type-wood'
         WHEN LOWER(emissionfactor_details) LIKE '%textile%' OR LOWER(emissionfactor_details) LIKE '%textiles%' THEN 'waste-type-textiles'
         WHEN LOWER(emissionfactor_details) LIKE '%glass%' THEN 'waste-type-glass'
         WHEN LOWER(emissionfactor_details) LIKE '%metal%' THEN 'waste-type-metal'
         WHEN LOWER(emissionfactor_details) LIKE '%plastics%' THEN 'waste-type-plastics'
         WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
         WHEN LOWER(emissionfactor_details) LIKE '%rubber%leather%' THEN 'waste-type-rubber-and-leather'
         WHEN LOWER(emissionfactor_details) LIKE '%other%' THEN 'waste-type-other-inert'
         WHEN LOWER(emissionfactor_details) LIKE '%nappies%' THEN 'waste-type-nappies'
         WHEN (emissionfactor_details LIKE '%MSW%' OR lower(emissionfactor_details) LIKE '%municipal%') THEN 'waste-type-muncipal-solid-waste'
         WHEN lower(emissionfactor_details) LIKE '%sewage sludge%' THEN 'waste-type-sewage-sludge'
         WHEN lower(emissionfactor_details) LIKE '%sludge%' THEN 'waste-type-sludge'
         WHEN lower(emissionfactor_details) LIKE '%industrial%' THEN 'waste-type-industrial'
         WHEN lower(emissionfactor_details) LIKE '%clinical%' THEN 'waste-type-clinical'
         WHEN lower(emissionfactor_details) LIKE '%sewage%' THEN 'waste-type-sewage'
         WHEN lower(emissionfactor_details) LIKE '%hazardous%' THEN 'waste-type-hazardous'
     	END AS waste_composition
      FROM waste_emissionfactor_clean
      WHERE gpc_sector = 'III.3.1 + III.3.2 + III.3.3'
      AND (lower(description) like '%%carbon%content%' AND lower(description) not like '%fossil%')
      ),
      fraction_carbon_1 AS (
      SELECT 	DISTINCT gas_name as gas,
       			'CFi' as parameter_code,
       			'fraction-of-carbon' as parameter_name,
       			TRIM(UNNEST(STRING_SPLIT(gpc_sector, '+'))) AS gpc_refno,
       			technical_reference_year as year,
       			formula_input_value/100 as formula_input_value,
       			'fraction' as formula_input_units,
       			'incineration-waste' as formula_name,
       			json_object(
       		  		'waste-type', waste_composition
       		  		) as metadata,
       		  region as region,
       		  country_code as actor_id,
       		  'IPCC' as datasource
      FROM fraction_carbon_raw
      WHERE country_code IS NOT NULL AND waste_composition IS NOT NULL AND formula_input_value IS NOT NULL)
      SELECT DISTINCT gas,
      		parameter_code,
      		parameter_name,
      		case when gpc_refno IN ('III.3.1', 'III.3.3') then 'incineration-waste-inboundary-methodology'
        			else 'incineration-waste-outboundary-methodology' end as methodology,
      		gpc_refno,
      		year,
      		formula_input_value,
      		formula_input_units,
      		formula_name,
      		metadata,
      		region,
      		actor_id,
      		datasource
      FROM fraction_carbon_1;

        CREATE OR REPLACE TABLE waste_formula_input_all AS
        SELECT 	gas,
              	parameter_code,
              	parameter_name,
              	methodology as methodology_name,
              	gpc_refno,
              	year,
              	formula_input_value,
              	formula_input_units,
              	formula_name,
              	metadata,
              	Region as region,
              	actor_id,
              	datasource,
              	rnk
        FROM (
        SELECT *,
         	 	ROW_NUMBER() OVER (PARTITION BY gas,parameter_code,parameter_name,methodology,gpc_refno,formula_input_value,formula_input_units,formula_name,metadata,Region,actor_id,datasource
        	 						ORDER BY year DESC) AS rnk
        FROM (
        SELECT *
        FROM waterwater_income_group
        UNION
        SELECT *
        FROM waterwater_bod_domestic
        UNION
        SELECT *
        FROM waterwater_mcf_domestic
        UNION
        SELECT *
        FROM waterwater_bo_domestic
        UNION
        SELECT *
        FROM waterwater_cod_industrial
        UNION
        SELECT *
        FROM waterwater_generated_industrial
        UNION
        SELECT *
        FROM waterwater_mcf_industrial
        UNION
        SELECT *
        FROM incineration_dmi
        UNION
        SELECT *
        FROM incineration_cfi
        UNION
        SELECT *
        FROM incineration_cfi_fossil
        UNION
        SELECT *
        FROM incineration_water_content)
        )
        WHERE rnk = 1;
            """
    conn.execute(query)
    df = conn.execute("SELECT gas,parameter_code,parameter_name,methodology_name,gpc_refno,year,formula_input_value,formula_input_units,formula_name,metadata,region,actor_id,datasource,rnk FROM waste_formula_input_all").fetchdf()

    df['methodology_id'] = df['methodology_name'].apply(uuid_generate_v3)

    df["formulainput_id"] = df.apply(lambda row: uuid_generate_v4(), axis=1)

    df.to_csv(
        f"{output_dir}/FormulaInputs.csv", index=False
    )

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "formulainput_id": id,
        }
        for id in df["formulainput_id"]
    ]

    write_dic_to_csv(
        output_dir, "DataSourceFormulaInput", datasource_emissions_factor_data
    )
