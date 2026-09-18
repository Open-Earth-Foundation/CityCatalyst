"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("BulkInventoryImportJob", "inventory_type", {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: "gpc_basic",
    });
    await queryInterface.addColumn(
      "BulkInventoryImportJob",
      "global_warming_potential_type",
      {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: "ar6",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "BulkInventoryImportJob",
      "global_warming_potential_type",
    );
    await queryInterface.removeColumn(
      "BulkInventoryImportJob",
      "inventory_type",
    );
  },
};
