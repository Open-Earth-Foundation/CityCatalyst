"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("User", "default_project_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "Project",
        key: "project_id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("User", {
      fields: ["default_project_id"],
      type: "foreign key",
      name: "FK_user_default_project_id",
      references: {
        table: "Project",
        field: "project_id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint("User", "FK_user_default_project_id");
    await queryInterface.removeColumn("User", "default_project_id");
  },
};
