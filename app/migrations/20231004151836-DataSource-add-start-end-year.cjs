"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      queryInterface.addColumn("DataSource", "start_year", Sequelize.INTEGER, {
        transaction,
      });
      queryInterface.addColumn("DataSource", "end_year", Sequelize.INTEGER, {
        transaction,
      });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      queryInterface.removeColumn("DataSource", "start_year", { transaction });
      queryInterface.removeColumn("DataSource", "end_year", { transaction });
    });
  },
};
