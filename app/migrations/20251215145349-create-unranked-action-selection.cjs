'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('UnrankedActionSelection', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      inventory_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Inventory',
          key: 'inventory_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      action_id: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      action_type: {
        type: Sequelize.ENUM('mitigation', 'adaptation'),
        allowNull: false,
      },
      lang: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_selected: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add unique constraint for inventory_id, action_id, and lang combination
    await queryInterface.addIndex('UnrankedActionSelection', {
      fields: ['inventory_id', 'action_id', 'lang'],
      unique: true,
      name: 'UnrankedActionSelection_unique',
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('UnrankedActionSelection');
  }
};
