"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("FormulaInput", "source", {
      type: Sequelize.STRING,
      allowNull: true,
      field: "source",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("FormulaInput", "source");
  },
};
