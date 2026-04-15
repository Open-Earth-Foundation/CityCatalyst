"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Module", "status", {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: "active",
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("Module", "status");
  },
};
