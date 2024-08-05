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
FROM ipcc_emissionfactor
WHERE lower("IPCC 2006 Source/Sink Category") LIKE '%waste%'
AND regexp_matches("IPCC 1996 Source/Sink Category", '\n')
;