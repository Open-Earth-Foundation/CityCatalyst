
"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {

  async up(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('GasValue', 'FK_GasValue_activity_value_id');
    await queryInterface.addConstraint('GasValue', {
      fields: ['activity_value_id'],
      type: 'foreign key',
      name: 'FK_GasValue_activity_value_id',
      references: {
        table: 'ActivityValue',
        field: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('GasValue', 'FK_GasValue_activity_value_id');
    await queryInterface.addConstraint('GasValue', {
      fields: ['activity_value_id'],
      type: 'foreign key',
      name: 'FK_GasValue_activity_value_id',
      references: {
        table: 'ActivityValue',
        field: 'id'
      },
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION'
    });
  }
};
