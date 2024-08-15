'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('ActivityValue',
        'activity_data_jsonb', {
          type: Sequelize.DataTypes.JSONB,
          allowNull: true,
        });
  },

  async down (queryInterface, Sequelize) {
      await queryInterface.removeColumn('ActivityValue', 'activity_data_jsonb');
  }
};
