"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("Version", "year", { transaction });
      await queryInterface.removeColumn("Version", "version", { transaction });
      await queryInterface.changeColumn(
        "Version",
        "inventory_id",
        {
          type: Sequelize.UUID,
          allowNull: false,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "Version",
        "author_id",
        {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: "User",
            key: "user_id",
          },
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "entry_id",
        {
          type: Sequelize.UUID,
          allowNull: false,
          comment: "ID of the table entry that was changed",
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "previous_version_id",
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: "Version",
            key: "version_id",
            comment: "ID of the previous version entry of the same table entry",
          },
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "table",
        {
          type: Sequelize.STRING,
          allowNull: false,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "data",
        {
          type: Sequelize.JSONB,
          allowNull: false,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "created",
        {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "last_updated",
        {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "Version",
        "year",
        { type: Sequelize.INTEGER },
        { transaction },
      );
      await queryInterface.addColumn(
        "Version",
        "version",
        { type: Sequelize.STRING },
        { transaction },
      );
      await queryInterface.changeColumn(
        "Version",
        "inventory_id",
        {
          type: Sequelize.UUID,
          allowNull: true,
        },
        { transaction },
      );

      await queryInterface.removeColumn("Version", "author_id", {
        transaction,
      });
      await queryInterface.removeColumn("Version", "entry_id", {
        transaction,
      });
      await queryInterface.removeColumn("Version", "previous_version_id", {
        transaction,
      });
      await queryInterface.removeColumn("Version", "table", { transaction });
      await queryInterface.removeColumn("Version", "data", { transaction });
      await queryInterface.removeColumn("Version", "created", { transaction });
      await queryInterface.removeColumn("Version", "last_updated", {
        transaction,
      });
    });
  },
};
