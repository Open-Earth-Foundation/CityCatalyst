"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("User", "number_format", {
      type: Sequelize.STRING(255),
      defaultValue: "default",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("User", "number_format");
  },
};
