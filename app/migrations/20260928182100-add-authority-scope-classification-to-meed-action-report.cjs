"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "MeedActionReport",
      "authority_scope_classification",
      {
        type: Sequelize.JSONB,
        allowNull: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "MeedActionReport",
      "authority_scope_classification",
    );
  },
};
