'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('UserFile', { 
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model:'User',
          key: 'user_id'
        }
      },
      file_reference: {
        type: Sequelize.STRING,
        allowNull: true
      },
      data: {
        type: Sequelize.BLOB,
        allowNull: true,
      },
      status:{
        type: Sequelize.STRING,
        allowNull: true
      },
      url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      gpc_ref_no: {
        type: Sequelize.STRING,
        allowNull: true
      },
 
      created: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP'),
      }
     });

  },

  async down (queryInterface, Sequelize) {
     await queryInterface.dropTable('UserFile');
  }
};
