"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("MeedActionRemoved", {
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
      action_name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      removal_reason: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      removal_source: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      // legal sub-object
      verdict_category: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      ownership_category: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      restrictions_category: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      // these contain keys for each language
      ownership_description: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      restrictions_description: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      legal_justification: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      legal_references: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
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
    await queryInterface.dropTable("MeedActionRemoved");
  },
};
