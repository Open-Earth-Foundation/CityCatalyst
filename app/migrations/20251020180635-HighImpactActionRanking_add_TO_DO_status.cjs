"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add TO_DO status to the hiap_ranking_status enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "hiap_ranking_status" ADD VALUE 'TO_DO';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type and updating all references
    // For now, we'll leave the TO_DO value in place as it doesn't break anything
    console.log("Warning: Cannot remove enum value 'TO_DO' from hiap_ranking_status");
    console.log("This would require recreating the enum type and updating all references");
  },
};
