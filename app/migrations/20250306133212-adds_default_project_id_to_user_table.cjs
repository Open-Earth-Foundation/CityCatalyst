"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("User", "default_project_id", {
      type: Sequelize.UUID,
      allowNull: true,
      foreignKey: true,
      references: {
        model: "Project",
        key: "project_id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("User", "default_project_id");
  },
};
