"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Set is_bulk = true for rankings where multiple rankings share the same job_id
    await queryInterface.sequelize.query(`
      UPDATE "HighImpactActionRanking" har
      SET is_bulk = true
      WHERE har.job_id IN (
        SELECT job_id
        FROM "HighImpactActionRanking"
        WHERE job_id IS NOT NULL
        GROUP BY job_id
        HAVING COUNT(*) > 1
      );
    `);
  },

  async down(queryInterface, Sequelize) {
    // Reset all is_bulk flags to false
    await queryInterface.sequelize.query(`
      UPDATE "HighImpactActionRanking"
      SET is_bulk = false;
    `);
  },
};
