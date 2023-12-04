"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "SubSectorValue",
        "unavailable_reason",
        Sequelize.TEXT,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubSectorValue",
        "unavailable_explanation",
        Sequelize.TEXT,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        "SubSectorValue",
        "unavailable_reason",
        { transaction },
      );
      await queryInterface.removeColumn(
        "SubSectorValue",
        "unavailable_explanation",
        { transaction },
      );
    });
  },
};
