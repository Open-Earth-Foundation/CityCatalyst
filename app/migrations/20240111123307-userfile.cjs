'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('UserFile', { 
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model:'User',
          key: 'user_id'
        }
      },
      fileReference: {
        type: Sequelize.STRING,
        allowNull: true
      },
      data: {
        type: Sequelize.BLOB,
        allowNull: true,
      },
      fileType: {
        type: Sequelize.STRING,
        allowNull: true
      },
      sector: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status:{
        type: Sequelize.STRING,
        allowNull: true
      },
      url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      gpcRefNo: {
        type: Sequelize.STRING,
        allowNull: true
      },
 
      created: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      lastUpdated: {
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
