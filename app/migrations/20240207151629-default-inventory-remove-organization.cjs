"use strict";

const { Sequelize, QueryTypes } = require("sequelize");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "User",
        "default_inventory_id",
        Sequelize.UUID,
        {
          transaction,
        },
      );
      await queryInterface.addConstraint("User", {
        type: "foreign key",
        name: "FK_User_default_inventory_id",
        fields: ["default_inventory_id"],
        references: {
          table: "Inventory",
          field: "inventory_id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
        transaction,
      });

      // find correct inventory IDs for previous values
      const users = await queryInterface.sequelize.query(
        `SELECT user_id, default_inventory_year, default_city_locode FROM "User"
        WHERE default_city_locode IS NOT NULL AND default_inventory_year IS NOT NULL;`,
        { transaction, type: QueryTypes.SELECT, raw: true },
      );
      for (const user of users) {
        const inventory = await queryInterface.sequelize.query(
          `SELECT inventory_id FROM "Inventory"
          LEFT JOIN "City" ON "Inventory".city_id = "City".city_id
          WHERE year = :year AND locode = :locode;`,
          {
            transaction,
            type: QueryTypes.SELECT,
            raw: true,
            plain: true, // only 1 result
            replacements: {
              year: user.default_inventory_year,
              locode: user.default_city_locode,
            },
          },
        );
        if (!inventory) {
          console.error(
            "Inventory not found for locode",
            user.default_city_locode,
            "and year",
            user.default_inventory_year,
          );
          continue;
        }
        await queryInterface.bulkUpdate(
          "User",
          { default_inventory_id: inventory.inventory_id },
          { user_id: user.user_id },
          { transaction },
        );
      }

      await queryInterface.removeColumn("User", "default_city_locode", {
        transaction,
      });
      await queryInterface.removeColumn("User", "default_inventory_year", {
        transaction,
      });
      await queryInterface.removeColumn("User", "is_organization", {
        transaction,
      });
      await queryInterface.removeColumn("User", "organization_id", {
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        "User",
        "default_inventory_id",
        Sequelize.STRING,
        {
          transaction,
        },
      );
      await queryInterface.addColumn(
        "User",
        "default_city_locode",
        Sequelize.STRING,
        {
          transaction,
        },
      );
      await queryInterface.addColumn(
        "User",
        "default_inventory_year",
        Sequelize.INTEGER,
        {
          transaction,
        },
      );
      await queryInterface.addColumn(
        "User",
        "is_organization",
        Sequelize.BOOLEAN,
        {
          transaction,
        },
      );
      await queryInterface.addColumn(
        "User",
        "organization_id",
        Sequelize.UUID,
        {
          transaction,
        },
      );
      await queryInterface.addConstraint("User", {
        type: "foreign key",
        name: "FK_User_organization_id",
        fields: ["organization_id"],
        references: {
          table: "User",
          field: "user_id",
        },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });
    });
  },
};
