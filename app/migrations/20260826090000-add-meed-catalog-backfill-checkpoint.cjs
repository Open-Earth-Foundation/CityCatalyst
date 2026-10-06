"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_rankings_cursor_created",
      { type: Sequelize.DATE, allowNull: true },
    );
    await queryInterface.addColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_rankings_cursor_id",
      { type: Sequelize.STRING(255), allowNull: true },
    );
    await queryInterface.addColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_rankings_completed",
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_rankings_completed",
    );
    await queryInterface.removeColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_rankings_cursor_id",
    );
    await queryInterface.removeColumn(
      "HiapCatalogBackfillCheckpoint",
      "meed_rankings_cursor_created",
    );
  },
};
