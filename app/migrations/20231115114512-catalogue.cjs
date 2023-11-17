"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Catalogue", {
      type: {
        type: Sequelize.TEXT,
        allowNull: false,
        primaryKey: true,
      },
      last_update: Sequelize.DATE,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Catalogue");
  },
};
