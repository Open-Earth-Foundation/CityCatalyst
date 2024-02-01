"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "Population",
      "country_population",
      Sequelize.BIGINT,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Population", "country_population");
  },
};
