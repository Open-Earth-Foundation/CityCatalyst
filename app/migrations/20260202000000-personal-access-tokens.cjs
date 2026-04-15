"use strict";

/** @type {import('sequelize-cli').Migration} */

/*

- Create table for Personal Access Tokens (PAT) for API/MCP authentication
- Each token is associated with a user and has scopes to limit access

*/

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("PersonalAccessToken", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "User",
          key: "user_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      token_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true,
      },
      token_prefix: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      scopes: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: ["read"],
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Create indexes
    await queryInterface.addIndex("PersonalAccessToken", {
      fields: ["user_id"],
      name: "PersonalAccessToken_user_id_idx",
    });

    await queryInterface.addIndex("PersonalAccessToken", {
      fields: ["token_hash"],
      name: "PersonalAccessToken_token_hash_idx",
      unique: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("PersonalAccessToken");
  },
};
