"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("ImportedInventoryFile", "content_digest", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "ImportedInventoryFile",
      "content_digest",
    );
  },
};
