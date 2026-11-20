"use strict";
/** @type {import('sequelize-cli').Migration} */
/*
- Authorization codes become opaque database rows instead of signed JWTs.
- Only the SHA-256 hash of the code is stored. A code is single use: the token
  endpoint sets consumed_at with a conditional update, so a replay fails on any
  replica.
- Same columns as the AuthorizationCode table in core-identity-service, so the
  rows can move without translation.
*/
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("AuthorizationCode", {
      code_hash: {
        // Hex SHA-256 of the code handed to the client.
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
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
      // The redirect URI of the request. The token request must repeat it.
      redirect_uri: {
        type: Sequelize.STRING(2048),
        allowNull: false,
      },
      code_challenge: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      code_challenge_method: {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: "S256",
      },
      scope: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // Echoed into the id_token when the client sent one.
      nonce: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      expires: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // Set when the code is exchanged. A second exchange is a replay.
      consumed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
    // Lets the cleanup of expired codes find them quickly.
    await queryInterface.addIndex("AuthorizationCode", ["expires"], {
      name: "idx_authorization_code_expires",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("AuthorizationCode");
  },
};
