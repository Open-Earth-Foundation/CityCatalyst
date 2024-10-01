'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'Inventory',
      'total_country_emissions',
      {
        type: Sequelize.BIGINT,
        allowNull: true
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Inventory', 'total_country_emissions');
  }
};
