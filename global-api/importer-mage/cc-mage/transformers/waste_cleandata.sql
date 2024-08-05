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
                WHEN description LIKE '%MSW%' THEN 'Domestic'
                WHEN lower(description) LIKE '%industrial%' OR description LIKE '%industry%' THEN 'Industrial'
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
    CASE 
        WHEN lower(region) LIKE '%latin america%' THEN 'Latin America'
        WHEN lower(region) LIKE '%brazil%' THEN 'Brazil'
        WHEN lower(region) LIKE '%chile%' THEN 'Chile'
        WHEN lower(region) LIKE '%argentina%' THEN 'Argentina'
        WHEN region IS NULL OR region = 'Region: Generic' THEN 'Global'
        ELSE NULL
    END AS region,
    data_source,
    technical_reference,
    emissionfactor_details
FROM waste_ef
;
