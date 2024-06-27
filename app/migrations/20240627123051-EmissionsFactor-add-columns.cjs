'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("EmissionsFactor", "region", Sequelize.TEXT, { transaction });
      await queryInterface.addColumn("EmissionsFactor", "practices", Sequelize.TEXT, { transaction });
      await queryInterface.addColumn("EmissionsFactor", "properties", Sequelize.TEXT, { transaction });
      await queryInterface.addColumn("EmissionsFactor", "methodology", Sequelize.TEXT, { transaction });
      await queryInterface.addColumn("EmissionsFactor", "reference", Sequelize.TEXT, { transaction });
      await queryInterface.addColumn("EmissionsFactor", "parameters", Sequelize.TEXT, { transaction });
    });
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
    });
  }
};
