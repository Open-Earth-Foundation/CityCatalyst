-- Step 1: Create Index on geometry_value if it does not exist
CREATE INDEX IF NOT EXISTS idx_geom_emissions_staging ON raw_data.emissions_staging USING GIST (geometry_value);

-- Step 2: Perform spatial join and insert into modelled.emissions
INSERT INTO modelled.emissions (
    gas_name, 
    emissions_value, 
    emissions_year, 
    emissions_units, 
    gpc_refno, 
    geometry_value, 
    source_name, 
    activity_value, 
    geometry_type, 
    actor_id
)
SELECT 
    a.gas_name, 
    a.emissions_value, 
    a.emissions_year, 
    a.emissions_units, 
    a.gpc_refno, 
    ST_SetSRID(a.geometry_value::geometry, 4326),  -- Correct usage of ST_SetSRID
    a.source_name, 
    CAST(a.activity_value AS NUMERIC), 
    a.geometry_type, 
    b.locode
FROM 
    raw_data.emissions_staging a
JOIN 
    public.osm b
ON 
    ST_Intersects(ST_SetSRID(a.geometry_value::geometry, 4326), b.geom);

