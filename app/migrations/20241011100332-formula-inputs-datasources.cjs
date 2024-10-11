"use strict";

const { DataTypes } = require("sequelize");
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DataSourceFormulaInput", {
      datasource_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "DataSourceI18n",
          key: "datasource_id",
        },
        field: "datasource_id",
      },
      formulainput_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "FormulaInput",
          key: "formulainput_id",
        },
        field: "formulainput_id",
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
    await queryInterface.dropTable("DatasourceFormulaInput");
  },
};
