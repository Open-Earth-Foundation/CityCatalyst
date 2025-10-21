"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make job_id nullable to support TO_DO status (not yet sent to AI API)
    await queryInterface.changeColumn("HighImpactActionRanking", "job_id", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "HIAP task ID - null or empty for TO_DO status, populated when sent to AI API",
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert: make job_id NOT NULL again
    // First, update any null values to empty string
    await queryInterface.sequelize.query(
      `UPDATE "HighImpactActionRanking" SET job_id = '' WHERE job_id IS NULL;`
    );

    await queryInterface.changeColumn("HighImpactActionRanking", "job_id", {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};


