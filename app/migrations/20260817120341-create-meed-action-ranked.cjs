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
      impact_score: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      alignment_score: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      feasibilityScore: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      evidenceSummary: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      // this contains keys for each language
      explanations: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      weights: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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
