"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add error_message column to store failure details
    await queryInterface.addColumn("HighImpactActionRanking", "error_message", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "Error message for failed prioritization jobs",
    });
  },

  async down(queryInterface) {
    // Remove error_message column
    await queryInterface.removeColumn("HighImpactActionRanking", "error_message");
  },
};


