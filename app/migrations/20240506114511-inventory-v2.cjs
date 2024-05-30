"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Add table ActivityValue and connect to InventoryValue
      await queryInterface.sequelize.query(
        `CREATE TABLE "ActivityValue" (
          "id" uuid UNIQUE PRIMARY KEY NOT NULL,
          "activity_data" text,
          "inventory_value_id" uuid,
          "datasource_id" uuid,
          "metadata" jsonb,
          "created" timestamp,
          "last_updated" timestamp
        );`,
        { transaction },
      );
      await queryInterface.addConstraint("ActivityValue", {
        type: "foreign key",
        name: "FK_ActivityValue_inventory_value_id",
        fields: ["inventory_value_id"],
        references: { table: "InventoryValue", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        transaction,
      });
      await queryInterface.addConstraint("ActivityValue", {
        type: "foreign key",
        name: "FK_ActivityValue_datasource_id",
        fields: ["datasource_id"],
        references: { table: "DataSource", field: "datasource_id" },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });

      await queryInterface.addColumn(
        "GasValue",
        "activity_value_id",
        Sequelize.UUID,
        {
          transaction,
        },
      );
      await queryInterface.addConstraint("GasValue", {
        type: "foreign key",
        name: "FK_GasValue_activity_value_id",
        fields: ["activity_value_id"],
        references: { table: "ActivityValue", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        transaction,
      });

      // new columns for EmissionsFactor
      await queryInterface.addColumn(
        "EmissionsFactor",
        "metadata",
        Sequelize.JSONB,
        { transaction },
      );
      await queryInterface.addColumn(
        "EmissionsFactor",
        "formula_name",
        Sequelize.STRING,
        { transaction },
      );
      await queryInterface.addColumn(
        "EmissionsFactor",
        "methodology_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("EmissionsFactor", {
        type: "foreign key",
        name: "FK_EmissionsFactor_methodology_id",
        fields: ["methodology_id"],
        references: { table: "Methodology", field: "methodology_id" },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // EmissionsFactor
      await queryInterface.removeConstraint(
        "EmissionsFactor",
        "FK_EmissionsFactor_methodology_id",
        { transaction },
      );
      await queryInterface.removeColumn("EmissionsFactor", "reference", {
        transaction,
      });
      await queryInterface.removeColumn("EmissionsFactor", "year", {
        transaction,
      });
      await queryInterface.removeColumn("EmissionsFactor", "region", {
        transaction,
      });
      await queryInterface.removeColumn("EmissionsFactor", "methodology_id", {
        transaction,
      });
      await queryInterface.removeColumn("EmissionsFactor", "formula_name", {
        transaction,
      });
      await queryInterface.removeColumn("EmissionsFactor", "metadata", {
        transaction,
      });

      // ActivityValue
      await queryInterface.removeConstraint(
        "GasValue",
        "FK_GasValue_activity_value_id",
        { transaction },
      );
      await queryInterface.removeColumn("GasValue", "activity_value_id", {
        transaction,
      });
      await queryInterface.removeConstraint(
        "ActivityValue",
        "FK_ActivityValue_inventory_value_id",
        { transaction },
      );
      await queryInterface.dropTable("ActivityValue");
    });
  },
};
