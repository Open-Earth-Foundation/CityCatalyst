"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    queryInterface.addColumn("Sector", "reference_number", Sequelize.STRING);
    queryInterface.addColumn("SubSector", "reference_number", Sequelize.STRING);
    queryInterface.addColumn(
      "SubCategory",
      "reference_number",
      Sequelize.STRING,
    );
    queryInterface.addColumn("SubSector", "scope_id", Sequelize.UUID);
    queryInterface.addConstraint("SubSector", {
      type: "foreign key",
      name: "FK_SubSector_scope_id",
      fields: ["scope_id"],
      references: { table: "Scope", field: "scope_id" },
      onDelete: "SET NULL",
      onUpdate: "SET NULL",
    });
    queryInterface.dropTable("SubSectorScope");
  },

  async down(queryInterface) {
    queryInterface.removeColumn("Sector", "reference_number");
    queryInterface.removeColumn("SubSector", "reference_number");
    queryInterface.removeColumn("SubCategory", "reference_number");
    queryInterface.removeColumn("SubSector", "scope_id");
    queryInterface.sequelize.query(`
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
    `);
  },
};
