"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Version", "module_name", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "ghgi",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Version", "module_name");
  },
};
