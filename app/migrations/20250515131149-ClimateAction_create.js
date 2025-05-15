"use strict";

const sql_up = `
    CREATE TYPE action_type_enum AS ENUM ('mitigation', 'adaptation');
CREATE TYPE hazard_enum AS ENUM (
    'droughts', 'heatwaves', 'floods', 'sea-level-rise', 'landslides',
    'storms', 'wildfires', 'diseases'
);
CREATE TYPE sector_enum AS ENUM (
    'stationary_energy', 'transportation', 'waste', 'ippu', 'afolu',
    'water_resources', 'food_security', 'energy_security', 'biodiversity',
    'public_health', 'railway_infrastructure', 'road_infrastructure',
    'port_infrastructure', 'geo-hydrological_disasters'
);
CREATE TYPE subsector_enum AS ENUM (
    'residential_buildings', 'commercial_and_institutional_buildings_and_facilities',
    'manufacturing_industries_and_construction', 'energy_industries',
    'energy_generation_supplied_to_the_grid', 'agriculture_forestry_and_fishing_activities',
    'non-specified_sources',
    'fugitive_emissions_mining_storage_transport_coal',
    'fugitive_emissions_from_oil_and_natural_gas_systems', 'on-road', 'railways',
    'waterborne_navigation', 'aviation', 'off-road', 'disposal_of_solid_waste_generated_in_the_city',
    'disposal_of_solid_waste_generated_outside_the_city', 'biological_treatment_of_waste_generated_in_the_city',
    'biological_treatment_of_waste_generated_outside_the_city', 'incineration_and_open_burning_of_waste_generated_in_the_city',
    'incineration_and_open_burning_of_waste_generated_outside_the_city', 'wastewater_generated_in_the_city',
    'wastewater_generated_outside_the_city', 'industrial_processes', 'product_use', 'livestock', 'land',
    'aggregate_sources_and_non-co2_emission_sources_on_land', 'all'
);
CREATE TYPE primary_purpose_enum AS ENUM ('ghg_reduction', 'climate_resilience');
CREATE TYPE adaptation_effectiveness_enum AS ENUM ('high', 'medium', 'low');
CREATE TYPE cost_investment_needed_enum AS ENUM ('high', 'medium', 'low');
CREATE TYPE timeline_for_implementation_enum AS ENUM ('<5 years', '5-10 years', '>10 years');
CREATE TYPE biome_enum AS ENUM (
    'none', 'tropical_rainforest', 'temperate_forest', 'desert', 'grassland_savanna',
    'tundra', 'wetlands', 'mountains', 'boreal_forest_taiga', 'coastal_marine'
);
CREATE TYPE language_enum AS ENUM ('en', 'es', 'pt', 'de');

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()
CREATE TABLE ClimateActions (
    action_id UUID PRIMARY KEY,
    language language_enum NOT NULL,
    name TEXT NOT NULL,
    type action_type_enum NOT NULL,
    hazard hazard_enum[] NULL,
    sector sector_enum[] NULL,
    subsector subsector_enum[] NULL,
    primary_purpose primary_purpose_enum[] NOT NULL,
    description TEXT,
    cobenefits JSONB NOT NULL,
    equity_and_inclusion_considerations TEXT,
    ghg_reduction_potential JSONB,
    adaptation_effectiveness adaptation_effectiveness_enum,
    adaptation_effectiveness_per_hazard JSONB,
    cost_investment_needed cost_investment_needed_enum,
    timeline_for_implementation timeline_for_implementation_enum,
    dependencies TEXT[] NULL,
    key_performance_indicators TEXT[] NULL,
    powers_and_mandates TEXT[] NULL,
    biome biome_enum
);
`;

const sql_down = `
    DROP TABLE IF EXISTS "ClimateActions";
    DROP TYPE IF EXISTS language_enum;
    DROP TYPE IF EXISTS biome_enum;
    DROP TYPE IF EXISTS timeline_for_implementation_enum;
    DROP TYPE IF EXISTS cost_investment_needed_enum;
    DROP TYPE IF EXISTS adaptation_effectiveness_enum;
    DROP TYPE IF EXISTS primary_purpose_enum;
    DROP TYPE IF EXISTS subsector_enum;
    DROP TYPE IF EXISTS sector_enum;
    DROP TYPE IF EXISTS hazard_enum;
    DROP TYPE IF EXISTS action_type_enum;
`;
/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
