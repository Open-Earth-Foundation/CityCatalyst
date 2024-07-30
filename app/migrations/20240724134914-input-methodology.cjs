"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    queryInterface.addColumn(
      "InventoryValue",
      "input_methodology",
      Sequelize.TEXT,
    );
  },

  async down(queryInterface) {
    queryInterface.removeColumn("InventoryValue", "input_methodology");
  },
};
