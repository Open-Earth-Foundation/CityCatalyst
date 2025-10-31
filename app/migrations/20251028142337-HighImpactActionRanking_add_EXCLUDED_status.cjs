"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add EXCLUDED status to the hiap_ranking_status enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "hiap_ranking_status" ADD VALUE 'EXCLUDED';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type and updating all references
    // For now, we'll leave the EXCLUDED value in place as it doesn't break anything
    console.log("Warning: Cannot remove enum value 'EXCLUDED' from hiap_ranking_status");
    console.log("This would require recreating the enum type and updating all references");
  },
};

