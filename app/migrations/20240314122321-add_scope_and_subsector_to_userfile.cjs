'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('UserFile', 'scopes', {
      type: Sequelize.STRING,
      allowNull: true
    })
    await queryInterface.addColumn('UserFile', 'subsectors', {
      type: Sequelize.STRING,
      allowNull: true
    })
  },

  async down (queryInterface, Sequelize) {
   await queryInterface.removeColumn('UserFile', 'scopes');
   await queryInterface.removeColumn('UserFile', 'subsectors')
  }
};
