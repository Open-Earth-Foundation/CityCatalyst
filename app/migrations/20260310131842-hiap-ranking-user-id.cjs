"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("HighImpactActionRanking", "user_id", {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: "User",
        key: "user_id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("HighImpactActionRanking", "user_id");
  },
};
