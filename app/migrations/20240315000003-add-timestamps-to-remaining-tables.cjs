"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add timestamps to Catalogue table
    await queryInterface.addColumn("Catalogue", "created", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    });

    // Add timestamps to GasToCO2Eq table (Could be removed if we're sticking to seed data only)
    await queryInterface.addColumn("GasToCO2Eq", "created", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    });
    await queryInterface.addColumn("GasToCO2Eq", "last_updated", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    });

    // Add timestamps to GasValue table
    await queryInterface.addColumn("GasValue", "created", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    });
    await queryInterface.addColumn("GasValue", "last_updated", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove timestamps from Catalogue table
    await queryInterface.removeColumn("Catalogue", "created");

    // Remove timestamps from GasToCO2Eq table
    await queryInterface.removeColumn("GasToCO2Eq", "created");
    await queryInterface.removeColumn("GasToCO2Eq", "last_updated");

    // Remove timestamps from GasValue table
    await queryInterface.removeColumn("GasValue", "created");
    await queryInterface.removeColumn("GasValue", "last_updated");
  },
};
