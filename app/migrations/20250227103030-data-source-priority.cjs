"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DataSourceI18n", "priority", {
      type: Sequelize.DOUBLE,
      nullable: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("DataSourceI18n", "priority");
  },
};
