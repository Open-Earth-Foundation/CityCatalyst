"use strict";
/** @type {import('sequelize-cli').Migration} */
/*
- Refresh tokens become opaque database rows instead of signed JWTs, so they
  can be rotated, revoked and introspected. Only the SHA-256 hash of a token is
  stored.
- Tokens that come from one authorization share a family_id. Using a token
  that was already rotated revokes the whole family.
- OAuthClient gets an optional secret hash. A client without one is a public
  client. A client with one is confidential and must authenticate at the token
  endpoint (client_secret_basic).
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("RefreshToken", {
      token_hash: {
        // Hex SHA-256 of the token handed to the client.
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
      },
      family_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      client_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: "OAuthClient", key: "client_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      scope: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      expires: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // Set when the token is exchanged for a new one. Using it again is a
      // sign that it was copied, and revokes the family.
      consumed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      // Set on every token of a family when the family is revoked.
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
    // Revoking a family looks up all of its tokens.
    await queryInterface.addIndex("RefreshToken", ["family_id"], {
      name: "idx_refresh_token_family_id",
    });
    // Revoking an app for a user looks up that user's tokens for the client.
    await queryInterface.addIndex("RefreshToken", ["client_id", "user_id"], {
      name: "idx_refresh_token_client_user",
    });
    // Lets the cleanup of old tokens find them quickly.
    await queryInterface.addIndex("RefreshToken", ["expires"], {
      name: "idx_refresh_token_expires",
    });

    await queryInterface.addColumn("OAuthClient", "client_secret_hash", {
      // Hex SHA-256 of the client secret. Null for a public client.
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("OAuthClient", "client_secret_hash");
    await queryInterface.dropTable("RefreshToken");
  },
};
