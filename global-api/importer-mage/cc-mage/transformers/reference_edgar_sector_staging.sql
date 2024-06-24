DROP TABLE IF EXISTS raw_data.edgar_sector_description;

CREATE TABLE raw_data.edgar_sector_description AS
SELECT * FROM (
    VALUES 
    ('AGS', 'Agricultural soils', '4C+4D1+4D2+4D4', '3C2+3C3+3C4+3C7', NULL),
    ('AWB', 'Agricultural waste burning', '4F', '3C1b', NULL),
    ('CHE', 'Chemical processes', '2B', '2B', NULL),
    ('ENE', 'Power industry', '1A1a', '1A1a', NULL),
    ('ENF', 'Enteric fermentation', '4A', '3A1', NULL),
    ('IDE', 'Indirect emissions from NOx and NH3', '7B+7C', '5A', NULL),
    ('IND', 'Combustion for manufacturing', '1A2', '1A2', 'I.3.1'),
    ('IRO', 'Iron and steel production', '2C1a+2C1c+2C1d+2C1e+2C1f+2C2', '2C1+2C2', NULL),
    ('MNM', 'Manure management', '4B', '3A2', NULL),
    ('N2O', 'Indirect N2O emissions from agriculture', '4D3', '3C5+3C6', NULL),
    ('PRO_FFF', 'Fuel exploitation (including fossil fuel fires)', '1B1a+1B2a1+1B2a2+1B2a3+1B2a4+1B2c+7A', '1B1a+1B2aiii2+1B2aiii3+1B2bi+1B2bii+5B', NULL),
    ('PRO_COAL', 'Fuel exploitation COAL', '1B1a', '1B1a', NULL),
    ('PRO_GAS', 'Fuel exploitation GAS', '1B2c', '1B2bi+1B2bii', NULL),
    ('PRO_OIL', 'Fuel exploitation OIL', '1B2a1+1B2a2+1B2a3+1B2a4', '1B2aiii2+1B2aiii3', NULL),
    ('PRU_SOL', 'Solvents and products use', '3', '2D3+2E+2F+2G', NULL),
    ('RCO', 'Energy for buildings', '1A4', '1A4+1A5', NULL),
    ('REF_TRF', 'Oil refineries and Transformation industry', '1A1b+1A1c+1A5b1+1B1b+1B2a5+1B2a6+1B2b5+2C1b', '1A1b+1A1ci+1A1cii+1A5biii+1B1b+1B2aiii6+1B2biii3+1B1c', NULL),
    ('SWD_INC', 'Solid waste incineration', '6C+6Dhaz', '4C','III.3.1 + III.3.2'),
    ('SWD_LDF', 'Solid waste landfills', '6A+6Dcom', '4A+4B', NULL),
    ('TNR_Aviation_CDS', 'Aviation climbing and descent', '1A3a_CDS', '1A3a_CDS', 'II.4.3'),
    ('TNR_Aviation_CRS', 'Aviation cruise', '1A3a_CRS', '1A3a_CRS', 'II.4.3'),
    ('TNR_Aviation_LTO', 'Aviation landing&takeoff', '1A3a_LTO', '1A3a_LTO', 'II.4.3'),
    ('TNR_Other', 'Railways, pipelines, off-road transport', '1A3c+1A3e', '1A3c+1A3e', NULL),
    ('TNR_Ship', 'Shipping', '1A3d+1C2', '1A3d', 'II.3.3'),
    ('TRO', 'Road transportation', '1A3b', '1A3b', 'II.1.1'),
    ('WWT', 'Waste water handling', '6B', '4D', 'III.4.1 + III.4.2')
) AS edgar_sectors (edgar_sector, edgar_description, IPCC_1996_code, IPCC_2006_code, gpc_refno);
