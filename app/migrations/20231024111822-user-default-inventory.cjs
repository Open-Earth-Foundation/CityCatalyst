"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "User",
        "default_city_locode",
        Sequelize.CHAR,
        { transaction },
      );
      await queryInterface.addColumn(
        "User",
        "default_inventory_year",
        Sequelize.INTEGER,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("User", "default_city_locode", {
        transaction,
      });
      await queryInterface.removeColumn("User", "default_inventory_year", {
        transaction,
      });
    });
  },
};
