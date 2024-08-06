"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "ActivityValue",
        "co2eq",
        Sequelize.BIGINT,
        { transaction },
      );
      await queryInterface.addColumn(
        "ActivityValue",
        "co2eq_years",
        Sequelize.INTEGER,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("ActivityValue", "co2eq", {
        transaction,
      });
      await queryInterface.removeColumn("ActivityValue", "co2eq_years", {
        transaction,
      });
    });
  },
};
