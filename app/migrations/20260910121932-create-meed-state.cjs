"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("MeedState", {
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

      exclusions: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      sectors: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      strategic_priorities: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      timeline: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },

      // weights
      impact_weight: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      alignment_weight: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      feasibility_weight: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      excluded_sectors: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      excluded_co_benefits: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      exclude_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    });
    await queryInterface.addIndex("MeedState", {
      fields: ["inventory_id"],
      unique: true,
      name: "MeedState_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("MeedState");
  },
};
