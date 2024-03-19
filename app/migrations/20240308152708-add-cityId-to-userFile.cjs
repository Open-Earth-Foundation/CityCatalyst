'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('UserFile', 'city_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'City', 
        key: 'city_id', 
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('UserFile', 'city_id');
  }
};