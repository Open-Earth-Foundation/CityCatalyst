"use strict";

const sql_up = `
    CREATE TYPE hiap_ranking_status AS ENUM ('PENDING', 'SUCCESS', 'FAILURE');
    CREATE TABLE "HighImpactActionRanking" (
        id UUID default gen_random_uuid() not null PRIMARY KEY,
        locode TEXT NOT NULL,
        inventory_id UUID NOT NULL
            constraint HIRanking_Inventory_inventory_id_fk references "Inventory",
        lang TEXT NOT NULL,
        job_id TEXT NULL,
        status hiap_ranking_status NOT NULL DEFAULT 'PENDING',
        created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`;

const sql_down = `
    DROP TABLE IF EXISTS "HighImpactActionRanking";
    DROP TYPE IF EXISTS hiap_ranking_status;
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
