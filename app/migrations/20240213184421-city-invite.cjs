'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('CityInvite', {
      id: {
        allowNull:false,
        primaryKey:true,
        type: Sequelize.UUIDV
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model:'User',
          key: 'user_id'
        }
      },
      city_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model:'City',
          key: 'city_id'
        }
      },
      invitation_code: {
        type: Sequelize.STRING,
        allowNull:false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull:false,
        defaultValue: 'pending'
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
    })
  },

  async down (queryInterface, Sequelize) {

    await queryInterface.dropTable('CityInvite');
  }
};
