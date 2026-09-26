"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("BulkInventoryImportJob", "progress_stage", {
      type: Sequelize.STRING(64),
      allowNull: true,
      field: "progress_stage",
    });
    await queryInterface.addColumn("BulkInventoryImportJob", "progress_detail", {
      type: Sequelize.STRING(255),
      allowNull: true,
      field: "progress_detail",
    });
    await queryInterface.addColumn("BulkInventoryImportItem", "stage", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("BulkInventoryImportItem", "stage");
    await queryInterface.removeColumn(
      "BulkInventoryImportJob",
      "progress_detail",
    );
    await queryInterface.removeColumn(
      "BulkInventoryImportJob",
      "progress_stage",
    );
  },
};
