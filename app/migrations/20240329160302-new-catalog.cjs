"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("DataSource", "methodology_description", {
        type: Sequelize.TEXT,
        transaction,
      });
      await queryInterface.addColumn(
        "DataSource",
        "transformation_description",
        {
          type: Sequelize.TEXT,
          transaction,
        },
      );
      await queryInterface.addColumn("DataSource", "dataset_name", {
        type: Sequelize.TEXT,
        transaction,
      });
      await queryInterface.renameColumn(
        "DataSource",
        "name",
        "datasource_name",
        {
          transaction,
        },
      );
      await queryInterface.renameColumn(
        "DataSource",
        "description",
        "dataset_description",
        {
          transaction,
        },
      );
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        "DataSource",
        "methodology_description",
        {
          transaction,
        },
      );
      await queryInterface.removeColumn(
        "DataSource",
        "transformation_description",
        {
          transaction,
        },
      );
      await queryInterface.removeColumn("DataSource", "dataset_name", {
        transaction,
      });
      await queryInterface.renameColumn(
        "DataSource",
        "datasource_name",
        "name",
        {
          transaction,
        },
      );
      await queryInterface.renameColumn(
        "DataSource",
        "dataset_description",
        "description",
        {
          transaction,
        },
      );
    });
  },
};
