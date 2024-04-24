"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "City",
        "country_locode",
        Sequelize.STRING,
        { transaction },
      );

      await queryInterface.addColumn(
        "City",
        "region_locode",
        Sequelize.STRING,
        {
          transaction,
        },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("City", "country_locode", {
        transaction,
      });
      await queryInterface.removeColumn("City", "region_locode", {
        transaction,
      });
    });
  },
};
