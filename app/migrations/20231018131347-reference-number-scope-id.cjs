"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    queryInterface.addColumn("Sector", "reference_number", Sequelize.STRING);
    queryInterface.addColumn("SubSector", "reference_number", Sequelize.STRING);
    queryInterface.addColumn("SubCategory", "reference_number", Sequelize.STRING);
    queryInterface.addColumn("SubSector", "scope_id", Sequelize.UUID);
    queryInterface.addConstraint("SubSector", {
      type: "foreign key",
      name: "FK_SubSector_scope_id",
      fields: ["scope_id"],
      references: { table: "Scope", field: "scope_id" },
      onDelete: "SET NULL",
      onUpdate: "SET NULL",
    });
  },

  async down(queryInterface) {
    queryInterface.removeColumn("Sector", "reference_number");
    queryInterface.removeColumn("SubSector", "reference_number");
    queryInterface.removeColumn("SubCategory", "reference_number");
    queryInterface.removeColumn("SubSector", "scope_id");
  },
};
