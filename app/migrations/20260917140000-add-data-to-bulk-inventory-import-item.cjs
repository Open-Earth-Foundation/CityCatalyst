"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("BulkInventoryImportItem", "data", {
      type: Sequelize.BLOB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("BulkInventoryImportItem", "data");
  },
};
