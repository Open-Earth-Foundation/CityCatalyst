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
    # Formula Input Values
    # =================================================================
    conn = duckdb.connect(':memory:')

    query = f"""
            INSTALL spatial;
            LOAD spatial;
            
            CREATE OR REPLACE TABLE waste_ef AS 
            SELECT "EF ID" AS ef_id,
            REPLACE(REGEXP_REPLACE("IPCC 1996 Source/Sink Category", '\n', '|'), CHR(10), '|') AS ipcc_sector_multi,
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
            AND regexp_matches("IPCC 1996 Source/Sink Category", '\n');

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
                    trim(COALESCE(technologies_paractises, '') || ' ' || COALESCE(parameters_conditions,'') || '' || COALESCE(control_paractises,'') || ' '|| COALESCE(properties,'')) as emissionfactor_details
            FROM waste_ef_split_gas
            WHERE gas != '';

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
                ('Azerbaijan', 'AZ')
            ) AS t (country_name, country_code);

            CREATE OR REPLACE TABLE waste_default_values AS
            SELECT  
                ef_id,
                ipcc_sector,
                CASE 
                    WHEN ipcc_sector = '6A - Solid Waste Disposal on Land' THEN 'Solid Waste'
                    WHEN ipcc_sector IN ('6B - Wastewater Handling', '6B2 - Domestic and Commercial Wastewater') THEN 'Wastewater'
                    WHEN ipcc_sector = '6B1 - Industrial Wastewater' THEN 'Wastewater'
                    WHEN ipcc_sector = '6C - Waste Incineration' THEN 'Waste Incineration' 
                END AS gpc_sector,
                lower(gas) AS gas_name,
                CASE 
                    WHEN gas = 'METHANE' THEN 'CH4'
                    WHEN gas = 'NITROUS OXIDE' THEN 'N2O'
                    WHEN gas = 'CARBON DIOXIDE' THEN 'CO2' 
                END AS gas,
                description AS description,
                CASE 
                    WHEN gpc_sector = 'Solid Waste' THEN 
                        CASE 
                            WHEN description LIKE '%DOCf%' OR description LIKE '%Fraction%DOC%' OR description LIKE '%DOC%fraction%' THEN 'DOCf'
                            WHEN description LIKE '%DDOCm%' THEN 'DDOCm'
                            WHEN description LIKE '%DOC%' AND lower(description) NOT LIKE '%fraction%' AND lower(description) NOT LIKE '%frction%' THEN 'DOC'
                            WHEN description LIKE '%MCF%' THEN 'MCF'
                            WHEN description LIKE '%fraction of methane%' THEN 'F'
                            WHEN description LIKE '%oxidation factor%' THEN 'OX'
                            WHEN description LIKE '%(k)%' THEN 'k'
                            ELSE NULL
                        END
                    WHEN gpc_sector LIKE '%Wastewater%' THEN
                        CASE 
                            WHEN lower(description) LIKE '%wastewater generation%' THEN 'W_i'
                            WHEN lower(description) LIKE '%cod%' THEN 'COD_i'
                            WHEN lower(description) LIKE '% bo' THEN 'B0'
                            WHEN lower(description) LIKE '%mcf%' THEN 'MCF'
                            WHEN Description LIKE '%BOD%' THEN 'BOD'
                            ELSE NULL
                        END
                END AS parameter_code,
                CASE 
                    WHEN gpc_sector = 'Solid Waste' THEN 
                        CASE 
                            WHEN (description LIKE '%MSW%' OR  emissionsfactor_units like '%BOD%') THEN 'Domestic'
                            WHEN (lower(description) LIKE '%industrial%' OR description LIKE '%industry%' OR emissionsfactor_units like '%COD%') THEN 'Industrial'
                            WHEN description LIKE '%clinical%' THEN 'Clinical'
                            ELSE NULL
                        END
                    WHEN gpc_sector = 'Wastewater' THEN
                        CASE 
                            WHEN (parameter_code = 'BOD' OR emissionsfactor_units like '%BOD%') THEN 'Domestic'
                            WHEN (parameter_code = 'COD_i' OR lower(description) LIKE '%industrial%' OR description LIKE '%industry%' OR emissionsfactor_units like '%COD%') THEN 'Industrial'
                            WHEN description LIKE '%clinical%' THEN 'Clinical'
                            ELSE NULL 	
                        END
                    ELSE NULL
                END AS gpc_subsector,
                type_parameter,
                CASE 
                    WHEN regexp_extract(technical_reference, '([0-9]{4})') = '' OR regexp_extract(technical_reference, '([0-9]{4})') IS NULL THEN regexp_extract(type_parameter, '([0-9]{4})')
                    ELSE regexp_extract(technical_reference, '([0-9]{4})') 
                END AS technical_reference_year,
                CASE 
                    WHEN parameter_code IN ('DOCf', 'DOC') THEN 'waste_form'
                    WHEN parameter_code IN ('MCF', 'OX') AND gpc_sector = 'Solid Waste' THEN 'treatment_type'
                    WHEN parameter_code = 'k' THEN 'climate'
                    WHEN parameter_code IN ('COD_i', 'W_i') THEN 'industry_type'
                    WHEN parameter_code = 'MCF' AND gpc_sector LIKE '%water%' THEN 'treatment_type'
                    ELSE NULL
                END AS parameter_subcategory_type1,
                CASE 
                    WHEN parameter_code IN ('DOCf', 'DOC') THEN
                        CASE 
                            WHEN lower(emissionfactor_details) LIKE '%wet waste%' OR emissionsfactor_units LIKE '%wet%' THEN 'wet waste'
                            WHEN lower(emissionfactor_details) LIKE '%dry waste%' OR emissionsfactor_units LIKE '%dry%' THEN 'dry waste'
                            ELSE 'unclassified'
                        END
                    WHEN parameter_code = 'MCF' AND gpc_sector = 'Solid Waste' THEN
                        CASE 
                            WHEN lower(emissionfactor_details) LIKE '%managed%anaerobic%' THEN 'Managed – Anaerobic'
                            WHEN lower(emissionfactor_details) LIKE '%semi%aerobic%well%' THEN 'Managed Well – Semi-Aerobic'
                            WHEN lower(emissionfactor_details) LIKE '%semi%aerobic%poor%' THEN 'Managed Poorly – Semi-Aerobic'
                            WHEN lower(emissionfactor_details) LIKE '%active%aeration%poor%' THEN 'Managed Poorly – Active Aeration'
                            WHEN lower(emissionfactor_details) LIKE '%active%aeration%' THEN 'Managed Well – Active Aeration'    
                            WHEN lower(emissionfactor_details) LIKE '%managed%greater%5%' OR lower(emissionfactor_details) LIKE '%unmanaged-deep%' THEN 'Unmanaged Waste Sites - Deep SWDS'
                            WHEN lower(emissionfactor_details) LIKE '%managed%less%5%' THEN 'Unmanaged Waste Sites - Shallow SWDS'     
                            WHEN lower(emissionfactor_details) LIKE '%uncategorised%' OR lower(emissionfactor_details) LIKE '%uncategorized%' THEN 'Uncategorized Waste Sites'     
                            ELSE 'Other'
                        END
                    WHEN parameter_code = 'OX' THEN
                        CASE 
                            WHEN lower(emissionfactor_details) LIKE '%unmanaged%' THEN 'Unmanaged'
                            WHEN lower(emissionfactor_details) LIKE '%well-managed%' THEN 'Managed'
                            ELSE NULL
                        END
                    WHEN parameter_code = 'k' THEN
                        CASE 
                            WHEN (emissionfactor_details LIKE '%< 1%' OR emissionfactor_details LIKE '%< 1000 mm%') AND lower(emissionfactor_details) LIKE '%dry%' THEN 'Temperate - Dry'
                            WHEN (emissionfactor_details LIKE '%< 1%' OR emissionfactor_details LIKE '%< 1000 mm%') AND lower(emissionfactor_details) LIKE '%wet%' THEN 'Temperate - Wet'
                            WHEN lower(emissionfactor_details) LIKE '%moist%' THEN 'Tropical - Moist'
                            WHEN (emissionfactor_details LIKE '%> 1%' OR emissionfactor_details LIKE '%> 1000 mm%') AND lower(emissionfactor_details) LIKE '%dry%' THEN 'Tropical - Dry'
                            WHEN lower(emissionfactor_details) LIKE '%dry%' THEN 'Dry'
                            WHEN lower(emissionfactor_details) LIKE '%wet%' THEN 'Wet'
                        END
                    WHEN parameter_code IN ('COD_i', 'W_i') THEN
                        CASE
                            WHEN lower(emissionfactor_details) LIKE '%starch%' THEN 'Starch Production'
                            WHEN lower(emissionfactor_details) LIKE '%leather%' THEN 'Leather Tanning'
                            WHEN lower(emissionfactor_details) LIKE '%potato%' THEN 'Potato Processing'
                            WHEN lower(emissionfactor_details) LIKE '%textile%' THEN 'Textiles'
                            WHEN lower(emissionfactor_details) LIKE '%vegetable oil%' THEN 'Vegetable Oils'
                            WHEN lower(emissionfactor_details) LIKE '%beer%' OR lower(emissionfactor_details) LIKE '%malt%' THEN 'Beer & Malt'
                            WHEN lower(emissionfactor_details) LIKE '%fish%' THEN 'Fish Processing'
                            WHEN lower(emissionfactor_details) LIKE '%plastics%' OR lower(emissionfactor_details) LIKE '%resins%' THEN 'Plastics & Resins'
                            WHEN lower(emissionfactor_details) LIKE '%sugar%' OR lower(emissionfactor_details) LIKE '%suger%' THEN 'Sugar Refining'
                            WHEN lower(emissionfactor_details) LIKE '%dairy%' THEN 'Dairy Products'
                            WHEN lower(emissionfactor_details) LIKE '%pulp & paper%' OR lower(emissionfactor_details) LIKE '%paper%' THEN 'Pulp & Paper'
                            WHEN lower(emissionfactor_details) LIKE '%soft drink%' THEN 'Soft Drinks'
                            WHEN lower(emissionfactor_details) LIKE '%apple%' THEN 'Apple Processing'
                            WHEN lower(emissionfactor_details) LIKE '%distilled%' OR lower(emissionfactor_details) LIKE '%ethanol%' THEN 'Distilled & Ethanol Beverages'
                            WHEN lower(emissionfactor_details) LIKE '%organic chemicals%' THEN 'Organic Chemicals'
                            WHEN lower(emissionfactor_details) LIKE '%alcohol%' THEN 'Alcohol Refining'
                            WHEN lower(emissionfactor_details) LIKE '%wine%' OR lower(emissionfactor_details) LIKE '%vinegar%' THEN 'Wine & Vinegar'
                            WHEN lower(emissionfactor_details) LIKE '%frozen food%' THEN 'Frozen Food Processing'
                            WHEN lower(emissionfactor_details) LIKE '%seasoning%' THEN 'Seasoning'
                            WHEN lower(emissionfactor_details) LIKE '%meat%' OR lower(emissionfactor_details) LIKE '%poultry%' THEN 'Meat & Poultry'
                            WHEN lower(emissionfactor_details) LIKE '%soap%' OR lower(emissionfactor_details) LIKE '%detergents%' THEN 'Soap & Detergents'
                            WHEN lower(emissionfactor_details) LIKE '%petroleum%' OR lower(emissionfactor_details) LIKE '%refineries%' THEN 'Petroleum Refining'
                            WHEN lower(emissionfactor_details) LIKE '%fruits%' OR lower(emissionfactor_details) LIKE '%vegetables%' OR lower(emissionfactor_details) LIKE '%cannery%' THEN 'Fruits & Vegetables Processing'
                            WHEN lower(emissionfactor_details) LIKE '%paints%' THEN 'Paints'
                            WHEN lower(emissionfactor_details) LIKE '%coffee%' THEN 'Coffee'
                            WHEN lower(emissionfactor_details) LIKE '%iron%' OR lower(emissionfactor_details) LIKE '%steel%' THEN 'Iron & Steel Manufacturing'
                            WHEN lower(emissionfactor_details) LIKE '%drugs%' OR lower(emissionfactor_details) LIKE '%medicines%' OR lower(emissionfactor_details) LIKE '%pharmaceuticals%' THEN 'Pharmaceuticals'
                            WHEN lower(emissionfactor_details) LIKE '%petroleum production%' THEN 'Petroleum Production'
                            WHEN lower(emissionfactor_details) LIKE '%coke%' THEN 'Coke Production'
                            WHEN lower(emissionfactor_details) LIKE '%ice cream%' THEN 'Ice Cream Production'
                            WHEN lower(emissionfactor_details) LIKE '%animal feed%' THEN 'Animal Feed Production'
                            WHEN lower(emissionfactor_details) LIKE '%rubber%' THEN 'Rubber Manufacturing'
                            WHEN lower(emissionfactor_details) LIKE '%nitrogen%' THEN 'Nitrogen Fertiliser Production'
                            WHEN lower(emissionfactor_details) LIKE '%canneries%' THEN 'Canneries'
                            WHEN lower(emissionfactor_details) LIKE '%tannery%' THEN 'Tannery'
                            WHEN lower(emissionfactor_details) LIKE '%grapes%' THEN 'Grapes Processing'
                            WHEN lower(emissionfactor_details) LIKE '%flour%' THEN 'Flour Products'
                            WHEN lower(emissionfactor_details) LIKE '%chemical%' THEN 'Chemical Products'
                            WHEN lower(emissionfactor_details) LIKE '%citrus%' THEN 'Citrus Processing'
                            WHEN lower(emissionfactor_details) LIKE '%domestic wastewater%' THEN 'Domestic Wastewater Treatment'
                            WHEN lower(emissionfactor_details) LIKE '%petrochemical%' THEN 'Petrochemical Products'
                            WHEN lower(emissionfactor_details) LIKE '%food - oils%' THEN 'Food Oils'
                            WHEN lower(emissionfactor_details) LIKE '%other vegetable processing%' THEN 'Other Vegetable Processing'
                            WHEN lower(emissionfactor_details) LIKE '%non-citrus%' THEN 'Non-Citrus Processing'   
                            ELSE 'Other'
                        END
                    WHEN parameter_code IN ('MCF') AND gpc_sector LIKE '%water%' THEN 
                        CASE
                            WHEN lower(emissionfactor_details) LIKE '%flowing sewer%' THEN 'Flowing Sewer'
                            WHEN lower(emissionfactor_details) LIKE '%sea, river, lake discharge%' THEN 'Flowing Water'
                            WHEN lower(emissionfactor_details) LIKE '%stagnant sewer%' THEN 'Stagnant Sewer'
                            WHEN lower(emissionfactor_details) LIKE '%anaerobic reactor%' 
                            OR lower(emissionfactor_details) LIKE '%a2o%' THEN 'Anaerobic Reactor'
                            WHEN lower(emissionfactor_details) LIKE '%septic%' THEN 'Septic Tank'
                            WHEN lower(emissionfactor_details) LIKE '%centralized% aerobic treatment%'
                            OR lower(emissionfactor_details) LIKE '%centralised% aerobic treatment%' THEN 'Centralized Aerobic Treatment Plant'
                            WHEN lower(emissionfactor_details) LIKE '%anaerobic shallow lagoon%' 
                            OR lower(emissionfactor_details) LIKE '%facultative lagoons%' THEN 'Anaerobic Shallow Lagoon'
                            WHEN lower(emissionfactor_details) LIKE '%bardenpho%' THEN 'Bardenpho Treatment'
                            WHEN lower(emissionfactor_details) LIKE '%biological nutrient removal%' THEN 'Biological Nutrient Removal'
                            WHEN lower(emissionfactor_details) LIKE '%latrine%' THEN 'Latrine'
                            WHEN lower(emissionfactor_details) LIKE '%untreated%' THEN 'Untreated System'
                            WHEN lower(emissionfactor_details) LIKE '%treated anaerobic%' 
                            OR lower(emissionfactor_details) LIKE '%anaerobic digester%' 
                            OR lower(emissionfactor_details) LIKE '%anaerobic shallow lagoon%' 
                            OR lower(emissionfactor_details) LIKE '%anaerobic deep lagoon%' THEN 'Anaerobic Treatment'
                            WHEN lower(emissionfactor_details) LIKE '%treated aerobic%' 
                            OR lower(emissionfactor_details) LIKE '%well-managed aerobic%' THEN 'Aerobic Treatment Plant - Well Managed'
                            WHEN lower(emissionfactor_details) LIKE '%overloaded aerobic%' THEN 'Aerobic Treatment Plant - Overloaded'
                            WHEN lower(emissionfactor_details) LIKE '%discharge to aquatic%' 
                            OR lower(emissionfactor_details) LIKE '%reservoir%' THEN 'Discharge to Aquatic Environments'
                            WHEN lower(emissionfactor_details) LIKE '%activated sludge%' THEN 'Activated Sludge'
                            ELSE 'Other'
                        END
                END AS parameter_subcategory_typename1,
                CASE 
                    WHEN parameter_code IN ('DOCf', 'DOC', 'k') THEN 'waste_type'
                    ELSE NULL 
                END AS parameter_subcategory_type2,
                CASE 
                    WHEN parameter_code IN ('DOCf', 'DOC') THEN
                        CASE 
                            WHEN lower(emissionfactor_details) LIKE '%food%' THEN 'Food Waste'
                            WHEN lower(emissionfactor_details) LIKE '%textile%' THEN 'Textile'
                            WHEN lower(emissionfactor_details) LIKE '%paper%' THEN 'Paper/Cardboard'
                            WHEN lower(emissionfactor_details) LIKE '%wood%' THEN 'Wood'
                            WHEN lower(emissionfactor_details) LIKE '%garden%' THEN 'Garden and Park Waste'
                            WHEN lower(emissionfactor_details) LIKE '%nappies%' THEN 'Nappies'
                            WHEN lower(emissionfactor_details) LIKE '%rubber%' THEN 'Rubber and Leather'
                            WHEN lower(emissionfactor_details) LIKE '%clinical%' THEN 'Clinical Waste'
                            ELSE NULL
                        END
                    WHEN parameter_code = 'k' THEN
                        CASE 
                            WHEN lower(emissionfactor_details) LIKE '%slow%' THEN 'Slowly Degrading Waste'
                            WHEN lower(emissionfactor_details) LIKE '%rapid%' THEN 'Rapidly Degrading Waste'
                            WHEN lower(emissionfactor_details) LIKE '%bulk%' OR lower(emissionfactor_details) LIKE '%mixed%' THEN 'Bulk MSW or Industrial Waste'
                            ELSE NULL
                        END
                    ELSE NULL
                END AS parameter_subcategory_typename2,
                emissionsfactor_value,
                emissionsfactor_units,
                COALESCE(CASE 
                    WHEN lower(region) LIKE '%latin america%' THEN 'Latin America'
                    WHEN lower(region) LIKE '%brazil%' THEN 'Brazil'
                    WHEN lower(region) LIKE '%chile%' THEN 'Chile'
                    WHEN lower(region) LIKE '%argentina%' THEN 'Argentina'
                    WHEN region IS NULL OR region = 'Region: Generic' THEN 'Global'
                    ELSE NULL
                END, b.country_name) AS region,
                b.country_code as actor_id,
                data_source,
                technical_reference,
                emissionfactor_details
            FROM waste_emissionfactor a
            LEFT JOIN country_region_codes b
            ON a.region = b.country_name;

            CREATE OR REPLACE TABLE waste_default_values_rnk AS
            SELECT 
                gpc_sector,
                gas_name,
                gas,
                parameter_code,
                gpc_subsector,
                technical_reference_year,
                parameter_subcategory_type1,
                parameter_subcategory_typename1,
                parameter_subcategory_type2,
                parameter_subcategory_typename2,
                emissionsfactor_value,
                emissionsfactor_units,
                region,
                data_source,
                actor_id,
                ef_id AS ipcc_ef_id,
                RANK() OVER (
                    PARTITION BY 
                        parameter_code,
                        parameter_subcategory_type1,
                        parameter_subcategory_typename1,
                        parameter_subcategory_type2,
                        parameter_subcategory_typename2 
                    ORDER BY 
                        technical_reference_year DESC
                ) AS rnk
            FROM 
                waste_default_values
            WHERE 
                parameter_code IS NOT NULL 
                AND (actor_id IS NOT NULL OR region IS NOT NULL)
            ORDER BY 
                parameter_code,
                parameter_subcategory_type1,
                parameter_subcategory_typename1,
                parameter_subcategory_type2,
                parameter_subcategory_typename2,
                technical_reference_year DESC;

            
            CREATE OR REPLACE TABLE waste_formula_input_values AS
            SELECT 
                gas,
                parameter_code,
                gpc_sector,
                gpc_subsector,
                technical_reference_year AS year,
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
                    WHEN parameter_code = 'B0' THEN 'Kg/Kg'
                    WHEN parameter_code = 'BOD' THEN emissionsfactor_units
                    WHEN parameter_code = 'COD_i' AND emissionsfactor_units LIKE '%kg%/m3%' THEN 'kg/m3'
                    WHEN parameter_code IN ('DDOCm', 'DOC', 'DOCf', 'F', 'OX', 'MCF') THEN 'fraction'
                    WHEN parameter_code = 'k' THEN 'year'
                    WHEN parameter_code = 'W_i' AND emissionsfactor_units LIKE '%m3%/tonne%' THEN 'm3/tonne'
                    WHEN parameter_code = 'W_i' AND emissionsfactor_units LIKE '%m3%/%m3%' THEN 'm3/m3'
                    ELSE NULL
                END AS formula_input_units,
                json_object(
                    parameter_subcategory_type1,parameter_subcategory_typename1,
                    parameter_subcategory_type2,parameter_subcategory_typename2
                ) AS metadata,
                region,
                actor_id,
                'IPCC' AS datasource
            FROM 
                waste_default_values_rnk
            WHERE 
                rnk = 1
                AND formula_input_units IS NOT NULL
                ;
            
            
			CREATE OR REPLACE TABLE waste_formula_input_description AS 
			SELECT 	*,
			        CASE 
			            WHEN methodology LIKE '%industrial%' THEN 'Industrial'
			            WHEN methodology LIKE '%domestic%' THEN 'Domestic' 
			            ELSE NULL 
			        END AS gpc_subsector
			FROM (VALUES
			    ('W-i', 'Wastewater', LOWER(REPLACE('wastewater generation', ' ', '-')), LOWER(REPLACE('Industrial Wastewater', ' ', '-'))),
			    ('COD-i', 'Wastewater', LOWER(REPLACE('chemical oxygen demand', ' ', '-')), LOWER(REPLACE('Industrial Wastewater', ' ', '-'))),
			    ('B0', 'Wastewater', LOWER(REPLACE('maximum methane producing capacity', ' ', '-')), LOWER(REPLACE('Industrial Wastewater', ' ', '-'))),
			    ('MCF', 'Wastewater', LOWER(REPLACE('methane correction factor', ' ', '-')), LOWER(REPLACE('Industrial Wastewater', ' ', '-'))),
			    ('BOD', 'Wastewater', LOWER(REPLACE('degradable organic component', ' ', '-')), LOWER(REPLACE('Domestic Wastewater', ' ', '-'))),
			    ('I', 'Wastewater', LOWER(REPLACE('correction factor for industrial BOD discharged in sewers', ' ', '-')), LOWER(REPLACE('Domestic Wastewater', ' ', '-'))),
			    ('B0', 'Wastewater', LOWER(REPLACE('maximum methane producing capacity', ' ', '-')), LOWER(REPLACE('Domestic Wastewater', ' ', '-'))),
			    ('MCF', 'Wastewater', LOWER(REPLACE('methane correction factor', ' ', '-')), LOWER(REPLACE('Domestic Wastewater', ' ', '-'))),
			    ('DOC', 'Solid Waste', LOWER(REPLACE('degradable organic carbon under aerobic conditions', ' ', '-')), LOWER(REPLACE('First Order Decay', ' ', '-'))),
			    ('DOCf', 'Solid Waste', LOWER(REPLACE('fraction of DOC decomposing under anaerobic conditions', ' ', '-')), LOWER(REPLACE('First Order Decay', ' ', '-'))),
			    ('MCF', 'Solid Waste', LOWER(REPLACE('methane correction factor', ' ', '-')), LOWER(REPLACE('First Order Decay', ' ', '-'))),
			    ('k', 'Solid Waste', LOWER(REPLACE('rate of reaction constant', ' ', '-')), LOWER(REPLACE('First Order Decay', ' ', '-'))),
			    ('OX(T)', 'Solid Waste', LOWER(REPLACE('oxidation factor in year T', ' ', '-')), LOWER(REPLACE('First Order Decay', ' ', '-'))),
			    ('DOC-i', 'Solid Waste', LOWER(REPLACE('fraction of degradable organic carbon', ' ', '-')), LOWER(REPLACE('Methane Commitment', ' ', '-'))),
			    ('MCF-j', 'Solid Waste', LOWER(REPLACE('methane correction factor', ' ', '-')), LOWER(REPLACE('Methane Commitment', ' ', '-'))),
			    ('F', 'Solid Waste', LOWER(REPLACE('fraction of methane in landfill gas', ' ', '-')), LOWER(REPLACE('Methane Commitment', ' ', '-'))),
			    ('OX', 'Solid Waste', LOWER(REPLACE('oxidation factor', ' ', '-')), LOWER(REPLACE('Methane Commitment', ' ', '-'))),
			    ('EF', 'Biological Treatment', LOWER(REPLACE('emission factor', ' ', '-')), LOWER(REPLACE('Biological Treatment', ' ', '-')))
			) AS t (parameter, sector, parameter_name, methodology);


            CREATE OR REPLACE TABLE waste_formula_input AS 
            WITH waste_formula_input AS (   
            SELECT DISTINCT 
                b.gas,
                b.parameter_code,
                a.parameter_name,
                a.methodology,
                b.gpc_sector,
                CASE WHEN b.gpc_sector = 'Solid Waste' THEN ARRAY['III.1.1', 'III.1.3']
                    WHEN b.gpc_sector = 'Wastewater' THEN ARRAY['III.4.1', 'III.4.3']
                END AS gpc_refno,
                b.gpc_subsector,
                b.year,
                b.formula_input_value,
                b.formula_input_units,
                b.metadata,
                b.region,
                actor_id,
                b.datasource
            FROM 
                waste_formula_input_description a 
            INNER JOIN 
                waste_formula_input_values b 
            ON 
                a.sector = b.gpc_sector 
                AND a.parameter = b.parameter_code 
                AND COALESCE(b.gpc_subsector, 'unk') = COALESCE(a.gpc_subsector, 'unk'))
            SELECT 	DISTINCT gas,
                    parameter_code,
                    parameter_name,
                    methodology,
                    UNNEST(gpc_refno) AS gpc_refno,
                    year,
                    formula_input_value,
                    formula_input_units,
                    null as formula_name,
                    metadata,
                    region,
                    case when region = 'Global' then 'GLOBAL'
                    else actor_id end as actor_id,
                    datasource
            FROM waste_formula_input;
            """
    conn.execute(query)

    df = conn.execute("SELECT * FROM waste_formula_input").fetchdf()

    query2 = f"""
            CREATE OR REPLACE TABLE waste_ef AS 
            SELECT "EF ID" AS ef_id,
            REPLACE(REGEXP_REPLACE("IPCC 1996 Source/Sink Category", '\n', '|'), CHR(10), '|') AS ipcc_sector_multi,
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
            AND regexp_matches("IPCC 1996 Source/Sink Category", '\n');

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
                    trim(COALESCE(Description, '') || COALESCE(technologies_paractises, '') || ' ' || COALESCE(parameters_conditions,'') || '' || COALESCE(control_paractises,'') || ' '|| COALESCE(properties,'')) as emissionfactor_details
            FROM waste_ef_split_gas
            WHERE gas != '';

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
                ('Azerbaijan', 'AZ')
            ) AS t (country_name, country_code);

            CREATE OR REPLACE TABLE waste_default_values AS 
            WITH dmi AS (
            SELECT 	ef_id,
                    ipcc_sector,
                    'Waste Incineration' AS sector,
                    CASE 
                    WHEN gas = 'METHANE' THEN 'CH4'
                    WHEN gas = 'NITROUS OXIDE' THEN 'N2O'
                    WHEN gas = 'CARBON DIOXIDE' THEN 'CO2' 
                    END AS gas,
                    CASE WHEN lower(Description) like '%dry%matter%' THEN 'dmi'
                    ELSE NULL END AS parameter_code,
                    CASE 
                    WHEN regexp_extract(technical_reference, '([0-9]{4})') = '' OR regexp_extract(technical_reference, '([0-9]{4})') IS NULL THEN regexp_extract(type_parameter, '([0-9]{4})')
                    ELSE regexp_extract(technical_reference, '([0-9]{4})') 
                    END AS technical_reference_year,
                    CASE WHEN lower(Description) like '%dry%matter%' THEN 'waste_type'
                    END AS parameter_subcategory_type1,
                    CASE WHEN lower(Description) like '%dry%matter%' THEN technologies_paractises
                    END AS parameter_subcategory_typename1,
                    COALESCE(b.country_code, 'GLOBAL') as actor_id,
                    data_source,
                    emissionsfactor_value,
                    emissionsfactor_units,
                    technical_reference,
                    emissionfactor_details  	
            FROM waste_emissionfactor a
            LEFT JOIN country_region_codes b
            ON a.region = b.country_name
            WHERE ipcc_sector = '6C - Waste Incineration'
            AND lower(a.Description) like '%dry%matter%'),
            fraction_carbon AS (
            -- fraction of carbon
            SELECT 	ef_id,
                    ipcc_sector,
                    'Waste Incineration' AS sector,
                    CASE 
                    WHEN gas = 'METHANE' THEN 'CH4'
                    WHEN gas = 'NITROUS OXIDE' THEN 'N2O'
                    WHEN gas = 'CARBON DIOXIDE' THEN 'CO2' 
                    END AS gas,
                    CASE WHEN lower(a.Description) like '%fraction of carbon%' THEN 'CFi'
                    ELSE NULL END AS parameter_code,
                    CASE 
                    WHEN regexp_extract(technical_reference, '([0-9]{4})') = '' OR regexp_extract(technical_reference, '([0-9]{4})') IS NULL THEN regexp_extract(type_parameter, '([0-9]{4})')
                    ELSE regexp_extract(technical_reference, '([0-9]{4})') 
                    END AS technical_reference_year,
                    CASE WHEN lower(Description) like '%dry%matter%' THEN 'waste_type'
                    END AS parameter_subcategory_type1,
                    CASE WHEN lower(Description) like '%medical%' THEN 'Medical'
                        WHEN lower(Description) like '%paper%cardboard%' THEN 'Paper/cardboard'
                        WHEN lower(Description) like '%pet%bottles%' THEN 'PET bottles'
                    END AS parameter_subcategory_typename1,
                    COALESCE(b.country_code, region, 'GLOBAL') as actor_id,
                    data_source,
                    emissionsfactor_value,
                    emissionsfactor_units,
                    technical_reference,
                    emissionfactor_details  	
            FROM waste_emissionfactor a
            LEFT JOIN country_region_codes b
            ON a.region = b.country_name
            WHERE ipcc_sector = '6C - Waste Incineration'
            AND lower(a.Description) like '%fraction of carbon%'),
            fossil_carbon AS (
            -- fossil carbon
            SELECT 	ef_id,
                    ipcc_sector,
                    'Waste Incineration' AS sector,
                    CASE 
                    WHEN gas = 'METHANE' THEN 'CH4'
                    WHEN gas = 'NITROUS OXIDE' THEN 'N2O'
                    WHEN gas = 'CARBON DIOXIDE' THEN 'CO2' 
                    END AS gas,
                    CASE WHEN lower(a.Description) like '%fossil%carbon%' THEN 'FCFi'
                    END AS parameter_code,
                    CASE 
                    WHEN regexp_extract(technical_reference, '([0-9]{4})') = '' OR regexp_extract(technical_reference, '([0-9]{4})') IS NULL THEN regexp_extract(type_parameter, '([0-9]{4})')
                    ELSE regexp_extract(technical_reference, '([0-9]{4})') 
                    END AS technical_reference_year,
                    'waste_type' AS parameter_subcategory_type1,
                    CASE 
                    WHEN emissionfactor_details ILIKE '%plastic%' THEN 'Plastics'
                    WHEN emissionfactor_details ILIKE '%other, inert waste%' THEN 'Other, inert waste'
                    WHEN emissionfactor_details ILIKE '%food%' THEN 'Food waste'
                    WHEN emissionfactor_details ILIKE '%wood%' THEN 'Wood'
                    WHEN emissionfactor_details ILIKE '%garden%' OR emissionfactor_details ILIKE '%park%' THEN 'Garden and Park waste'
                    WHEN emissionfactor_details ILIKE '%paper%' OR emissionfactor_details ILIKE '%cardboard%' THEN 'Paper/cardboard'
                    WHEN emissionfactor_details ILIKE '%rubber%' OR emissionfactor_details ILIKE '%leather%' THEN 'Rubber and Leather'
                    WHEN emissionfactor_details ILIKE '%textile%' THEN 'Textile'
                    WHEN emissionfactor_details ILIKE '%nappies%' OR emissionfactor_details ILIKE '%diaper%' THEN 'Nappies'
                    WHEN emissionfactor_details ILIKE '%metal%' THEN 'Metal'
                    ELSE 'Uncategorized' END parameter_subcategory_typename1,
                    COALESCE(b.country_code, region, 'GLOBAL') as actor_id,
                    data_source,
                    emissionsfactor_value,
                    emissionsfactor_units,
                    technical_reference,
                    emissionfactor_details  	
            FROM waste_emissionfactor a
            LEFT JOIN country_region_codes b
            ON a.region = b.country_name
            WHERE ipcc_sector = '6C - Waste Incineration'
            AND lower(a.Description) like '%fossil%carbon%'), 
            oxidation_factor AS (
            SELECT 	ef_id,
                    ipcc_sector,
                    'Waste Incineration' AS sector,
                    CASE 
                    WHEN gas = 'METHANE' THEN 'CH4'
                    WHEN gas = 'NITROUS OXIDE' THEN 'N2O'
                    WHEN gas = 'CARBON DIOXIDE' THEN 'CO2' 
                    END AS gas,
                    CASE WHEN lower(a.Description) like '%fossil%carbon%' THEN 'OFi'
                    END AS parameter_code,
                    CASE 
                    WHEN regexp_extract(technical_reference, '([0-9]{4})') = '' OR regexp_extract(technical_reference, '([0-9]{4})') IS NULL THEN regexp_extract(type_parameter, '([0-9]{4})')
                    ELSE regexp_extract(technical_reference, '([0-9]{4})') 
                    END AS technical_reference_year,
                    'waste_type' AS parameter_subcategory_type1,
                    CASE WHEN (emissionfactor_details LIKE '%MSW%' OR lower(emissionfactor_details) LIKE '%municipal%') THEN 'Muncipal Solid Waste'
                        WHEN lower(emissionfactor_details) LIKE '%sludge%' THEN 'Sludge'
                        WHEN lower(emissionfactor_details) LIKE '%industrial%' THEN 'Industrial'
                        WHEN lower(emissionfactor_details) LIKE '%clinical%' THEN 'Clinical'
                        WHEN lower(emissionfactor_details) LIKE '%sewage%' THEN 'Sewage'
                        WHEN lower(emissionfactor_details) LIKE '%hazardous%' THEN 'Hazardous'
                    END AS subcategory_typename1, 
                    COALESCE(b.country_code, region, 'GLOBAL') as actor_id,
                    data_source,
                    emissionsfactor_value,
                    emissionsfactor_units,
                    technical_reference,
                    emissionfactor_details  	
            FROM waste_emissionfactor a
            LEFT JOIN country_region_codes b
            ON a.region = b.country_name
            WHERE ipcc_sector = '6C - Waste Incineration'
            AND lower(a.Description) like '%fossil%carbon%')
            SELECT *
            FROM dmi
            UNION
            SELECT *
            FROM fraction_carbon
            UNION
            SELECT *
            FROM fossil_carbon
            UNION
            SELECT *
            FROM oxidation_factor
            ;

            CREATE OR REPLACE TABLE waste_default_values_rnk AS
            SELECT 	sector AS gpc_sector,
                    gas,
                    parameter_code,
                    technical_reference_year AS year,
                    COALESCE(parameter_subcategory_type1, 'waste_type') AS parameter_subcategory_type1,
                    parameter_subcategory_typename1,
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
                '%' AS formula_input_units,
                'IPCC' AS datasource,
                actor_id,
                RANK() OVER(PARTITION BY sector, gas, parameter_code, parameter_subcategory_type1, parameter_subcategory_typename1, actor_id ORDER BY technical_reference_year DESC) AS RNK
            FROM waste_default_values
            WHERE (LENGTH(actor_id) = 2 OR actor_id = 'GLOBAL')
            AND formula_input_value > 0;

            CREATE TABLE waste_formula_input_incineration AS
            WITH waste_formula_input AS (
            SELECT 	gas,
                    parameter_code,
                    CASE WHEN parameter_code = 'dmi' THEN 'dry-matter-content'
                        WHEN parameter_code = 'CFi' THEN 'fraction-of-carbon'
                        WHEN parameter_code = 'FCFi' THEN 'fraction-of-fossil-carbon'
                        WHEN parameter_code = 'OFi'THEN 'oxidation-factor'
                    ELSE NULL END AS parameter_name,
                    'incineration-waste' AS methodology,
                    ARRAY['III.3.1', 'III.3.3'] AS gpc_refno,
                    year,
                    formula_input_value,
                    formula_input_units,
                    null as formula_name,
                    json_object(
                                parameter_subcategory_type1,parameter_subcategory_typename1) AS metadata,
                    NULL AS region,
                    actor_id,
                    datasource		
            FROM waste_default_values_rnk)
            SELECT 	gas,
                    parameter_code,
                    parameter_name,
                    methodology,
                    UNNEST(gpc_refno) AS gpc_refno,
                    year,
                    formula_input_value,
                    formula_input_units,
                    formula_name,
                    metadata,
                    region,
                    actor_id,
                    datasource
            FROM waste_formula_input;
            """
    conn.execute(query2)
    df2 = conn.execute("SELECT * FROM waste_formula_input_incineration").fetchdf()

    df = pd.concat([df, df2]).drop_duplicates().reset_index(drop=True)

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
