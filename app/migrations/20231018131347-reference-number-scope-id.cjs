"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "Sector",
        "reference_number",
        Sequelize.STRING,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubSector",
        "reference_number",
        Sequelize.STRING,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubCategory",
        "reference_number",
        Sequelize.STRING,
        { transaction },
      );
      await queryInterface.addColumn("SubSector", "scope_id", Sequelize.UUID, {
        transaction,
      });
      await queryInterface.addConstraint("SubSector", {
        type: "foreign key",
        name: "FK_SubSector_scope_id",
        fields: ["scope_id"],
        references: { table: "Scope", field: "scope_id" },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });
      await queryInterface.dropTable("SubSectorScope", { transaction });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("Sector", "reference_number", {
        transaction,
      });
      await queryInterface.removeColumn("SubSector", "reference_number", {
        transaction,
      });
      await queryInterface.removeColumn("SubCategory", "reference_number", {
        transaction,
      });
      await queryInterface.removeColumn("SubSector", "scope_id", {
        transaction,
      });
      await queryInterface.sequelize.query(
        `
      CREATE TABLE "SubSectorScope" (
        "subsector_id" uuid,
        "scope_id" uuid,
        "created" timestamp,
        "last_updated" timestamp,
        PRIMARY KEY ("subsector_id", "scope_id"),
        CONSTRAINT "FK_SubSectorScope.subsector_id"
          FOREIGN KEY("subsector_id")
          REFERENCES "SubSector" ("subsector_id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_SubSectorScope.scope_id"
          FOREIGN KEY("scope_id")
          REFERENCES "Scope" ("scope_id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
    `,
        { transaction },
      );
    });
  },
};
