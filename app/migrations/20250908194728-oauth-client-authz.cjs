'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OAuthClientAuthz', {
      client_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: {
          model: 'OAuthClient',
          key: 'client_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'User',
          key: 'user_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      last_used: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addConstraint('OAuthClientAuthz', {
      fields: ['client_id', 'user_id'],
      type: 'primary key',
      name: 'pk_oauthclientaccess_client_user',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('OAuthClientAuthz');
  },
};
