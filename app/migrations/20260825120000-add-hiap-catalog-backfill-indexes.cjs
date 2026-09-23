"use strict";

const RANKED_ACTIONS_INDEX = "idx_hiap_ranked_hia_ranking_id";
const SUCCESS_RANKINGS_INDEX = "idx_hiap_ranking_success_created_id";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // These indexes are created concurrently because the tables are populated
    // in production and the backfill is not allowed to block live requests.
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY ${RANKED_ACTIONS_INDEX}
      ON "HighImpactActionRanked" (hia_ranking_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY ${SUCCESS_RANKINGS_INDEX}
      ON "HighImpactActionRanking" (status, created, id)
      WHERE status = 'SUCCESS';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS ${SUCCESS_RANKINGS_INDEX};`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS ${RANKED_ACTIONS_INDEX};`,
    );
  },
};
