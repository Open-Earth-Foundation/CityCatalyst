"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("City", "project_id", {
      type: Sequelize.UUID,
      allowNull: true, // allow true for now, but will be set to false in the future after backfilling
      references: {
        model: "Project",
        key: "project_id",
      },
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("City", {
      fields: ["project_id"],
      type: "foreign key",
      name: "FK_city_project_id",
      references: {
        table: "Project",
        field: "project_id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("City", "project_id");
    await queryInterface.removeConstraint("City", "FK_city_project_id");
  },
};
