"use strict";
const { DataTypes } = require("sequelize");
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("FormulaInput", {
      gas: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      parameter_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      parameter_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      methodology_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      methodology_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Methodology",
          key: "methodology_id",
        },
        field: "methodology_id",
      },
      gpc_refno: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      formula_input_value: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      formula_input_units: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      formula_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      metadata: {
        type: DataTypes.JSONB, // PostgreSQL JSONB type
        allowNull: true,
      },
      region: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      datasource: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      rnk: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      formulainput_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("FormulaInput");
  },
};
