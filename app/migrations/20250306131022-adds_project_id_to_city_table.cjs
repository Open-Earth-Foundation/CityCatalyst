"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("City", "project_id", {
      type: Sequelize.UUID,
      allowNull: true, // allow true for now, but will be set to false in the future after backfilling
      foreignKey: true,
      references: {
        model: "Project",
        key: "project_id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("City", "project_id");
  },
};
