"use strict";

const sql_up = `
    CREATE TYPE action_type_enum AS ENUM ('mitigation', 'adaptation');
    CREATE TYPE adaptation_effectiveness_enum AS ENUM ('high', 'medium', 'low');
    CREATE TYPE cost_investment_needed_enum AS ENUM ('high', 'medium', 'low');
    CREATE TYPE timeline_for_implementation_enum AS ENUM ('<5 years', '5-10 years', '>10 years');
    CREATE TYPE biome_enum AS ENUM (
        'none', 'tropical_rainforest', 'temperate_forest', 'desert', 'grassland_savanna',
        'tundra', 'wetlands', 'mountains', 'boreal_forest_taiga', 'coastal_marine'
    );

    CREATE TABLE "HighImpactActionRanked" (
        id UUID default gen_random_uuid() not null PRIMARY KEY,
        hia_ranking_id UUID NOT NULL
            constraint HIRanking_HIARanking_hia_ranking_id_fk references "HighImpactActionRanking",
        lang TEXT NOT NULL,
        type action_type_enum NOT NULL,
        name TEXT NOT NULL,
        hazards TEXT[] NULL,
        sectors TEXT[] NULL,
        subsectors TEXT[] NULL,
        primary_purposes TEXT[] NULL,
        description TEXT,
        dependencies TEXT[],
        cobenefits JSONB,
        equity_and_inclusion_considerations TEXT,
        ghg_reduction_potential JSONB,
        adaptation_effectiveness adaptation_effectiveness_enum,
        adaptation_effectiveness_per_hazard JSONB,
        cost_investment_needed cost_investment_needed_enum,
        timeline_for_implementation timeline_for_implementation_enum,
        key_performance_indicators TEXT[],
        powers_and_mandates TEXT[],
        biome biome_enum,
        is_selected BOOLEAN NOT NULL DEFAULT FALSE,
        action_id TEXT NOT NULL,
        rank INTEGER NOT NULL,
        explanation JSONB NOT NULL,
        created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`;

const sql_down = `
    DROP TABLE IF EXISTS "HighImpactActionRanked";
    DROP TYPE IF EXISTS biome_enum;
    DROP TYPE IF EXISTS timeline_for_implementation_enum;
    DROP TYPE IF EXISTS cost_investment_needed_enum;
    DROP TYPE IF EXISTS adaptation_effectiveness_enum;
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
