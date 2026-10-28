"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("HiapCatalogBackfillCheckpoint", {
      job_key: {
        type: Sequelize.STRING(128),
        allowNull: false,
        primaryKey: true,
      },
      rankings_cursor_created: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      rankings_cursor_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      rankings_completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      action_plans_cursor_created: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      action_plans_cursor_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      action_plans_completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("HiapCatalogBackfillCheckpoint");
  },
};
