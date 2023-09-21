"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "DataSource",
      "source_type",
      Sequelize.STRING,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("DataSource", "source_type");
  },
};
