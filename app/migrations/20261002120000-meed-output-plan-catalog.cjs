"use strict";

const REPORT_INDEX = "idx_meed_action_report_inventory_action_created_id";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex("MeedActionReport", {
      name: REPORT_INDEX,
      fields: ["inventory_id", "action_id", "created", "id"],
    });
    await queryInterface.addColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_plans_cursor_created",
      { type: Sequelize.DATE, allowNull: true },
    );
    await queryInterface.addColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_plans_cursor_id",
      { type: Sequelize.STRING(255), allowNull: true },
    );
    await queryInterface.addColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_plans_completed",
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_plans_completed",
    );
    await queryInterface.removeColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_plans_cursor_id",
    );
    await queryInterface.removeColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_plans_cursor_created",
    );
    await queryInterface.removeIndex("MeedActionReport", REPORT_INDEX);
  },
};
