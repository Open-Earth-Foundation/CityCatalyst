"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Organization", "plan_type", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "full",
      comment: "Organization subscription plan: trial, demo, or full",
    });

    await queryInterface.addColumn("Organization", "trial_ends_at", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "When the trial plan expires (trial plan only)",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Organization", "trial_ends_at");
    await queryInterface.removeColumn("Organization", "plan_type");
  },
};
