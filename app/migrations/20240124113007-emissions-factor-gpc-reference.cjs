"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "EmissionsFactor",
      "gpc_reference_number",
      Sequelize.STRING,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "EmissionsFactor",
      "gpc_reference_number",
    );
  },
};
