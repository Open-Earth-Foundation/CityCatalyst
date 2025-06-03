"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Organization", "active", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Indicates if the organization is active",
    });

    // Optional: Set the default value for existing rows
    await queryInterface.bulkUpdate("Organization", {
      active: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Organization", "active");
  },
};
