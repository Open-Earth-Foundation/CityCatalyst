"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn(
      "EmissionsFactor",
      "region",
      Sequelize.TEXT,
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn(
      "EmissionsFactor",
      "region",
      Sequelize.VARCHAR(10),
    );
  },
};
