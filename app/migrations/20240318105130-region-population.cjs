"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "Population",
      "region_population",
      Sequelize.BIGINT,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Population", "region_population");
  },
};
