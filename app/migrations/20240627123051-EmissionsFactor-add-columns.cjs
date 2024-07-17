'use strict';

const columns = ["actor_id", "methodology_name"];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      for (const column of columns) {
        await queryInterface.addColumn("EmissionsFactor", column, Sequelize.TEXT, { transaction });
      }
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      for (const column of columns) {
        await queryInterface.removeColumn("EmissionsFactor", column, { transaction });
      }
    });
  }
};
