"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Organization", "user_id");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Organization", "user_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "User",
        key: "user_id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },
};
