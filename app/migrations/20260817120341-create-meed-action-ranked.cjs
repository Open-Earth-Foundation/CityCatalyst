"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("MeedActionRanked", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      inventory_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Inventory",
          key: "inventory_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      action_id: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      rank: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      final_score: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      lang: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_selected: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("MeedActionRanked");
  },
};
