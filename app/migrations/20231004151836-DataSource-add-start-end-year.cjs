"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("DataSource", "start_year", Sequelize.INTEGER, {
        transaction,
      });
      await queryInterface.addColumn("DataSource", "end_year", Sequelize.INTEGER, {
        transaction,
      });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("DataSource", "start_year", { transaction });
      await queryInterface.removeColumn("DataSource", "end_year", { transaction });
    });
  },
};
